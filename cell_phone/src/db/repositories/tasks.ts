import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type FarmTask } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { assertISODate, assertNonEmpty, assertSameFarm } from '../../lib/validation';

export interface TaskFilters {
  q?: string;
  farm_id?: number;
  planting_id?: number;
  category_id?: number;
  start?: string;
  end?: string;
}

export async function listTasks(filters: TaskFilters = {}): Promise<FarmTask[]> {
  const db = getDb();
  let sql = `SELECT t.*, f.title AS farm_title, c.name AS category_name,
    (y.name || ' @ ' || pf.title) AS planting_label
    FROM farm_tasks t JOIN farms f ON f.id = t.farm_id JOIN task_categories c ON c.id = t.category_id
    LEFT JOIN tree_plantings p ON p.id = t.planting_id
    LEFT JOIN tree_types y ON y.id = p.tree_type_id LEFT JOIN farms pf ON pf.id = p.farm_id
    WHERE t.profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (filters.q?.trim()) {
    sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    const q = `%${filters.q.trim()}%`;
    params.push(q, q);
  }
  if (filters.farm_id) {
    sql += ' AND t.farm_id = ?';
    params.push(filters.farm_id);
  }
  if (filters.planting_id) {
    sql += ' AND t.planting_id = ?';
    params.push(filters.planting_id);
  }
  if (filters.category_id) {
    sql += ' AND t.category_id = ?';
    params.push(filters.category_id);
  }
  if (filters.start) {
    assertISODate(filters.start, 'From');
    sql += ' AND t.date >= ?';
    params.push(filters.start);
  }
  if (filters.end) {
    assertISODate(filters.end, 'To');
    sql += ' AND t.date <= ?';
    params.push(filters.end);
  }
  if (filters.start && filters.end && filters.start > filters.end) {
    throw new Error('The end date must be on or after the start date.');
  }
  sql += ' ORDER BY t.date DESC, t.id DESC';
  return db.getAllAsync<FarmTask>(sql, params);
}

export async function createTask(input: {
  farm_id: number; planting_id?: number | null; category_id: number; expense_id?: number | null;
  title: string; description?: string; date: string;
}): Promise<number> {
  assertNonEmpty(input.title, 'Title');
  assertISODate(input.date);
  const db = getDb();
  // Same-farm validation (port of FarmTaskForm.clean).
  if (input.planting_id) {
    const p = await db.getFirstAsync<{ farm_id: number }>('SELECT farm_id FROM tree_plantings WHERE id = ?', [input.planting_id]);
    if (!p) throw new Error('Selected tree group no longer exists.');
    assertSameFarm(input.farm_id, p.farm_id, 'Tree group');
  }
  if (input.expense_id) {
    const e = await db.getFirstAsync<{ farm_id: number }>('SELECT farm_id FROM expenses WHERE id = ?', [input.expense_id]);
    if (!e) throw new Error('Selected expense no longer exists.');
    assertSameFarm(input.farm_id, e.farm_id, 'Expense');
  }
  const now = nowISO();
  const res = await db.runAsync(
    `INSERT INTO farm_tasks (profile_id, farm_id, planting_id, category_id, expense_id, title, description, date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [SINGLE_PROFILE_ID, input.farm_id, input.planting_id ?? null, input.category_id, input.expense_id ?? null, input.title.trim(), input.description ?? '', input.date, now, now],
  );
  return res.lastInsertRowId;
}

export async function deleteTask(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM farm_tasks WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}
