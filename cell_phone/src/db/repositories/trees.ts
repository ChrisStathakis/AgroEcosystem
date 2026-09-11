import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type TreeInventoryMovement, type TreeMovementAction, type TreePlanting } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { assertISODate, assertPositiveCount } from '../../lib/validation';

export async function listPlantings(farmId?: number, query = ''): Promise<TreePlanting[]> {
  const db = getDb();
  let sql = `SELECT t.*, f.title AS farm_title, y.name AS tree_type_name FROM tree_plantings t
    JOIN farms f ON f.id = t.farm_id JOIN tree_types y ON y.id = t.tree_type_id
    WHERE t.profile_id = ? AND t.count > 0`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (farmId) { sql += ' AND t.farm_id = ?'; params.push(farmId); }
  if (query.trim()) {
    sql += ' AND (y.name LIKE ? OR f.title LIKE ? OR t.notes LIKE ?)';
    const q = `%${query.trim()}%`; params.push(q, q, q);
  }
  sql += ' ORDER BY f.title, y.name';
  return db.getAllAsync<TreePlanting>(sql, params);
}

export async function listTreeMovements(plantingId?: number): Promise<TreeInventoryMovement[]> {
  const db = getDb();
  let sql = `SELECT m.*, f.title AS farm_title, y.name AS tree_type_name,
    (SELECT COALESCE(SUM(CASE WHEN earlier.action = 'add' THEN earlier.quantity ELSE -earlier.quantity END), 0)
       FROM tree_inventory_movements earlier
      WHERE earlier.planting_id = m.planting_id
        AND (earlier.effective_date < m.effective_date OR
             (earlier.effective_date = m.effective_date AND (earlier.created_at < m.created_at OR
              (earlier.created_at = m.created_at AND earlier.id <= m.id))))) AS balance_after
    FROM tree_inventory_movements m JOIN tree_plantings t ON t.id = m.planting_id
    JOIN farms f ON f.id = t.farm_id JOIN tree_types y ON y.id = t.tree_type_id
    WHERE m.profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (plantingId) { sql += ' AND m.planting_id = ?'; params.push(plantingId); }
  sql += ' ORDER BY m.effective_date DESC, m.created_at DESC, m.id DESC';
  return db.getAllAsync<TreeInventoryMovement>(sql, params);
}

export async function recordTreeMovement(input: {
  farm_id: number; tree_type_id: number; action: TreeMovementAction; quantity: number;
  effective_date?: string | null; notes?: string;
}): Promise<number> {
  assertPositiveCount(input.quantity);
  if (input.action !== 'add' && input.action !== 'remove') throw new Error('Choose add or remove.');
  const effectiveDate = input.effective_date || new Date().toISOString().slice(0, 10);
  assertISODate(effectiveDate, 'Movement date');
  const db = getDb();
  let movementId = 0;
  await db.withTransactionAsync(async () => {
    const farm = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM farms WHERE id = ?', [input.farm_id]);
    const treeType = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM tree_types WHERE id = ?', [input.tree_type_id]);
    if (!farm || farm.profile_id !== SINGLE_PROFILE_ID || !treeType || treeType.profile_id !== SINGLE_PROFILE_ID) {
      throw new Error('Farm and tree type must belong to this workspace.');
    }
    let planting = await db.getFirstAsync<{ id: number; count: number }>(
      'SELECT id, count FROM tree_plantings WHERE profile_id = ? AND farm_id = ? AND tree_type_id = ?',
      [SINGLE_PROFILE_ID, input.farm_id, input.tree_type_id],
    );
    if (!planting) {
      if (input.action === 'remove') throw new Error('There are no trees of this type on the selected farm.');
      const now = nowISO();
      const created = await db.runAsync(
        'INSERT INTO tree_plantings (profile_id, farm_id, tree_type_id, count, planted_on, notes, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, input.farm_id, input.tree_type_id, effectiveDate, input.notes ?? '', now, now],
      );
      planting = { id: created.lastInsertRowId, count: 0 };
    }
    if (input.action === 'remove' && input.quantity > planting.count) {
      throw new Error(`Cannot remove ${input.quantity} trees; only ${planting.count} remain.`);
    }
    const nextCount = input.action === 'add' ? planting.count + input.quantity : planting.count - input.quantity;
    await db.runAsync('UPDATE tree_plantings SET count = ?, updated_at = ? WHERE id = ? AND profile_id = ?',
      [nextCount, nowISO(), planting.id, SINGLE_PROFILE_ID]);
    const created = await db.runAsync(
      'INSERT INTO tree_inventory_movements (profile_id, planting_id, action, quantity, effective_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [SINGLE_PROFILE_ID, planting.id, input.action, input.quantity, effectiveDate, input.notes ?? '', nowISO()],
    );
    movementId = created.lastInsertRowId;
  });
  return movementId;
}

/** Compatibility wrapper for callers that used the old create operation. */
export async function createPlanting(input: { farm_id: number; tree_type_id: number; count: number; planted_on?: string | null; notes?: string }): Promise<number> {
  return recordTreeMovement({ farm_id: input.farm_id, tree_type_id: input.tree_type_id, action: 'add', quantity: input.count, effective_date: input.planted_on, notes: input.notes });
}

export async function deletePlanting(_id: number): Promise<void> {
  throw new Error('Tree groups are kept for history; record a removal instead.');
}
