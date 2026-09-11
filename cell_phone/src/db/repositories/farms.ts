import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type Farm } from '../types';
import { assertNonEmpty, assertPositiveSize } from '../../lib/validation';

export async function listFarms(query = ''): Promise<Farm[]> {
  const db = getDb();
  if (query.trim()) {
    return db.getAllAsync<Farm>(
      `SELECT f.*, (SELECT SUM(count) FROM tree_plantings t WHERE t.farm_id = f.id) AS tree_total
       FROM farms f WHERE f.profile_id = ? AND f.title LIKE ? ORDER BY f.title, f.id`,
      [SINGLE_PROFILE_ID, `%${query.trim()}%`],
    );
  }
  return db.getAllAsync<Farm>(
    `SELECT f.*, (SELECT SUM(count) FROM tree_plantings t WHERE t.farm_id = f.id) AS tree_total
     FROM farms f WHERE f.profile_id = ? ORDER BY f.title, f.id`,
    [SINGLE_PROFILE_ID],
  );
}

export async function createFarm(input: { title: string; size: number; active: boolean }): Promise<number> {
  assertNonEmpty(input.title, 'Title');
  assertPositiveSize(input.size);
  const db = getDb();
  const now = nowISO();
  try {
    const res = await db.runAsync(
      'INSERT INTO farms (profile_id, title, size, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [SINGLE_PROFILE_ID, input.title.trim(), input.size, input.active ? 1 : 0, now, now],
    );
    return res.lastInsertRowId;
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new Error('A farm with this name already exists.');
    throw e;
  }
}

export async function updateFarm(id: number, input: { title: string; size: number; active: boolean }): Promise<void> {
  assertNonEmpty(input.title, 'Title');
  assertPositiveSize(input.size);
  const db = getDb();
  try {
    await db.runAsync('UPDATE farms SET title = ?, size = ?, active = ?, updated_at = ? WHERE id = ? AND profile_id = ?', [
      input.title.trim(), input.size, input.active ? 1 : 0, nowISO(), id, SINGLE_PROFILE_ID,
    ]);
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new Error('A farm with this name already exists.');
    throw e;
  }
}

/** Django PROTECT: refuse when trees, tasks, expenses or incomes reference the farm. */
export async function deleteFarm(id: number): Promise<void> {
  const db = getDb();
  const refs = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM tree_plantings WHERE farm_id = ?) +
     (SELECT COUNT(*) FROM farm_tasks WHERE farm_id = ?) +
     (SELECT COUNT(*) FROM expenses WHERE farm_id = ?) +
     (SELECT COUNT(*) FROM income_farm_allocations WHERE farm_id = ?) AS n`,
    [id, id, id, id],
  );
  if ((refs?.n ?? 0) > 0) throw new Error('Cannot delete: this farm still has trees, tasks or transactions.');
  await db.runAsync('DELETE FROM farms WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}
