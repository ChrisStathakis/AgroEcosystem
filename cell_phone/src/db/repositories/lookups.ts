import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type NamedRow } from '../types';
import { assertNonEmpty } from '../../lib/validation';

export type LookupTable = 'tree_types' | 'task_categories' | 'expense_categories' | 'income_categories';

export async function listLookups(table: LookupTable, query = ''): Promise<NamedRow[]> {
  const db = getDb();
  if (query.trim()) {
    return db.getAllAsync<NamedRow>(
      `SELECT id, profile_id, name FROM ${table} WHERE profile_id = ? AND name LIKE ? ORDER BY name`,
      [SINGLE_PROFILE_ID, `%${query.trim()}%`],
    );
  }
  return db.getAllAsync<NamedRow>(`SELECT id, profile_id, name FROM ${table} WHERE profile_id = ? ORDER BY name`, [
    SINGLE_PROFILE_ID,
  ]);
}

export async function createLookup(table: LookupTable, name: string): Promise<number> {
  assertNonEmpty(name, 'Name');
  const db = getDb();
  const dated = table === 'tree_types' || table === 'task_categories';
  try {
    const res = dated
      ? await db.runAsync(`INSERT INTO ${table} (profile_id, name, created_at) VALUES (?, ?, ?)`, [
          SINGLE_PROFILE_ID, name.trim(), nowISO(),
        ])
      : await db.runAsync(`INSERT INTO ${table} (profile_id, name) VALUES (?, ?)`, [SINGLE_PROFILE_ID, name.trim()]);
    return res.lastInsertRowId;
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new Error('This name already exists.');
    throw e;
  }
}

export async function updateLookup(table: LookupTable, id: number, name: string): Promise<void> {
  assertNonEmpty(name, 'Name');
  try {
    await getDb().runAsync(`UPDATE ${table} SET name = ? WHERE id = ? AND profile_id = ?`, [
      name.trim(), id, SINGLE_PROFILE_ID,
    ]);
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new Error('This name already exists.');
    throw e;
  }
}

export async function deleteLookup(table: LookupTable, id: number): Promise<void> {
  const db = getDb();
  // Map to referencing tables to emulate PROTECT.
  const refs: Record<LookupTable, string[]> = {
    tree_types: ['SELECT COUNT(*) AS n FROM tree_plantings WHERE tree_type_id = ?'],
    task_categories: ['SELECT COUNT(*) AS n FROM farm_tasks WHERE category_id = ?'],
    expense_categories: ['SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?'],
    income_categories: ['SELECT COUNT(*) AS n FROM incomes WHERE category_id = ?'],
  };
  for (const sql of refs[table]) {
    const row = await db.getFirstAsync<{ n: number }>(sql, [id]);
    if ((row?.n ?? 0) > 0) throw new Error('Cannot delete: still used by records.');
  }
  await db.runAsync(`DELETE FROM ${table} WHERE id = ? AND profile_id = ?`, [id, SINGLE_PROFILE_ID]);
}
