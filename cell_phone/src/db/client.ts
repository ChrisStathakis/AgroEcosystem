import * as SQLite from 'expo-sqlite';
import { SCHEMA_V1 } from './schema';
import { nowISO, SINGLE_PROFILE_ID } from './types';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync('agro.db');
  return db;
}

/** Split schema into single statements and run sequentially. */
export async function migrate(): Promise<void> {
  const database = getDb();
  const statements = SCHEMA_V1.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Run PRAGMA first, then the rest.
  await database.execAsync('PRAGMA foreign_keys = ON;');
  for (const stmt of statements) {
    if (stmt.toUpperCase().startsWith('PRAGMA')) continue;
    await database.execAsync(stmt + ';');
  }
  const now = nowISO();
  await database.runAsync(
    'INSERT INTO profiles (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING;',
    [SINGLE_PROFILE_ID, '', now, now],
  );
}

export async function resetDatabase(): Promise<void> {
  const database = getDb();
  await database.execAsync(
    'PRAGMA foreign_keys = OFF; DROP TABLE IF EXISTS farm_tasks; DROP TABLE IF EXISTS incomes; DROP TABLE IF EXISTS expenses; DROP TABLE IF EXISTS tree_plantings; DROP TABLE IF EXISTS vendors; DROP TABLE IF EXISTS customers; DROP TABLE IF EXISTS expense_categories; DROP TABLE IF EXISTS income_categories; DROP TABLE IF EXISTS task_categories; DROP TABLE IF EXISTS tree_types; DROP TABLE IF EXISTS farms; DROP TABLE IF EXISTS profiles; PRAGMA foreign_keys = ON;',
  );
  await migrate();
}
