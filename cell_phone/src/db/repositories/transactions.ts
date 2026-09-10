import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type Expense, type Income } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { assertISODate, assertNonEmpty, assertPositiveAmount } from '../../lib/validation';

export interface TxnFilters {
  q?: string;
  farm_id?: number;
  start?: string;
  end?: string;
}

function whereClause(filters: TxnFilters, alias: string): { sql: string; params: SQLiteBindValue[] } {
  let sql = `${alias}.profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (filters.q?.trim()) {
    sql += ` AND (${alias}.title LIKE ? OR ${alias}.description LIKE ?)`;
    const q = `%${filters.q.trim()}%`;
    params.push(q, q);
  }
  if (filters.farm_id) {
    sql += ` AND ${alias}.farm_id = ?`;
    params.push(filters.farm_id);
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
  const { sql, params } = whereClause(filters, 'i');
  return db.getAllAsync<Income>(
    `SELECT i.*, f.title AS farm_title, c.name AS category_name, v.name AS contact_name
     FROM incomes i JOIN farms f ON f.id = i.farm_id JOIN income_categories c ON c.id = i.category_id
     LEFT JOIN customers v ON v.id = i.customer_id WHERE ${sql} ORDER BY i.date DESC, i.id DESC`,
    params,
  );
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
}

export async function createExpense(input: TxnInput): Promise<number> {
  assertNonEmpty(input.title, 'Title');
  assertPositiveAmount(input.amount);
  assertISODate(input.date);
  const db = getDb();
  const now = nowISO();
  const res = await db.runAsync(
    `INSERT INTO expenses (profile_id, farm_id, category_id, vendor_id, title, description, amount, date, document_type, include_in_tax, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [SINGLE_PROFILE_ID, input.farm_id, input.category_id, input.contact_id ?? null, input.title.trim(), input.description ?? '', input.amount, input.date, input.document_type, input.include_in_tax ? 1 : 0, now, now],
  );
  return res.lastInsertRowId;
}

export async function createIncome(input: TxnInput): Promise<number> {
  assertNonEmpty(input.title, 'Title');
  assertPositiveAmount(input.amount);
  assertISODate(input.date);
  const db = getDb();
  const now = nowISO();
  const res = await db.runAsync(
    `INSERT INTO incomes (profile_id, farm_id, category_id, customer_id, title, description, amount, date, document_type, include_in_tax, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [SINGLE_PROFILE_ID, input.farm_id, input.category_id, input.contact_id ?? null, input.title.trim(), input.description ?? '', input.amount, input.date, input.document_type, input.include_in_tax ? 1 : 0, now, now],
  );
  return res.lastInsertRowId;
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
