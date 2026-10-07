// Current schema (v6). Ports Django constraints:
// UNIQUE(profile,title/name), UNIQUE(farm,tree_type), PROTECT via
// RESTRICT-equivalent checks in repositories (SQLite RESTRICT).
// v4 adds is_archived to expenses/incomes (server 0004/0005):
// archived rows stay in lists/reports but are hidden from task dropdowns.
// v5 ports server 0005/0006: expenses.farm_id becomes optional (NULL = shared
// expense) and expenses.is_paid appears (unpaid rows feed obligations);
// adds productions + production_income_links (server production 0001).
// v6 adds split_basis/split_tree_type to expenses (server expenses 0007):
// shared (farm-less) expenses split by trees, one variety, stremmata or equal.

export const SCHEMA_VERSION = 6;
export const SCHEMA_V6 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  size REAL NOT NULL CHECK (size > 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id, title)
);
CREATE INDEX IF NOT EXISTS idx_farms_profile ON farms(profile_id);

CREATE TABLE IF NOT EXISTS tree_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS task_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS income_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS tree_plantings (
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
CREATE INDEX IF NOT EXISTS idx_plantings_farm ON tree_plantings(farm_id);

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

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  farm_id INTEGER REFERENCES farms(id) ON DELETE RESTRICT,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice','receipt')),
  include_in_tax INTEGER NOT NULL DEFAULT 0,
  is_paid INTEGER NOT NULL DEFAULT 1,
  is_archived INTEGER NOT NULL DEFAULT 0,
  split_basis TEXT NOT NULL DEFAULT 'trees' CHECK (split_basis IN ('trees','tree_type','area','equal')),
  split_tree_type_id INTEGER REFERENCES tree_types(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_profile_date ON expenses(profile_id, date);

CREATE TABLE IF NOT EXISTS incomes (
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
CREATE INDEX IF NOT EXISTS idx_incomes_profile_date ON incomes(profile_id, date);

CREATE TABLE IF NOT EXISTS income_farm_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  income_id INTEGER NOT NULL REFERENCES incomes(id) ON DELETE CASCADE,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK (amount > 0),
  UNIQUE(income_id, farm_id)
);
CREATE INDEX IF NOT EXISTS idx_income_allocations_farm ON income_farm_allocations(farm_id);

CREATE TABLE IF NOT EXISTS farm_tasks (
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
CREATE INDEX IF NOT EXISTS idx_tasks_profile_date ON farm_tasks(profile_id, date);

CREATE TABLE IF NOT EXISTS productions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  tree_type_id INTEGER NOT NULL REFERENCES tree_types(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('kg','tn','l')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(farm_id, year, tree_type_id)
);
CREATE INDEX IF NOT EXISTS idx_productions_profile_year ON productions(profile_id, year);
CREATE INDEX IF NOT EXISTS idx_productions_farm ON productions(farm_id);

CREATE TABLE IF NOT EXISTS production_income_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  production_id INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  income_id INTEGER NOT NULL REFERENCES incomes(id) ON DELETE CASCADE,
  UNIQUE(production_id, income_id)
);
CREATE INDEX IF NOT EXISTS idx_production_links_production ON production_income_links(production_id);
CREATE INDEX IF NOT EXISTS idx_production_links_income ON production_income_links(income_id);
`;

/** Back-compat aliases: older code imports SCHEMA_V3/V4/V5. */
export const SCHEMA_V5 = SCHEMA_V6;
export const SCHEMA_V4 = SCHEMA_V6;
export const SCHEMA_V3 = SCHEMA_V6;
