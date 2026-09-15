import * as SQLite from 'expo-sqlite';
import { SCHEMA_V4, SCHEMA_VERSION } from './schema';
import { nowISO, SINGLE_PROFILE_ID } from './types';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync('agro.db');
  return db;
}

/** Split schema into single statements and run sequentially. */
export async function migrate(): Promise<void> {
  const database = getDb();
  const version = (await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  const hasTables = await database.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'tree_plantings'",
  );
  const hasIncomes = await database.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'incomes'",
  );
  if (hasTables?.n && version < 2) await migrateLegacyTreeHistory(database);
  if (hasIncomes?.n && version < 3) await migrateLegacyIncomeAllocations(database);
  const statements = SCHEMA_V4.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Run PRAGMA first, then the rest.
  await database.execAsync('PRAGMA foreign_keys = ON;');
  for (const stmt of statements) {
    if (stmt.toUpperCase().startsWith('PRAGMA')) continue;
    await database.execAsync(stmt + ';');
  }
  // v4: is_archived on expenses/incomes (server 0004/0005). CREATE TABLE IF NOT
  // EXISTS won't add the column to old DBs, so patch explicitly.
  await migrateIsArchived(database);
  await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  const now = nowISO();
  await database.runAsync(
    'INSERT INTO profiles (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING;',
    [SINGLE_PROFILE_ID, '', now, now],
  );
}

async function migrateLegacyIncomeAllocations(database: SQLite.SQLiteDatabase): Promise<void> {
  // Rebuild incomes to remove the required farm_id, then preserve each old link
  // as a full-amount allocation. No other local table references incomes.
  await database.execAsync(`
    PRAGMA foreign_keys = OFF;
    DROP INDEX IF EXISTS idx_incomes_profile_date;
    ALTER TABLE incomes RENAME TO incomes_legacy;
    CREATE TABLE incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES income_categories(id) ON DELETE RESTRICT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL CHECK (amount > 0),
      date TEXT NOT NULL,
      document_type TEXT NOT NULL CHECK (document_type IN ('invoice','receipt')),
      include_in_tax INTEGER NOT NULL DEFAULT 1,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO incomes (id, profile_id, category_id, customer_id, title, description, amount, date, document_type, include_in_tax, created_at, updated_at)
      SELECT id, profile_id, category_id, customer_id, title, description, amount, date, document_type, include_in_tax, created_at, updated_at
      FROM incomes_legacy;
    CREATE INDEX idx_incomes_profile_date ON incomes(profile_id, date);
    CREATE TABLE income_farm_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      income_id INTEGER NOT NULL REFERENCES incomes(id) ON DELETE CASCADE,
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
      amount REAL NOT NULL CHECK (amount > 0),
      UNIQUE(income_id, farm_id)
    );
    INSERT INTO income_farm_allocations (profile_id, income_id, farm_id, amount)
      SELECT profile_id, id, farm_id, amount FROM incomes_legacy WHERE farm_id IS NOT NULL;
    CREATE INDEX idx_income_allocations_farm ON income_farm_allocations(farm_id);
    DROP TABLE incomes_legacy;
    PRAGMA foreign_keys = ON;
  `);
}

async function migrateLegacyTreeHistory(database: SQLite.SQLiteDatabase): Promise<void> {
  // SQLite cannot alter a CHECK constraint. Rebuild the two tables that reference
  // tree_plantings while foreign keys are disabled, preserving every row.
  await database.execAsync(`
    PRAGMA foreign_keys = OFF;
    DROP INDEX IF EXISTS idx_plantings_farm;
    DROP INDEX IF EXISTS idx_tasks_profile_date;
    ALTER TABLE farm_tasks RENAME TO farm_tasks_legacy;
    ALTER TABLE tree_plantings RENAME TO tree_plantings_legacy;
    CREATE TABLE tree_plantings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
      tree_type_id INTEGER NOT NULL REFERENCES tree_types(id) ON DELETE RESTRICT,
      count INTEGER NOT NULL CHECK (count >= 0),
      planted_on TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(farm_id, tree_type_id)
    );
    INSERT INTO tree_plantings SELECT * FROM tree_plantings_legacy;
    CREATE INDEX idx_plantings_farm ON tree_plantings(farm_id);
    CREATE TABLE farm_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
      planting_id INTEGER REFERENCES tree_plantings(id) ON DELETE SET NULL,
      category_id INTEGER NOT NULL REFERENCES task_categories(id) ON DELETE RESTRICT,
      expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO farm_tasks SELECT * FROM farm_tasks_legacy;
    CREATE INDEX idx_tasks_profile_date ON farm_tasks(profile_id, date);
    DROP TABLE farm_tasks_legacy;
    DROP TABLE tree_plantings_legacy;
    PRAGMA foreign_keys = ON;
  `);
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS tree_inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      planting_id INTEGER NOT NULL REFERENCES tree_plantings(id) ON DELETE RESTRICT,
      action TEXT NOT NULL CHECK (action IN ('add','remove')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      effective_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tree_movements_planting_date ON tree_inventory_movements(planting_id, effective_date);
    INSERT INTO tree_inventory_movements (profile_id, planting_id, action, quantity, effective_date, notes, created_at)
      SELECT profile_id, id, 'add', count, COALESCE(planted_on, substr(created_at, 1, 10)),
             'Opening balance from the previous tree inventory.', created_at
      FROM tree_plantings
      WHERE count > 0 AND NOT EXISTS (
        SELECT 1 FROM tree_inventory_movements m
        WHERE m.planting_id = tree_plantings.id AND m.action = 'add' AND m.quantity = tree_plantings.count
      );
  `);
}

export async function resetDatabase(): Promise<void> {
  const database = getDb();
  await database.execAsync(
    'PRAGMA foreign_keys = OFF; DROP TABLE IF EXISTS farm_tasks; DROP TABLE IF EXISTS income_farm_allocations; DROP TABLE IF EXISTS incomes; DROP TABLE IF EXISTS expenses; DROP TABLE IF EXISTS tree_inventory_movements; DROP TABLE IF EXISTS tree_plantings; DROP TABLE IF EXISTS vendors; DROP TABLE IF EXISTS customers; DROP TABLE IF EXISTS expense_categories; DROP TABLE IF EXISTS income_categories; DROP TABLE IF EXISTS task_categories; DROP TABLE IF EXISTS tree_types; DROP TABLE IF EXISTS farms; DROP TABLE IF EXISTS profiles; PRAGMA foreign_keys = ON;',
  );
  await migrate();
}

async function tableHasColumn(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

export async function migrateIsArchived(database: SQLite.SQLiteDatabase): Promise<void> {
  // Idempotent: old installs (v3) lack the column; fresh installs already have it.
  for (const table of ['expenses', 'incomes'] as const) {
    const exists = await database
      .getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
        [table],
      )
      .catch(() => ({ n: 0 as number }));
    if (!exists?.n) continue;
    if (!(await tableHasColumn(database, table, 'is_archived'))) {
      await database.execAsync(
        `ALTER TABLE ${table} ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;`,
      );
    }
  }
}
