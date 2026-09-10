import { getDb } from '../client';
import { SINGLE_PROFILE_ID, type FinancialSummary } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';

// Port of server/analytics/services.py::financial_summary for the
// current calendar year, computed with plain SQL.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function financialSummary(year: number = new Date().getFullYear()): Promise<FinancialSummary> {
  const db = getDb();
  const sum = async (table: string, extra = '', params: SQLiteBindValue[] = []) => {
    const row = await db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(amount) AS total FROM ${table} WHERE profile_id = ? AND substr(date,1,4) = ? ${extra}`,
      [SINGLE_PROFILE_ID, String(year), ...params],
    );
    return row?.total ?? 0;
  };
  const income_total = await sum('incomes');
  const expense_total = await sum('expenses');
  const taxable_income = await sum('incomes', 'AND include_in_tax = 1');
  const deductible_expenses = await sum('expenses', 'AND include_in_tax = 1');

  const byMonth = async (table: string) => {
    const rows = await db.getAllAsync<{ m: string; total: number }>(
      `SELECT substr(date,6,2) AS m, SUM(amount) AS total FROM ${table}
       WHERE profile_id = ? AND substr(date,1,4) = ? GROUP BY m`,
      [SINGLE_PROFILE_ID, String(year)],
    );
    const map = new Map<number, number>();
    for (const r of rows) map.set(parseInt(r.m, 10), r.total);
    return map;
  };
  const im = await byMonth('incomes');
  const em = await byMonth('expenses');
  const monthly = MONTHS.map((label, i) => {
    const income = im.get(i + 1) ?? 0;
    const expense = em.get(i + 1) ?? 0;
    return { label, income, expense, balance: income - expense };
  });
  return {
    year,
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

export async function recentTransactions(limit = 6) {
  const db = getDb();
  const expenses = await db.getAllAsync<any>(
    `SELECT e.*, f.title AS farm_title FROM expenses e JOIN farms f ON f.id = e.farm_id
     WHERE e.profile_id = ? ORDER BY e.date DESC, e.id DESC LIMIT ?`,
    [SINGLE_PROFILE_ID, limit],
  );
  const incomes = await db.getAllAsync<any>(
    `SELECT i.*, f.title AS farm_title FROM incomes i JOIN farms f ON f.id = i.farm_id
     WHERE i.profile_id = ? ORDER BY i.date DESC, i.id DESC LIMIT ?`,
    [SINGLE_PROFILE_ID, limit],
  );
  return [...expenses.map((r) => ({ kind: 'expenses' as const, ...r })), ...incomes.map((r) => ({ kind: 'incomes' as const, ...r }))]
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .slice(0, limit);
}
