import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type Expense, type Income, type IncomeFarmAllocation } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { assertAllocationTotal, assertISODate, assertNonEmpty, assertPositiveAmount } from '../../lib/validation';

export interface TxnFilters {
  q?: string;
  farm_id?: number;
  category_id?: number;
  contact_id?: number;
  start?: string;
  end?: string;
  document_type?: 'invoice' | 'receipt';
  tax?: 'all' | 'taxed' | 'untaxed';
  /** Default hides nothing (archived stays in lists, like server). Pass true/false to filter. */
  is_archived?: boolean;
}

function contactColumn(income: boolean): string {
  return income ? 'customer_id' : 'vendor_id';
}

function whereClause(filters: TxnFilters, alias: string, income = false): { sql: string; params: SQLiteBindValue[] } {
  let sql = `${alias}.profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (filters.q?.trim()) {
    sql += ` AND (${alias}.title LIKE ? OR ${alias}.description LIKE ?)`;
    const q = `%${filters.q.trim()}%`;
    params.push(q, q);
  }
  if (filters.farm_id) {
    sql += income
      ? ` AND EXISTS (SELECT 1 FROM income_farm_allocations ia WHERE ia.income_id = ${alias}.id AND ia.farm_id = ?)`
      : ` AND ${alias}.farm_id = ?`;
    params.push(filters.farm_id);
  }
  if (filters.category_id) {
    sql += ` AND ${alias}.category_id = ?`;
    params.push(filters.category_id);
  }
  if (filters.contact_id) {
    sql += ` AND ${alias}.${contactColumn(income)} = ?`;
    params.push(filters.contact_id);
  }
  if (filters.start) {
    assertISODate(filters.start, 'From');
    sql += ` AND ${alias}.date >= ?`;
    params.push(filters.start);
  }
  if (filters.end) {
    assertISODate(filters.end, 'To');
    sql += ` AND ${alias}.date <= ?`;
    params.push(filters.end);
  }
  if (filters.start && filters.end && filters.start > filters.end) {
    throw new Error('The end date must be on or after the start date.');
  }
  if (filters.document_type) {
    if (filters.document_type !== 'invoice' && filters.document_type !== 'receipt') {
      throw new Error('Invalid document type.');
    }
    sql += ` AND ${alias}.document_type = ?`;
    params.push(filters.document_type);
  }
  if (filters.tax === 'taxed') sql += ` AND ${alias}.include_in_tax = 1`;
  else if (filters.tax === 'untaxed') sql += ` AND ${alias}.include_in_tax = 0`;
  if (typeof filters.is_archived === 'boolean') {
    sql += ` AND ${alias}.is_archived = ?`;
    params.push(filters.is_archived ? 1 : 0);
  }
  return { sql, params };
}

export async function listExpenses(filters: TxnFilters = {}): Promise<Expense[]> {
  const db = getDb();
  const { sql, params } = whereClause(filters, 'e');
  return db.getAllAsync<Expense>(
    `SELECT e.*, f.title AS farm_title, c.name AS category_name, v.name AS contact_name
     FROM expenses e JOIN farms f ON f.id = e.farm_id JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN vendors v ON v.id = e.vendor_id WHERE ${sql} ORDER BY e.date DESC, e.id DESC`,
    params,
  );
}

export async function listIncomes(filters: TxnFilters = {}): Promise<Income[]> {
  const db = getDb();
  const { sql, params } = whereClause(filters, 'i', true);
  return db.getAllAsync<Income>(
    `SELECT i.*, c.name AS category_name, v.name AS contact_name,
       (SELECT GROUP_CONCAT(f.title || ' (' || printf('%.2f', ia.amount) || ')', ', ')
          FROM income_farm_allocations ia JOIN farms f ON f.id = ia.farm_id WHERE ia.income_id = i.id) AS farm_summary,
       i.amount - COALESCE((SELECT SUM(ia.amount) FROM income_farm_allocations ia WHERE ia.income_id = i.id), 0) AS unallocated_amount
     FROM incomes i JOIN income_categories c ON c.id = i.category_id
     LEFT JOIN customers v ON v.id = i.customer_id WHERE ${sql} ORDER BY i.date DESC, i.id DESC`,
    params,
  );
}

/** Active (non-archived) expenses for task dropdowns — port of FarmTaskForm expense queryset. */
export async function listActiveExpensesForTasks(farmId?: number): Promise<Expense[]> {
  const db = getDb();
  let sql = `SELECT e.*, f.title AS farm_title FROM expenses e JOIN farms f ON f.id = e.farm_id
    WHERE e.profile_id = ? AND e.is_archived = 0`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (farmId) {
    sql += ' AND e.farm_id = ?';
    params.push(farmId);
  }
  sql += ' ORDER BY e.date DESC, e.id DESC';
  return db.getAllAsync<Expense>(sql, params);
}

export interface TxnInput {
  farm_id: number;
  category_id: number;
  contact_id?: number | null;
  title: string;
  description?: string;
  amount: number;
  date: string;
  document_type: 'invoice' | 'receipt';
  include_in_tax: boolean;
  is_archived?: boolean;
  allocations?: Array<{ farm_id: number; amount: number }>;
}

export async function listIncomeAllocations(incomeId: number): Promise<IncomeFarmAllocation[]> {
  const db = getDb();
  return db.getAllAsync<IncomeFarmAllocation>(
    `SELECT ia.*, f.title AS farm_title FROM income_farm_allocations ia JOIN farms f ON f.id = ia.farm_id
     WHERE ia.profile_id = ? AND ia.income_id = ? ORDER BY f.title, ia.id`,
    [SINGLE_PROFILE_ID, incomeId],
  );
}

export type IncomeInput = Omit<TxnInput, 'farm_id'> & {
  allocations?: Array<{ farm_id: number; amount: number }>;
};

function assertTxnCommon(input: { title: string; amount: number; date: string; document_type: string }) {
  assertNonEmpty(input.title, 'Title');
  assertPositiveAmount(input.amount);
  assertISODate(input.date);
  if (input.document_type !== 'invoice' && input.document_type !== 'receipt') {
    throw new Error('Choose a valid document type.');
  }
}

export async function createExpense(input: TxnInput): Promise<number> {
  assertTxnCommon(input);
  const db = getDb();
  const now = nowISO();
  const res = await db.runAsync(
    `INSERT INTO expenses (profile_id, farm_id, category_id, vendor_id, title, description, amount, date, document_type, include_in_tax, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [SINGLE_PROFILE_ID, input.farm_id, input.category_id, input.contact_id ?? null, input.title.trim(), input.description ?? '', input.amount, input.date, input.document_type, input.include_in_tax ? 1 : 0, input.is_archived ? 1 : 0, now, now],
  );
  return res.lastInsertRowId;
}

export async function updateExpense(id: number, input: TxnInput): Promise<void> {
  assertTxnCommon(input);
  const db = getDb();
  await db.runAsync(
    `UPDATE expenses SET farm_id = ?, category_id = ?, vendor_id = ?, title = ?, description = ?, amount = ?,
      date = ?, document_type = ?, include_in_tax = ?, is_archived = ?, updated_at = ?
     WHERE id = ? AND profile_id = ?`,
    [input.farm_id, input.category_id, input.contact_id ?? null, input.title.trim(), input.description ?? '', input.amount, input.date, input.document_type, input.include_in_tax ? 1 : 0, input.is_archived ? 1 : 0, nowISO(), id, SINGLE_PROFILE_ID],
  );
}

export async function setExpenseArchived(id: number, archived: boolean): Promise<void> {
  await getDb().runAsync('UPDATE expenses SET is_archived = ?, updated_at = ? WHERE id = ? AND profile_id = ?', [
    archived ? 1 : 0, nowISO(), id, SINGLE_PROFILE_ID,
  ]);
}

export async function createIncome(input: IncomeInput): Promise<number> {
  assertTxnCommon(input);
  const allocations = input.allocations ?? [];
  assertAllocationTotal(allocations, input.amount);
  const db = getDb();
  let incomeId = 0;
  await db.withTransactionAsync(async () => {
    for (const allocation of allocations) {
      const farm = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM farms WHERE id = ?', [allocation.farm_id]);
      if (!farm || farm.profile_id !== SINGLE_PROFILE_ID) throw new Error('Selected farm must belong to this workspace.');
    }
    const now = nowISO();
    const res = await db.runAsync(
      `INSERT INTO incomes (profile_id, category_id, customer_id, title, description, amount, date, document_type, include_in_tax, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [SINGLE_PROFILE_ID, input.category_id, input.contact_id ?? null, input.title.trim(), input.description ?? '', input.amount, input.date, input.document_type, input.include_in_tax ? 1 : 0, input.is_archived ? 1 : 0, now, now],
    );
    incomeId = res.lastInsertRowId;
    for (const allocation of allocations) {
      await db.runAsync(
        'INSERT INTO income_farm_allocations (profile_id, income_id, farm_id, amount) VALUES (?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, incomeId, allocation.farm_id, allocation.amount],
      );
    }
  });
  return incomeId;
}

export async function updateIncome(id: number, input: IncomeInput): Promise<void> {
  assertTxnCommon(input);
  const allocations = input.allocations ?? [];
  assertAllocationTotal(allocations, input.amount);
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const allocation of allocations) {
      const farm = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM farms WHERE id = ?', [allocation.farm_id]);
      if (!farm || farm.profile_id !== SINGLE_PROFILE_ID) throw new Error('Selected farm must belong to this workspace.');
    }
    await db.runAsync(
      `UPDATE incomes SET category_id = ?, customer_id = ?, title = ?, description = ?, amount = ?,
        date = ?, document_type = ?, include_in_tax = ?, is_archived = ?, updated_at = ?
       WHERE id = ? AND profile_id = ?`,
      [input.category_id, input.contact_id ?? null, input.title.trim(), input.description ?? '', input.amount, input.date, input.document_type, input.include_in_tax ? 1 : 0, input.is_archived ? 1 : 0, nowISO(), id, SINGLE_PROFILE_ID],
    );
    await db.runAsync('DELETE FROM income_farm_allocations WHERE income_id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
    for (const allocation of allocations) {
      await db.runAsync(
        'INSERT INTO income_farm_allocations (profile_id, income_id, farm_id, amount) VALUES (?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, id, allocation.farm_id, allocation.amount],
      );
    }
  });
}

export async function setIncomeArchived(id: number, archived: boolean): Promise<void> {
  await getDb().runAsync('UPDATE incomes SET is_archived = ?, updated_at = ? WHERE id = ? AND profile_id = ?', [
    archived ? 1 : 0, nowISO(), id, SINGLE_PROFILE_ID,
  ]);
}

export async function deleteExpense(id: number): Promise<void> {
  const db = getDb();
  const ref = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM farm_tasks WHERE expense_id = ?', [id]);
  if ((ref?.n ?? 0) > 0) throw new Error('Cannot delete: linked by farm tasks. Unlink it first.');
  await db.runAsync('DELETE FROM expenses WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}

export async function deleteIncome(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM incomes WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}
