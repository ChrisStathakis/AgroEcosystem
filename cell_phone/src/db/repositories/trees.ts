import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type TreePlanting } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { assertISODate, assertPositiveCount } from '../../lib/validation';

export async function listPlantings(farmId?: number, query = ''): Promise<TreePlanting[]> {
  const db = getDb();
  let sql = `SELECT t.*, f.title AS farm_title, y.name AS tree_type_name FROM tree_plantings t
    JOIN farms f ON f.id = t.farm_id JOIN tree_types y ON y.id = t.tree_type_id
    WHERE t.profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (farmId) {
    sql += ' AND t.farm_id = ?';
    params.push(farmId);
  }
  if (query.trim()) {
    sql += ' AND (y.name LIKE ? OR f.title LIKE ? OR t.notes LIKE ?)';
    const q = `%${query.trim()}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY f.title, y.name';
  return db.getAllAsync<TreePlanting>(sql, params);
}

export async function createPlanting(input: {
  farm_id: number; tree_type_id: number; count: number; planted_on?: string | null; notes?: string;
}): Promise<number> {
  assertPositiveCount(input.count);
  if (input.planted_on) assertISODate(input.planted_on, 'Planted on');
  const db = getDb();
  try {
    const res = await db.runAsync(
      `INSERT INTO tree_plantings (profile_id, farm_id, tree_type_id, count, planted_on, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [SINGLE_PROFILE_ID, input.farm_id, input.tree_type_id, input.count, input.planted_on ?? null, input.notes ?? '', nowISO(), nowISO()],
    );
    return res.lastInsertRowId;
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new Error('This tree type is already recorded for the farm.');
    throw e;
  }
}

export async function deletePlanting(id: number): Promise<void> {
  const db = getDb();
  // Tasks use SET NULL: clear first (SQLite enforces if FK strict), then delete.
  await db.runAsync('UPDATE farm_tasks SET planting_id = NULL WHERE planting_id = ?', [id]);
  await db.runAsync('DELETE FROM tree_plantings WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}
