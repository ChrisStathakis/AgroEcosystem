import { getDb } from '../client';
import {
  SINGLE_PROFILE_ID,
  todayISODate,
  type AnalyticsFilters,
  type CashFlowRow,
  type CategoryTotal,
  type Expense,
  type FarmProfitRow,
  type FinancialSummary,
  type MonthlyRow,
  type ObligationsFarmRow,
  type ObligationsReport,
} from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { expenseAmountExpr, farmTreeWeights, shareRatio } from './split';

// Port of server/analytics/services.py for offline SQLite.
// Supports year OR custom start/end plus farm/category/vendor/customer/
// document/tax dimensions, allocation-aware farm profit, category
// breakdown, cumulative balance, P&L / cash-flow / tax / obligations
// reports. Expense figures are split-aware: a farm filter counts shared
// (farm-less) expenses at that farm's share by each row's own split basis
// (trees, variety, stremmata or equal), like `_split_aware_expense_total`
// on the server.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Share of shared expenses for the active farm filter (null = no farm
 * filter → plain sums, shared rows counted once in full).
 */
async function expenseRatioFor(f: AnalyticsFilters): Promise<number | null> {
  if (!f.farm_id) return null;
  return shareRatio(await farmTreeWeights(), f.farm_id);
}

export interface ResolvedPeriod {
  start: string;
  end: string;
  label: string;
  year: number | null;
}

export function resolvePeriod(filters: AnalyticsFilters = {}): ResolvedPeriod {
  const { year, start, end } = filters;
  if (!start && !end) {
    const y = year ?? new Date().getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y), year: y };
  }
  const s = start ?? `${(year ?? parseInt((end as string).slice(0, 4), 10))}-01-01`;
  const e = end ?? `${(year ?? parseInt((s as string).slice(0, 4), 10))}-12-31`;
  if (s.slice(0, 4) === e.slice(0, 4) && s.endsWith('-01-01') && e.endsWith('-12-31')) {
    return { start: s, end: e, label: s.slice(0, 4), year: parseInt(s.slice(0, 4), 10) };
  }
  const sameYear = s.slice(0, 4) === e.slice(0, 4);
  return { start: s, end: e, label: `${s} – ${e}`, year: year ?? (sameYear ? parseInt(s.slice(0, 4), 10) : null) };
}

function expenseWhere(f: AnalyticsFilters, p: ResolvedPeriod, includeShared = false): { sql: string; params: SQLiteBindValue[] } {
  let sql = 'e.profile_id = ? AND e.date >= ? AND e.date <= ?';
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID, p.start, p.end];
  if (f.farm_id) {
    // Shared expenses apply to every farm (server _apply_common); callers
    // that split shared rows by basis pass includeShared=false and add
    // the shared portion separately.
    sql += includeShared ? ' AND (e.farm_id = ? OR e.farm_id IS NULL)' : ' AND e.farm_id = ?';
    params.push(f.farm_id);
  }
  if (f.expense_category_id) {
    sql += ' AND e.category_id = ?';
    params.push(f.expense_category_id);
  }
  if (f.vendor_id) {
    sql += ' AND e.vendor_id = ?';
    params.push(f.vendor_id);
  }
  if (f.document_type) {
    sql += ' AND e.document_type = ?';
    params.push(f.document_type);
  }
  if (f.tax === 'taxed') sql += ' AND e.include_in_tax = 1';
  else if (f.tax === 'untaxed') sql += ' AND e.include_in_tax = 0';
  return { sql, params };
}

function incomeWhere(f: AnalyticsFilters, p: ResolvedPeriod): { sql: string; params: SQLiteBindValue[] } {
  let sql = 'i.profile_id = ? AND i.date >= ? AND i.date <= ?';
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID, p.start, p.end];
  if (f.farm_id) {
    sql += ' AND EXISTS (SELECT 1 FROM income_farm_allocations ia WHERE ia.income_id = i.id AND ia.farm_id = ?)';
    params.push(f.farm_id);
  }
  if (f.income_category_id) {
    sql += ' AND i.category_id = ?';
    params.push(f.income_category_id);
  }
  if (f.customer_id) {
    sql += ' AND i.customer_id = ?';
    params.push(f.customer_id);
  }
  if (f.document_type) {
    sql += ' AND i.document_type = ?';
    params.push(f.document_type);
  }
  if (f.tax === 'taxed') sql += ' AND i.include_in_tax = 1';
  else if (f.tax === 'untaxed') sql += ' AND i.include_in_tax = 0';
  return { sql, params };
}

function monthBuckets(start: string, end: string): Array<{ y: number; m: number }> {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: Array<{ y: number; m: number }> = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ y, m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function monthLabel(y: number, m: number, singleYear: boolean): string {
  return singleYear ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

/** Split-basis weights per farm (port of server expenses.models.basis_weights). */
async function basisWeights(
  basis: string | null | undefined,
  treeTypeId: number | null | undefined,
): Promise<{ weights: Map<number, number>; total: number }> {
  const db = getDb();
  const farms = await db.getAllAsync<{ id: number; size: number }>(
    'SELECT id, size FROM farms WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const weights = new Map<number, number>();
  const b = basis ?? 'trees';
  if (b === 'area') {
    for (const f of farms) weights.set(f.id, Number(f.size) || 0);
  } else if (b === 'tree_type' && treeTypeId) {
    const rows = await db.getAllAsync<{ farm_id: number; total: number }>(
      'SELECT farm_id, COALESCE(SUM(count),0) AS total FROM tree_plantings WHERE profile_id = ? AND tree_type_id = ? GROUP BY farm_id',
      [SINGLE_PROFILE_ID, treeTypeId]);
    for (const f of farms) weights.set(f.id, 0);
    for (const r of rows) weights.set(r.farm_id, r.total ?? 0);
  } else if (b === 'equal') {
    for (const f of farms) weights.set(f.id, 1);
  } else {
    const rows = await db.getAllAsync<{ farm_id: number; total: number }>(
      'SELECT farm_id, COALESCE(SUM(count),0) AS total FROM tree_plantings WHERE profile_id = ? GROUP BY farm_id',
      [SINGLE_PROFILE_ID]);
    for (const f of farms) weights.set(f.id, 0);
    for (const r of rows) weights.set(r.farm_id, r.total ?? 0);
  }
  const total = [...weights.values()].reduce((a, x) => a + x, 0);
  return { weights, total };
}

function basisRatio(weights: Map<number, number>, total: number, farmId: number): number {
  if (!weights.has(farmId)) return 0;
  if (total > 0) return (weights.get(farmId) ?? 0) / total;
  if (weights.size === 0) return 0;
  return 1 / weights.size;
}

/** Shared-expense totals grouped by (split_basis, split_tree_type_id), honoring non-farm filters. */
async function sharedExpenseGroups(
  f: AnalyticsFilters, p: ResolvedPeriod, taxedOnly = false,
): Promise<Array<{ basis: string; tree_type_id: number | null; total: number }>> {
  const db = getDb();
  let sql = 'e.profile_id = ? AND e.date >= ? AND e.date <= ? AND e.farm_id IS NULL';
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID, p.start, p.end];
  if (f.expense_category_id) { sql += ' AND e.category_id = ?'; params.push(f.expense_category_id); }
  if (f.vendor_id) { sql += ' AND e.vendor_id = ?'; params.push(f.vendor_id); }
  if (f.document_type) { sql += ' AND e.document_type = ?'; params.push(f.document_type); }
  if (taxedOnly || f.tax === 'taxed') sql += ' AND e.include_in_tax = 1';
  else if (f.tax === 'untaxed') sql += ' AND e.include_in_tax = 0';
  const rows = await db.getAllAsync<{ basis: string; tree_type_id: number | null; total: number }>(
    `SELECT e.split_basis AS basis, e.split_tree_type_id AS tree_type_id, COALESCE(SUM(e.amount),0) AS total
     FROM expenses e WHERE ${sql} GROUP BY e.split_basis, e.split_tree_type_id`, params);
  return rows;
}

async function sharedSplitForFarm(
  f: AnalyticsFilters, p: ResolvedPeriod, farmId: number, taxedOnly = false,
): Promise<number> {
  const groups = await sharedExpenseGroups(f, p, taxedOnly);
  let share = 0;
  const cache = new Map<string, { weights: Map<number, number>; total: number }>();
  for (const g of groups) {
    if (!g.total) continue;
    const key = `${g.basis ?? 'trees'}:${g.tree_type_id ?? ''}`;
    if (!cache.has(key)) cache.set(key, await basisWeights(g.basis, g.tree_type_id));
    const { weights, total } = cache.get(key)!;
    share += g.total * basisRatio(weights, total, farmId);
  }
  return share;
}

/** Shared-expense monthly totals grouped by (month, basis, tree type), honoring non-farm filters. */
async function sharedMonthlyGroups(
  f: AnalyticsFilters, p: ResolvedPeriod,
): Promise<Array<{ m: string; basis: string; tree_type_id: number | null; total: number }>> {
  const db = getDb();
  let sql = 'e.profile_id = ? AND e.date >= ? AND e.date <= ? AND e.farm_id IS NULL';
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID, p.start, p.end];
  if (f.expense_category_id) { sql += ' AND e.category_id = ?'; params.push(f.expense_category_id); }
  if (f.vendor_id) { sql += ' AND e.vendor_id = ?'; params.push(f.vendor_id); }
  if (f.document_type) { sql += ' AND e.document_type = ?'; params.push(f.document_type); }
  if (f.tax === 'taxed') sql += ' AND e.include_in_tax = 1';
  else if (f.tax === 'untaxed') sql += ' AND e.include_in_tax = 0';
  return db.getAllAsync(
    `SELECT substr(e.date,1,7) AS m, e.split_basis AS basis, e.split_tree_type_id AS tree_type_id,
       COALESCE(SUM(e.amount),0) AS total FROM expenses e WHERE ${sql} GROUP BY m, e.split_basis, e.split_tree_type_id`,
    params,
  );
}

/** Direct (farm-bound) expense total for one farm, honoring non-farm filters. */
async function directFarmTotal(
  f: AnalyticsFilters, p: ResolvedPeriod, farmId: number, taxedOnly = false,
): Promise<number> {
  const db = getDb();
  let sql = 'e.profile_id = ? AND e.date >= ? AND e.date <= ? AND e.farm_id = ?';
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID, p.start, p.end, farmId];
  if (f.expense_category_id) { sql += ' AND e.category_id = ?'; params.push(f.expense_category_id); }
  if (f.vendor_id) { sql += ' AND e.vendor_id = ?'; params.push(f.vendor_id); }
  if (f.document_type) { sql += ' AND e.document_type = ?'; params.push(f.document_type); }
  if (taxedOnly || f.tax === 'taxed') sql += ' AND e.include_in_tax = 1';
  else if (f.tax === 'untaxed') sql += ' AND e.include_in_tax = 0';
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(e.amount),0) AS total FROM expenses e WHERE ${sql}`, params);
  return row?.total ?? 0;
}

/** Back-compat: financialSummary(year?) still works; pass filters for full parity. */
export async function financialSummary(yearOrFilters?: number | AnalyticsFilters): Promise<FinancialSummary> {
  const filters: AnalyticsFilters = typeof yearOrFilters === 'number' ? { year: yearOrFilters } : (yearOrFilters ?? {});
  if (typeof yearOrFilters === 'undefined') filters.year = new Date().getFullYear();
  const p = resolvePeriod(filters);
  const db = getDb();
  const ew = expenseWhere(filters, p);
  const iw = incomeWhere(filters, p);
  // Shared expenses are counted at the filtered farm's share (server: farm = f.get("farm")).
  const expExpr = expenseAmountExpr('e', await expenseRatioFor(filters));
  const sum = async (
    table: 'expenses' | 'incomes',
    amountExpr: string,
    extra: string,
    w: { sql: string; params: SQLiteBindValue[] },
  ) => {
    const row = await db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(${amountExpr}) AS total FROM ${table} ${table === 'expenses' ? 'e' : 'i'} WHERE ${w.sql} ${extra}`,
      w.params,
    );
    return row?.total ?? 0;
  };
  const income_total = await sum('incomes', '', iw);
  const taxable_income = await sum('incomes', 'AND include_in_tax = 1', iw);
  let expense_total = await sum('expenses', '', ew);
  let deductible_expenses: number;
  if (filters.farm_id) {
    // Direct rows plus each shared group split by its own basis.
    expense_total = (await directFarmTotal(filters, p, filters.farm_id, false))
      + (await sharedSplitForFarm(filters, p, filters.farm_id));
    deductible_expenses = (await directFarmTotal(filters, p, filters.farm_id, true))
      + (await sharedSplitForFarm({ ...filters, tax: 'all' }, p, filters.farm_id, true));
  } else {
    deductible_expenses = await sum('expenses', 'AND include_in_tax = 1', ew);
  }

  const byMonth = async (income: boolean) => {
    const ww = income ? incomeWhere(filters, p) : expenseWhere(filters, p);
    const alias = income ? 'i' : 'e';
    const table = income ? 'incomes' : 'expenses';
    const amountExpr = income ? 'i.amount' : expExpr;
    const rows = await db.getAllAsync<{ m: string; total: number }>(
      `SELECT substr(${alias}.date,1,7) AS m, SUM(${amountExpr}) AS total FROM ${table} ${alias} WHERE ${ww.sql} GROUP BY m`,
      ww.params,
    );
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.m, r.total);
    if (!income && filters.farm_id) {
      // Recompute farm-filtered expense months: direct rows plus each
      // shared month-group split by its own basis (shared rows are
      // included by expenseWhere but must not count in full).
      const directRows = await db.getAllAsync<{ m: string; total: number }>(
        `SELECT substr(e.date,1,7) AS m, COALESCE(SUM(e.amount),0) AS total FROM expenses e WHERE e.profile_id = ? AND e.date >= ? AND e.date <= ? AND e.farm_id = ?` +
        (filters.expense_category_id ? ' AND e.category_id = ?' : '') +
        (filters.vendor_id ? ' AND e.vendor_id = ?' : '') +
        (filters.document_type ? ' AND e.document_type = ?' : '') +
        (filters.tax === 'taxed' ? ' AND e.include_in_tax = 1' : filters.tax === 'untaxed' ? ' AND e.include_in_tax = 0' : '') +
        ' GROUP BY m',
        [SINGLE_PROFILE_ID, p.start, p.end, filters.farm_id,
          ...(filters.expense_category_id ? [filters.expense_category_id] : []),
          ...(filters.vendor_id ? [filters.vendor_id] : []),
          ...(filters.document_type ? [filters.document_type] : [])],
      ).catch(() => [] as Array<{ m: string; total: number }>);
      const fixed = new Map<string, number>();
      for (const r of directRows) fixed.set(r.m, r.total ?? 0);
      const sharedMonths = await sharedMonthlyGroups(filters, p);
      const cache = new Map<string, { weights: Map<number, number>; total: number }>();
      for (const g of sharedMonths) {
        if (!g.total) continue;
        const key = `${g.basis ?? 'trees'}:${g.tree_type_id ?? ''}`;
        if (!cache.has(key)) cache.set(key, await basisWeights(g.basis, g.tree_type_id));
        const { weights, total } = cache.get(key)!;
        fixed.set(g.m, (fixed.get(g.m) ?? 0) + g.total * basisRatio(weights, total, filters.farm_id));
      }
      return fixed;
    }
    return map;
  };
  const im = await byMonth(true);
  const em = await byMonth(false);
  const buckets = monthBuckets(p.start, p.end);
  const singleYear = p.start.slice(0, 4) === p.end.slice(0, 4);
  const monthly: MonthlyRow[] = buckets.map(({ y, m }) => {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const income = im.get(key) ?? 0;
    const expense = em.get(key) ?? 0;
    const label = monthLabel(y, m, singleYear);
    return { year: y, month: m, label, full_label: singleYear ? `${label} ${y}` : label, income, expense, balance: income - expense };
  });
  return {
    year: p.year ?? parseInt(p.start.slice(0, 4), 10),
    period_label: p.label,
    start: p.start,
    end: p.end,
    income_total,
    expense_total,
    balance: income_total - expense_total,
    taxable_income,
    deductible_expenses,
    taxable_net: taxable_income - deductible_expenses,
    has_activity: Boolean(income_total || expense_total),
    monthly,
  };
}

export async function categoryBreakdown(
  filters: AnalyticsFilters = {},
  limit = 8,
): Promise<{ period_label: string; start: string; end: string; expenses: CategoryTotal[]; incomes: CategoryTotal[] }> {
  const p = resolvePeriod(filters.year || filters.start || filters.end ? filters : { ...filters, year: new Date().getFullYear() });
  const db = getDb();
  const ew = expenseWhere(filters, p);
  const iw = incomeWhere(filters, p);
  const expExpr = expenseAmountExpr('e', await expenseRatioFor(filters));
  const top = async (income: boolean): Promise<CategoryTotal[]> => {
    const w = income ? iw : ew;
    const alias = income ? 'i' : 'e';
    const table = income ? 'incomes' : 'expenses';
    const catTable = income ? 'income_categories' : 'expense_categories';
    // With a farm filter, shared rows are merged per-basis below, so the
    // base query counts direct rows only (no double count).
    const directW = (!income && filters.farm_id)
      ? { sql: w.sql.replace('(e.farm_id = ? OR e.farm_id IS NULL)', 'e.farm_id = ?'), params: w.params }
      : w;
    const amountExpr = income ? 'i.amount' : (!income && filters.farm_id ? 'e.amount' : expExpr);
    const rows = await db.getAllAsync<{ label: string | null; total: number }>(
      `SELECT c.name AS label, SUM(${amountExpr}) AS total FROM ${table} ${alias}
       JOIN ${catTable} c ON c.id = ${alias}.category_id WHERE ${directW.sql}
       GROUP BY ${alias}.category_id ORDER BY total DESC`,
      directW.params,
    );
    let items = rows.map((r) => ({ label: r.label ?? '—', total: r.total ?? 0 }));
    if (!income && filters.farm_id) {
      // Merge each shared category group split by its own basis.
      let sharedSql = 'e.profile_id = ? AND e.date >= ? AND e.date <= ? AND e.farm_id IS NULL';
      const sharedParams: SQLiteBindValue[] = [SINGLE_PROFILE_ID, p.start, p.end];
      if (filters.expense_category_id) { sharedSql += ' AND e.category_id = ?'; sharedParams.push(filters.expense_category_id); }
      if (filters.vendor_id) { sharedSql += ' AND e.vendor_id = ?'; sharedParams.push(filters.vendor_id); }
      if (filters.document_type) { sharedSql += ' AND e.document_type = ?'; sharedParams.push(filters.document_type); }
      if (filters.tax === 'taxed') sharedSql += ' AND e.include_in_tax = 1';
      else if (filters.tax === 'untaxed') sharedSql += ' AND e.include_in_tax = 0';
      const sharedRows = await db.getAllAsync<{ label: string | null; basis: string; tree_type_id: number | null; total: number }>(
        `SELECT c.name AS label, e.split_basis AS basis, e.split_tree_type_id AS tree_type_id, SUM(e.amount) AS total
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE ${sharedSql}
         GROUP BY e.category_id, e.split_basis, e.split_tree_type_id`, sharedParams);
      const cache = new Map<string, { weights: Map<number, number>; total: number }>();
      const byLabel = new Map(items.map((i) => [i.label, i.total]));
      for (const r of sharedRows) {
        if (!r.total) continue;
        const key = `${r.basis ?? 'trees'}:${r.tree_type_id ?? ''}`;
        if (!cache.has(key)) cache.set(key, await basisWeights(r.basis, r.tree_type_id));
        const { weights, total } = cache.get(key)!;
        const label = r.label ?? '—';
        byLabel.set(label, (byLabel.get(label) ?? 0) + r.total * basisRatio(weights, total, filters.farm_id));
      }
      items = [...byLabel.entries()].map(([label, total]) => ({ label, total }));
      items.sort((a, b) => b.total - a.total);
    }
    if (items.length > limit) {
      const rest = items.slice(limit - 1).reduce((a, b) => a + b.total, 0);
      items = [...items.slice(0, limit - 1), { label: 'Other', total: rest }];
    }
    return items;
  };
  return { period_label: p.label, start: p.start, end: p.end, expenses: await top(false), incomes: await top(true) };
}

/** Per-farm income uses allocation amounts; unallocated income reconciles the global total. */
export async function farmProfit(yearOrFilters?: number | AnalyticsFilters): Promise<FarmProfitRow[]> {
  const filters: AnalyticsFilters = typeof yearOrFilters === 'number' ? { year: yearOrFilters } : (yearOrFilters ?? {});
  if (typeof yearOrFilters === 'undefined') filters.year = new Date().getFullYear();
  const p = resolvePeriod(filters);
  const db = getDb();
  let farmSql = 'SELECT id, title FROM farms WHERE profile_id = ? ORDER BY title';
  const farmParams: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (filters.farm_id) {
    farmSql = 'SELECT id, title FROM farms WHERE profile_id = ? AND id = ? ORDER BY title';
    farmParams.push(filters.farm_id);
  }
  const farms = await db.getAllAsync<{ id: number; title: string }>(farmSql, farmParams);
  const weights = await farmTreeWeights();
  const rows: FarmProfitRow[] = [];
  for (const farm of farms) {
    let allocSql = `SELECT COALESCE(SUM(ia.amount),0) AS total FROM income_farm_allocations ia
      JOIN incomes i ON i.id = ia.income_id WHERE ia.profile_id = ? AND ia.farm_id = ? AND i.date >= ? AND i.date <= ?`;
    const allocParams: SQLiteBindValue[] = [SINGLE_PROFILE_ID, farm.id, p.start, p.end];
    if (filters.income_category_id) {
      allocSql += ' AND i.category_id = ?';
      allocParams.push(filters.income_category_id);
    }
    if (filters.customer_id) {
      allocSql += ' AND i.customer_id = ?';
      allocParams.push(filters.customer_id);
    }
    if (filters.document_type) {
      allocSql += ' AND i.document_type = ?';
      allocParams.push(filters.document_type);
    }
    if (filters.tax === 'taxed') allocSql += ' AND i.include_in_tax = 1';
    else if (filters.tax === 'untaxed') allocSql += ' AND i.include_in_tax = 0';
    const income = (await db.getFirstAsync<{ total: number }>(allocSql, allocParams))?.total ?? 0;
    const ew = expenseWhere({ ...filters, farm_id: farm.id }, p);
    // Direct rows only here (shared portion is added per-basis below).
    const directSql = ew.sql.replace('(e.farm_id = ? OR e.farm_id IS NULL)', 'e.farm_id = ?');
    const directExpense =
      (
        await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(${expenseAmountExpr('e', shareRatio(weights, farm.id))}),0) AS total FROM expenses e WHERE ${directSql}`,
          ew.params,
        )
      )?.total ?? 0;
    const expense = directExpense + (await sharedSplitForFarm(filters, p, farm.id));
    rows.push({ farm: farm.title, income, expense, net: income - expense });
  }
  if (!filters.farm_id) {
    const iw = incomeWhere(filters, p);
    const total = (await db.getFirstAsync<{ total: number }>(`SELECT COALESCE(SUM(i.amount),0) AS total FROM incomes i WHERE ${iw.sql}`, iw.params))?.total ?? 0;
    const allocated =
      (
        await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(ia.amount),0) AS total FROM income_farm_allocations ia JOIN incomes i ON i.id = ia.income_id WHERE ia.profile_id = ? AND i.date >= ? AND i.date <= ?`,
          [SINGLE_PROFILE_ID, p.start, p.end],
        )
      )?.total ?? 0;
    // Server adds the row when remainder is truthy (non-zero, either sign).
    const unallocated = total - allocated;
    if (Math.abs(unallocated) > 0.000001) rows.push({ farm: 'Unallocated', income: unallocated, expense: 0, net: unallocated });
  }
  return rows.sort((a, b) => b.net - a.net);
}

export async function cumulativeBalance(filters: AnalyticsFilters = {}): Promise<{ labels: string[]; cumulative: number[]; monthly: MonthlyRow[] }> {
  const summary = await financialSummary(filters.year || filters.start || filters.end ? filters : { ...filters, year: new Date().getFullYear() });
  let running = 0;
  const cumulative: number[] = [];
  const labels: string[] = [];
  for (const m of summary.monthly) {
    running += m.balance;
    cumulative.push(running);
    labels.push(m.label);
  }
  return { labels, cumulative, monthly: summary.monthly };
}

export async function profitLossReport(filters: AnalyticsFilters = {}) {
  const summary = await financialSummary(filters);
  const farms = await farmProfit(filters);
  const cats = await categoryBreakdown(filters);
  return {
    period_label: summary.period_label,
    start: summary.start,
    end: summary.end,
    year: summary.year,
    income_total: summary.income_total,
    expense_total: summary.expense_total,
    net: summary.balance,
    monthly: summary.monthly,
    farms,
    expense_categories: cats.expenses,
    income_categories: cats.incomes,
  };
}

export async function cashFlowReport(filters: AnalyticsFilters = {}) {
  const summary = await financialSummary(filters);
  const cum = await cumulativeBalance(filters);
  let running = 0;
  const rows: CashFlowRow[] = summary.monthly.map((m, i) => {
    running = cum.cumulative[i] ?? running + m.balance;
    return { ...m, running };
  });
  return {
    period_label: summary.period_label,
    start: summary.start,
    end: summary.end,
    year: summary.year,
    rows,
    labels: cum.labels,
    cumulative: cum.cumulative,
    income_total: summary.income_total,
    expense_total: summary.expense_total,
    net: summary.balance,
  };
}

export async function taxReport(filters: AnalyticsFilters = {}) {
  const taxed = { ...filters, tax: 'taxed' as const };
  const p = resolvePeriod(filters.year || filters.start || filters.end ? filters : { ...filters, year: new Date().getFullYear() });
  const db = getDb();
  const iw = incomeWhere(taxed, p);
  const ew = expenseWhere(taxed, p, true);
  // Join names so the report/CSV print labels instead of raw ids (server uses select_related).
  const incomes = await db.getAllAsync(
    `SELECT i.*, c.name AS category_name, cu.name AS contact_name,
            (SELECT GROUP_CONCAT(f.title || ' (' || printf('%.2f', ia.amount) || ')', ', ')
             FROM income_farm_allocations ia JOIN farms f ON f.id = ia.farm_id WHERE ia.income_id = i.id) AS farm_summary,
            i.amount - COALESCE((SELECT SUM(ia.amount) FROM income_farm_allocations ia WHERE ia.income_id = i.id), 0) AS unallocated_amount
     FROM incomes i
     LEFT JOIN income_categories c ON c.id = i.category_id
     LEFT JOIN customers cu ON cu.id = i.customer_id
     WHERE ${iw.sql} ORDER BY i.date, i.id`,
    iw.params,
  );
  const expenses = await db.getAllAsync(
    `SELECT e.*, f.title AS farm_title, c.name AS category_name, v.name AS contact_name
     FROM expenses e
     LEFT JOIN farms f ON f.id = e.farm_id
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN vendors v ON v.id = e.vendor_id
     WHERE ${ew.sql} ORDER BY e.date, e.id`,
    ew.params,
  );
  const summary = await financialSummary(filters);
  return {
    period_label: p.label,
    start: p.start,
    end: p.end,
    incomes: incomes as any[],
    expenses: expenses as any[],
    income_total: summary.taxable_income,
    expense_total: summary.deductible_expenses,
    net: summary.taxable_net,
  };
}

/**
 * Port of analytics.services.obligations_report: unpaid expenses for the
 * filtered period with totals, overdue figures and a per-farm split of the
 * shared (farm-less) rows by their own basis.
 */
export async function obligationsReport(filters: AnalyticsFilters = {}): Promise<ObligationsReport> {
  const p = resolvePeriod(filters.year || filters.start || filters.end ? filters : { ...filters, year: new Date().getFullYear() });
  const db = getDb();
  const ew = expenseWhere(filters, p);
  const unpaidSql = `${ew.sql} AND e.is_paid = 0`;
  const ratio = await expenseRatioFor(filters);
  const expExpr = expenseAmountExpr('e', ratio);
  const today = todayISODate();
  const params = [...ew.params];

  const sumUnpaid = async (sql: string, pms: SQLiteBindValue[]): Promise<number> => {
    const row = await db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(${expExpr}), 0) AS total FROM expenses e WHERE ${sql}`,
      pms,
    );
    return row?.total ?? 0;
  };

  // Shared (farm-less) rows split by their own basis, like the server.
  const sharedSplit = async (baseSql: string, extraParams: SQLiteBindValue[], farmId: number): Promise<number> => {
    const groups = await db.getAllAsync<{ basis: string; tree_type_id: number | null; total: number }>(
      `SELECT e.split_basis AS basis, e.split_tree_type_id AS tree_type_id, COALESCE(SUM(e.amount),0) AS total
       FROM expenses e WHERE ${baseSql} AND e.farm_id IS NULL
       GROUP BY e.split_basis, e.split_tree_type_id`,
      [...params, ...extraParams],
    );
    let share = 0;
    const cache = new Map<string, { weights: Map<number, number>; total: number }>();
    for (const g of groups) {
      if (!g.total) continue;
      const key = `${g.basis ?? 'trees'}:${g.tree_type_id ?? ''}`;
      if (!cache.has(key)) cache.set(key, await basisWeights(g.basis, g.tree_type_id));
      const { weights: w, total } = cache.get(key)!;
      share += g.total * basisRatio(w, total, farmId);
    }
    return share;
  };

  const directUnpaid = async (farmId: number | null, baseSql: string, extraParams: SQLiteBindValue[]): Promise<number> => {
    const row = await db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(e.amount), 0) AS total FROM expenses e WHERE ${baseSql}` +
      (farmId == null ? '' : ' AND e.farm_id = ?'),
      farmId == null ? [...params, ...extraParams] : [...params, ...extraParams, farmId],
    );
    return row?.total ?? 0;
  };

  const unpaid_total = filters.farm_id
    ? (await directUnpaid(filters.farm_id, unpaidSql, [])) + (await sharedSplit(unpaidSql, [], filters.farm_id))
    : await sumUnpaid(unpaidSql, params);
  const overdueSql = `${unpaidSql} AND e.date < ?`;
  const overdue_total = filters.farm_id
    ? (await directUnpaid(filters.farm_id, overdueSql, [today])) + (await sharedSplit(overdueSql, [today], filters.farm_id))
    : await sumUnpaid(overdueSql, [...params, today]);

  const items = await db.getAllAsync<Expense & { is_overdue: boolean }>(
    `SELECT e.*, f.title AS farm_title, c.name AS category_name, v.name AS contact_name,
            (e.date < ?) AS is_overdue
     FROM expenses e
     LEFT JOIN farms f ON f.id = e.farm_id
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN vendors v ON v.id = e.vendor_id
     WHERE ${unpaidSql} ORDER BY e.date, e.id`,
    [today, ...params],
  );

  let farmSql = 'SELECT id, title FROM farms WHERE profile_id = ? ORDER BY title';
  const farmParams: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (filters.farm_id) {
    farmSql = 'SELECT id, title FROM farms WHERE profile_id = ? AND id = ? ORDER BY title';
    farmParams.push(filters.farm_id);
  }
  const farms = await db.getAllAsync<{ id: number; title: string }>(farmSql, farmParams);
  const farmSplit = async (farmId: number, sql: string, extraParams: SQLiteBindValue[] = []): Promise<number> => {
    const direct =
      (await db.getFirstAsync<{ total: number | null }>(
        `SELECT COALESCE(SUM(e.amount), 0) AS total FROM expenses e WHERE ${sql} AND e.farm_id = ?`,
        [...params, ...extraParams, farmId],
      ))?.total ?? 0;
    return direct + (await sharedSplit(sql, extraParams, farmId));
  };
  const rows: ObligationsFarmRow[] = [];
  for (const farm of farms) {
    rows.push({
      farm: farm.title,
      unpaid: await farmSplit(farm.id, unpaidSql),
      overdue: await farmSplit(farm.id, overdueSql, [today]),
    });
  }
  rows.sort((a, b) => b.unpaid - a.unpaid);

  return {
    period_label: p.label,
    start: p.start,
    end: p.end,
    year: p.year,
    items,
    unpaid_total,
    overdue_total,
    count: items.length,
    farms: rows,
  };
}

export async function availableYears(): Promise<number[]> {
  const db = getDb();
  const years = new Set<number>();
  for (const t of ['incomes', 'expenses'] as const) {
    const rows = await db.getAllAsync<{ d: string }>(`SELECT DISTINCT substr(date,1,4) AS d FROM ${t} WHERE profile_id = ?`, [SINGLE_PROFILE_ID]);
    for (const r of rows) {
      const y = parseInt(r.d, 10);
      if (Number.isFinite(y)) years.add(y);
    }
  }
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

export function describeFilters(f: AnalyticsFilters, periodLabel?: string, names?: Record<string, string>): string {
  const parts: string[] = [];
  parts.push(`Period: ${periodLabel ?? (f.year ? String(f.year) : [f.start, f.end].filter(Boolean).join(' – ') || 'custom')}`);
  if (f.farm_id) parts.push(`Farm: ${names?.[`farm:${f.farm_id}`] ?? `#${f.farm_id}`}`);
  if (f.expense_category_id) parts.push(`Expense category: ${names?.[`expense_category:${f.expense_category_id}`] ?? `#${f.expense_category_id}`}`);
  if (f.income_category_id) parts.push(`Income category: ${names?.[`income_category:${f.income_category_id}`] ?? `#${f.income_category_id}`}`);
  if (f.vendor_id) parts.push(`Vendor: ${names?.[`vendor:${f.vendor_id}`] ?? `#${f.vendor_id}`}`);
  if (f.customer_id) parts.push(`Customer: ${names?.[`customer:${f.customer_id}`] ?? `#${f.customer_id}`}`);
  if (f.document_type) parts.push(`Document: ${f.document_type === 'invoice' ? 'Invoice' : 'Receipt'}`);
  if (f.tax && f.tax !== 'all') parts.push(`Tax: ${f.tax === 'taxed' ? 'Taxed only' : 'Untaxed only'}`);
  return parts.join(' · ');
}

/** Resolve human-readable names for active filter IDs (mirrors server describe_filters). */
export async function describeFiltersWithNames(f: AnalyticsFilters, periodLabel?: string): Promise<string> {
  const db = getDb();
  const names: Record<string, string> = {};
  const lookup = async (table: string, key: string, id: number | null | undefined) => {
    if (!id) return;
    try {
      const row = await db.getFirstAsync<{ name?: string; title?: string }>(`SELECT name, title FROM ${table} WHERE id = ? AND profile_id = ?`, [id, SINGLE_PROFILE_ID] as any);
      const label = (row as any)?.title ?? (row as any)?.name;
      if (label) names[`${key}:${id}`] = String(label);
    } catch {
      // best-effort; fallback to #id
    }
  };
  await lookup('farms', 'farm', f.farm_id);
  await lookup('expense_categories', 'expense_category', f.expense_category_id);
  await lookup('income_categories', 'income_category', f.income_category_id);
  await lookup('vendors', 'vendor', f.vendor_id);
  await lookup('customers', 'customer', f.customer_id);
  return describeFilters(f, periodLabel, names);
}

/** Sanitize period labels for filenames (mirrors server analytics_export). */
export function sanitizePeriodForFilename(period: string): string {
  return period.replace(/ – /g, '_').replace(/ /g, '') || 'all';
}

export async function obligationsSummary(): Promise<{
  unpaid_total: number; overdue_total: number; unpaid_count: number; overdue_count: number;
  items: Array<{ id: number; title: string; date: string; farm_title: string | null; amount: number; overdue: boolean }>;
}> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const totals = await db.getFirstAsync<{ unpaid_total: number | null; overdue_total: number | null; unpaid_count: number; overdue_count: number }>(
    `SELECT COALESCE(SUM(amount),0) AS unpaid_total,
      COALESCE(SUM(CASE WHEN date < ? THEN amount ELSE 0 END),0) AS overdue_total,
      COUNT(*) AS unpaid_count,
      COALESCE(SUM(CASE WHEN date < ? THEN 1 ELSE 0 END),0) AS overdue_count
     FROM expenses WHERE profile_id = ? AND is_paid = 0`,
    [today, today, SINGLE_PROFILE_ID],
  );
  const items = await db.getAllAsync<any>(
    `SELECT e.id, e.title, e.date, f.title AS farm_title, e.amount,
      CASE WHEN e.date < ? THEN 1 ELSE 0 END AS overdue
     FROM expenses e LEFT JOIN farms f ON f.id = e.farm_id
     WHERE e.profile_id = ? AND e.is_paid = 0 ORDER BY e.date ASC, e.id ASC LIMIT 5`,
    [today, SINGLE_PROFILE_ID],
  );
  return {
    unpaid_total: totals?.unpaid_total ?? 0,
    overdue_total: totals?.overdue_total ?? 0,
    unpaid_count: totals?.unpaid_count ?? 0,
    overdue_count: totals?.overdue_count ?? 0,
    items: items.map((r) => ({ ...r, overdue: !!r.overdue })),
  };
}

export async function recentTasks(limit = 5): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>(
    `SELECT t.*, f.title AS farm_title, c.name AS category_name
     FROM farm_tasks t JOIN farms f ON f.id = t.farm_id JOIN task_categories c ON c.id = t.category_id
     WHERE t.profile_id = ? ORDER BY t.date DESC, t.id DESC LIMIT ?`,
    [SINGLE_PROFILE_ID, limit],
  );
}

export async function recentProductions(limit = 5): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>(
    `SELECT p.*, f.title AS farm_title, t.name AS tree_type_name,
      (SELECT GROUP_CONCAT(i.title || ' (' || printf('%.2f', i.amount) || ')', ', ')
        FROM production_income_links l JOIN incomes i ON i.id = l.income_id WHERE l.production_id = p.id) AS income_summary
     FROM productions p JOIN farms f ON f.id = p.farm_id JOIN tree_types t ON t.id = p.tree_type_id
     WHERE p.profile_id = ? ORDER BY p.year DESC, p.id DESC LIMIT ?`,
    [SINGLE_PROFILE_ID, limit],
  );
}

export async function unallocatedIncomeTotal(): Promise<number> {
  const db = getDb();
  const total = (await db.getFirstAsync<{ total: number | null }>(
    'SELECT COALESCE(SUM(amount),0) AS total FROM incomes WHERE profile_id = ?', [SINGLE_PROFILE_ID]))?.total ?? 0;
  const allocated = (await db.getFirstAsync<{ total: number | null }>(
    'SELECT COALESCE(SUM(amount),0) AS total FROM income_farm_allocations WHERE profile_id = ?', [SINGLE_PROFILE_ID]))?.total ?? 0;
  return Math.max(0, total - allocated);
}

export async function unlinkedProductionsCount(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM productions p WHERE p.profile_id = ?
     AND NOT EXISTS (SELECT 1 FROM production_income_links l WHERE l.production_id = p.id)`,
    [SINGLE_PROFILE_ID],
  );
  return row?.n ?? 0;
}

export async function lastTaskDate(): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ date: string | null }>(
    'SELECT MAX(date) AS date FROM farm_tasks WHERE profile_id = ?', [SINGLE_PROFILE_ID]);
  return row?.date ?? null;
}

export async function recentTransactions(limit = 6) {
  const db = getDb();
  const expenses = await db.getAllAsync<any>(
    `SELECT e.*, f.title AS farm_title FROM expenses e LEFT JOIN farms f ON f.id = e.farm_id
     WHERE e.profile_id = ? ORDER BY e.date DESC, e.id DESC LIMIT ?`,
    [SINGLE_PROFILE_ID, limit],
  );
  const incomes = await db.getAllAsync<any>(
    `SELECT i.*, (SELECT GROUP_CONCAT(f.title || ' (' || printf('%.2f', ia.amount) || ')', ', ')
       FROM income_farm_allocations ia JOIN farms f ON f.id = ia.farm_id WHERE ia.income_id = i.id) AS farm_summary,
       i.amount - COALESCE((SELECT SUM(ia.amount) FROM income_farm_allocations ia WHERE ia.income_id = i.id), 0) AS unallocated_amount
     FROM incomes i
     WHERE i.profile_id = ? ORDER BY i.date DESC, i.id DESC LIMIT ?`,
    [SINGLE_PROFILE_ID, limit],
  );
  return [...expenses.map((r) => ({ kind: 'expenses' as const, ...r })), ...incomes.map((r) => ({ kind: 'incomes' as const, ...r }))]
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .slice(0, limit);
}
