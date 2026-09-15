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
    const e = await db.getFirstAsync<{ farm_id: number; is_archived: number }>(
      'SELECT farm_id, is_archived FROM expenses WHERE id = ?',
      [input.expense_id],
    );
    if (!e) throw new Error('Selected expense no longer exists.');
    if (e.is_archived) throw new Error('Archived expenses cannot be linked to new tasks.');
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

export async function updateTask(
  id: number,
  input: {
    farm_id: number; planting_id?: number | null; category_id: number; expense_id?: number | null;
    title: string; description?: string; date: string;
  },
): Promise<void> {
  assertNonEmpty(input.title, 'Title');
  assertISODate(input.date);
  const db = getDb();
  if (input.planting_id) {
    const p = await db.getFirstAsync<{ farm_id: number }>('SELECT farm_id FROM tree_plantings WHERE id = ?', [input.planting_id]);
    if (!p) throw new Error('Selected tree group no longer exists.');
    assertSameFarm(input.farm_id, p.farm_id, 'Tree group');
  }
  if (input.expense_id) {
    const current = await db.getFirstAsync<{ expense_id: number | null }>(
      'SELECT expense_id FROM farm_tasks WHERE id = ? AND profile_id = ?',
      [id, SINGLE_PROFILE_ID],
    );
    const e = await db.getFirstAsync<{ farm_id: number; is_archived: number }>(
      'SELECT farm_id, is_archived FROM expenses WHERE id = ?',
      [input.expense_id],
    );
    if (!e) throw new Error('Selected expense no longer exists.');
    // Archived expenses stay linked (server keeps them) but cannot be newly attached.
    if (e.is_archived && current?.expense_id !== input.expense_id) {
      throw new Error('Archived expenses cannot be linked to tasks. Unarchive it first.');
    }
    assertSameFarm(input.farm_id, e.farm_id, 'Expense');
  }
  await db.runAsync(
    `UPDATE farm_tasks SET farm_id = ?, planting_id = ?, category_id = ?, expense_id = ?, title = ?, description = ?, date = ?, updated_at = ?
     WHERE id = ? AND profile_id = ?`,
    [input.farm_id, input.planting_id ?? null, input.category_id, input.expense_id ?? null, input.title.trim(), input.description ?? '', input.date, nowISO(), id, SINGLE_PROFILE_ID],
  );
}

/** Non-archived expenses for the task form, optionally scoped to a farm. */
export async function listTaskExpenseOptions(farmId?: number, includeExpenseId?: number | null) {
  const db = getDb();
  let sql = `SELECT e.id, e.title, e.date, e.amount FROM expenses e WHERE e.profile_id = ?
    AND (e.is_archived = 0${includeExpenseId ? ' OR e.id = ?' : ''})`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (includeExpenseId) params.push(includeExpenseId);
  if (farmId) {
    sql += ' AND e.farm_id = ?';
    params.push(farmId);
  }
  sql += ' ORDER BY e.date DESC, e.id DESC LIMIT 200';
  return db.getAllAsync<{ id: number; title: string; date: string; amount: number }>(sql, params);
}

/** Non-empty plantings for the task form, optionally scoped to a farm. */
export async function listTaskPlantingOptions(farmId?: number, includePlantingId?: number | null) {
  const db = getDb();
  let sql = `SELECT t.id, y.name AS type_name, f.title AS farm_title FROM tree_plantings t
    JOIN tree_types y ON y.id = t.tree_type_id JOIN farms f ON f.id = t.farm_id
    WHERE t.profile_id = ? AND (t.count > 0${includePlantingId ? ' OR t.id = ?' : ''})`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (includePlantingId) params.push(includePlantingId);
  if (farmId) {
    sql += ' AND t.farm_id = ?';
    params.push(farmId);
  }
  sql += ' ORDER BY f.title, y.name LIMIT 200';
  return db.getAllAsync<{ id: number; type_name: string; farm_title: string }>(sql, params);
}

export async function deleteTask(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM farm_tasks WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}
