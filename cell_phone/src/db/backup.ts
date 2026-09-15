// Port of server/frontend/backup.py (BACKUP_VERSION 3) to offline SQLite.
// Everything is scoped to SINGLE_PROFILE_ID. Supports replace/merge,
// legacy v1 (counts only) and v2 (no allocations split) payloads.
import { getDb } from './client';
import { nowISO, SINGLE_PROFILE_ID } from './types';

export const BACKUP_VERSION = 3;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const COLLECTIONS = [
  'expense_categories', 'income_categories', 'task_categories', 'tree_types',
  'farms', 'vendors', 'customers', 'tree_plantings', 'tree_movements', 'expenses', 'incomes',
  'tasks',
] as const;

export class BackupError extends Error {}

function requireList(payload: any, key: string): any[] {
  const v = payload?.[key] ?? [];
  if (!Array.isArray(v)) throw new BackupError(`Backup section '${key}' must be a list.`);
  return v;
}

function requireIndex(items: any[], idx: any, section: string, field: string): any {
  if (!Number.isInteger(idx) || (idx as number) < 0 || (idx as number) >= items.length) {
    throw new BackupError(`Backup item '${field}' in '${section}' points to a missing record.`);
  }
  return items[idx as number];
}

export async function workspaceCounts(): Promise<Record<string, number>> {
  const db = getDb();
  const count = async (table: string) => {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE profile_id = ?`, [SINGLE_PROFILE_ID]);
    return row?.n ?? 0;
  };
  return {
    farms: await count('farms'),
    trees: await count('tree_plantings'),
    tree_movements: await count('tree_inventory_movements'),
    tasks: await count('farm_tasks'),
    expenses: await count('expenses'),
    incomes: await count('incomes'),
    vendors: await count('vendors'),
    customers: await count('customers'),
    expense_categories: await count('expense_categories'),
    income_categories: await count('income_categories'),
    tree_types: await count('tree_types'),
    task_categories: await count('task_categories'),
  };
}

export async function buildBackup(): Promise<any> {
  const db = getDb();
  const profile = await db.getFirstAsync<{ display_name: string }>('SELECT display_name FROM profiles WHERE id = ?', [SINGLE_PROFILE_ID]);
  const all = async <T>(sql: string, params: any[] = []) => db.getAllAsync<T>(sql, params as any);

  const farms = await all<any>('SELECT * FROM farms WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const farmIdx = new Map(farms.map((f: any, i: number) => [f.id, i]));
  const expenseCats = await all<any>('SELECT * FROM expense_categories WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const expenseCatIdx = new Map(expenseCats.map((c: any, i: number) => [c.id, i]));
  const incomeCats = await all<any>('SELECT * FROM income_categories WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const incomeCatIdx = new Map(incomeCats.map((c: any, i: number) => [c.id, i]));
  const taskCats = await all<any>('SELECT * FROM task_categories WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const taskCatIdx = new Map(taskCats.map((c: any, i: number) => [c.id, i]));
  const treeTypes = await all<any>('SELECT * FROM tree_types WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const treeTypeIdx = new Map(treeTypes.map((t: any, i: number) => [t.id, i]));
  const vendors = await all<any>('SELECT * FROM vendors WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const vendorIdx = new Map(vendors.map((v: any, i: number) => [v.id, i]));
  const customers = await all<any>('SELECT * FROM customers WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const customerIdx = new Map(customers.map((c: any, i: number) => [c.id, i]));
  const plantings = await all<any>('SELECT * FROM tree_plantings WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const plantingIdx = new Map(plantings.map((p: any, i: number) => [p.id, i]));
  const movements = await all<any>('SELECT * FROM tree_inventory_movements WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const expenses = await all<any>('SELECT * FROM expenses WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const expenseIdx = new Map(expenses.map((e: any, i: number) => [e.id, i]));
  const incomes = await all<any>('SELECT * FROM incomes WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const allocations = await all<any>('SELECT * FROM income_farm_allocations WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);
  const allocByIncome = new Map<number, any[]>();
  for (const a of allocations) {
    if (!allocByIncome.has(a.income_id)) allocByIncome.set(a.income_id, []);
    allocByIncome.get(a.income_id)!.push(a);
  }
  const tasks = await all<any>('SELECT * FROM farm_tasks WHERE profile_id = ? ORDER BY id', [SINGLE_PROFILE_ID]);

  return {
    version: BACKUP_VERSION,
    exported_at: nowISO(),
    display_name: profile?.display_name ?? '',
    expense_categories: expenseCats.map((c: any) => ({ name: c.name })),
    income_categories: incomeCats.map((c: any) => ({ name: c.name })),
    task_categories: taskCats.map((c: any) => ({ name: c.name })),
    tree_types: treeTypes.map((t: any) => ({ name: t.name })),
    farms: farms.map((f: any) => ({ title: f.title, size: String(f.size), active: !!f.active })),
    vendors: vendors.map((v: any) => ({ name: v.name, email: v.email, phone: v.phone, address: v.address, notes: v.notes })),
    customers: customers.map((c: any) => ({ name: c.name, email: c.email, phone: c.phone, address: c.address, notes: c.notes })),
    tree_plantings: plantings.map((p: any) => ({
      farm: farmIdx.get(p.farm_id), tree_type: treeTypeIdx.get(p.tree_type_id),
      count: p.count, planted_on: p.planted_on ?? null, notes: p.notes ?? '',
    })),
    tree_movements: movements.map((m: any) => ({
      planting: plantingIdx.get(m.planting_id), action: m.action, quantity: m.quantity,
      effective_date: m.effective_date, notes: m.notes ?? '',
    })),
    expenses: expenses.map((e: any) => ({
      farm: farmIdx.get(e.farm_id), category: expenseCatIdx.get(e.category_id),
      vendor: e.vendor_id ? vendorIdx.get(e.vendor_id) ?? null : null,
      title: e.title, description: e.description ?? '', amount: String(e.amount), date: e.date,
      document_type: e.document_type, include_in_tax: !!e.include_in_tax, is_archived: !!e.is_archived,
    })),
    incomes: incomes.map((i: any) => ({
      allocations: (allocByIncome.get(i.id) ?? []).map((a: any) => ({ farm: farmIdx.get(a.farm_id), amount: String(a.amount) })),
      category: incomeCatIdx.get(i.category_id),
      customer: i.customer_id ? customerIdx.get(i.customer_id) ?? null : null,
      title: i.title, description: i.description ?? '', amount: String(i.amount), date: i.date,
      document_type: i.document_type, include_in_tax: !!i.include_in_tax, is_archived: !!i.is_archived,
    })),
    tasks: tasks.map((t: any) => ({
      farm: farmIdx.get(t.farm_id),
      planting: t.planting_id ? plantingIdx.get(t.planting_id) ?? null : null,
      category: taskCatIdx.get(t.category_id),
      expense: t.expense_id ? expenseIdx.get(t.expense_id) ?? null : null,
      title: t.title, description: t.description ?? '', date: t.date,
    })),
  };
}

export function describePayload(payload: any): Record<string, number> {
  if (!payload || typeof payload !== 'object') throw new BackupError('This file is not a valid backup.');
  if (![1, 2, BACKUP_VERSION].includes(payload.version)) throw new BackupError('This backup was made by an unsupported app version.');
  const counts: Record<string, number> = {};
  for (const key of COLLECTIONS) {
    if (key === 'tree_movements' && ![2, BACKUP_VERSION].includes(payload.version)) counts[key] = 0;
    else counts[key] = requireList(payload, key).length;
  }
  return counts;
}

function checkedDocument(v: any, section: string): string {
  if (v !== 'invoice' && v !== 'receipt') throw new BackupError(`Backup item in '${section}' has an invalid document type.`);
  return v;
}

export async function destroyWorkspace(): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    for (const t of ['farm_tasks', 'expenses', 'incomes', 'income_farm_allocations', 'tree_inventory_movements', 'tree_plantings', 'vendors', 'customers', 'expense_categories', 'income_categories', 'task_categories', 'tree_types', 'farms'] as const) {
      await db.runAsync(`DELETE FROM ${t} WHERE profile_id = ?`, [SINGLE_PROFILE_ID]);
    }
    await db.execAsync('PRAGMA foreign_keys = ON;');
  });
}

async function getOrCreate(table: string, uniqueCol: 'name' | 'title', fields: Record<string, any>): Promise<any> {
  const db = getDb();
  const existing = await db.getFirstAsync<any>(`SELECT * FROM ${table} WHERE profile_id = ? AND ${uniqueCol} = ?`, [SINGLE_PROFILE_ID, fields[uniqueCol] ?? '']);
  if (existing) return existing;
  const now = nowISO();
  const cols = ['profile_id', ...Object.keys(fields)];
  const needsTimestamps = ['farms'].includes(table);
  const needsCreated = ['farms', 'tree_types', 'task_categories'].includes(table);
  const vals: any[] = [SINGLE_PROFILE_ID, ...Object.values(fields)];
  let sql = `INSERT INTO ${table} (${cols.join(',')}${needsTimestamps ? ',created_at,updated_at' : needsCreated ? ',created_at' : ''}) VALUES (${cols.map(() => '?').join(',')}${needsTimestamps ? ',?,?' : needsCreated ? ',?' : ''})`;
  if (needsTimestamps) vals.push(now, now);
  else if (needsCreated) vals.push(now);
  const res = await db.runAsync(sql, vals);
  return (await db.getFirstAsync<any>(`SELECT * FROM ${table} WHERE id = ?`, [res.lastInsertRowId]))!;
}

export async function restoreBackup(payload: any, mode: 'replace' | 'merge' = 'replace'): Promise<Record<string, number>> {
  if (mode !== 'replace' && mode !== 'merge') throw new BackupError('Unknown restore mode.');
  const counts = describePayload(payload);
  const db = getDb();
  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      for (const t of ['farm_tasks', 'expenses', 'incomes', 'income_farm_allocations', 'tree_inventory_movements', 'tree_plantings', 'vendors', 'customers', 'expense_categories', 'income_categories', 'task_categories', 'tree_types', 'farms'] as const) {
        await db.runAsync(`DELETE FROM ${t} WHERE profile_id = ?`, [SINGLE_PROFILE_ID]);
      }
    }
    const expenseCats: any[] = [];
    for (const item of requireList(payload, 'expense_categories')) expenseCats.push(await getOrCreate('expense_categories', 'name', { name: item.name }));
    const incomeCats: any[] = [];
    for (const item of requireList(payload, 'income_categories')) incomeCats.push(await getOrCreate('income_categories', 'name', { name: item.name }));
    const taskCats: any[] = [];
    for (const item of requireList(payload, 'task_categories')) taskCats.push(await getOrCreate('task_categories', 'name', { name: item.name }));
    const treeTypes: any[] = [];
    for (const item of requireList(payload, 'tree_types')) treeTypes.push(await getOrCreate('tree_types', 'name', { name: item.name }));
    const farms: any[] = [];
    for (const item of requireList(payload, 'farms')) {
      const existing = await db.getFirstAsync<any>('SELECT * FROM farms WHERE profile_id = ? AND title = ?', [SINGLE_PROFILE_ID, item.title]);
      if (existing) {
        farms.push(existing);
        continue;
      }
      const res = await db.runAsync(
        'INSERT INTO farms (profile_id, title, size, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, item.title, Number(item.size), item.active ?? true ? 1 : 0, nowISO(), nowISO()],
      );
      farms.push((await db.getFirstAsync<any>('SELECT * FROM farms WHERE id = ?', [res.lastInsertRowId]))!);
    }
    const vendors: any[] = [];
    for (const item of requireList(payload, 'vendors')) {
      vendors.push(await getOrCreate('vendors', 'name', { name: item.name, email: item.email ?? '', phone: item.phone ?? '', address: item.address ?? '', notes: item.notes ?? '' }));
    }
    const customers: any[] = [];
    for (const item of requireList(payload, 'customers')) {
      customers.push(await getOrCreate('customers', 'name', { name: item.name, email: item.email ?? '', phone: item.phone ?? '', address: item.address ?? '', notes: item.notes ?? '' }));
    }

    const plantings: any[] = [];
    for (const item of requireList(payload, 'tree_plantings')) {
      const farm = requireIndex(farms, item.farm, 'tree_plantings', 'farm');
      const treeType = requireIndex(treeTypes, item.tree_type, 'tree_plantings', 'tree_type');
      if (mode === 'merge') {
        const existing = await db.getFirstAsync<any>(
          'SELECT * FROM tree_plantings WHERE profile_id = ? AND farm_id = ? AND tree_type_id = ?',
          [SINGLE_PROFILE_ID, farm.id, treeType.id],
        );
        if (existing) {
          plantings.push(existing);
          continue;
        }
      }
      const res = await db.runAsync(
        'INSERT INTO tree_plantings (profile_id, farm_id, tree_type_id, count, planted_on, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, farm.id, treeType.id, item.count ?? 0, item.planted_on ?? null, item.notes ?? '', nowISO(), nowISO()],
      );
      plantings.push((await db.getFirstAsync<any>('SELECT * FROM tree_plantings WHERE id = ?', [res.lastInsertRowId]))!);
    }

    let movementItems: any[] = payload.version === 1 ? [] : requireList(payload, 'tree_movements');
    if (payload.version === 1) {
      movementItems = requireList(payload, 'tree_plantings')
        .map((item: any, index: number) => ({
          planting: index,
          action: 'add',
          quantity: item.count ?? 0,
          effective_date: item.planted_on ?? new Date().toISOString().slice(0, 10),
          notes: 'Opening balance imported from a legacy backup.',
        }))
        .filter((m: any) => (m.quantity ?? 0) > 0);
    }
    for (const item of movementItems) {
      const planting = requireIndex(plantings, item.planting, 'tree_movements', 'planting');
      if (mode === 'merge') {
        const dup = await db.getFirstAsync<{ n: number }>(
          'SELECT COUNT(*) AS n FROM tree_inventory_movements WHERE profile_id = ? AND planting_id = ? AND action = ? AND quantity = ? AND effective_date = ? AND notes = ?',
          [SINGLE_PROFILE_ID, planting.id, item.action, item.quantity ?? 0, item.effective_date, item.notes ?? ''],
        );
        if ((dup?.n ?? 0) > 0) continue;
      }
      await db.runAsync(
        'INSERT INTO tree_inventory_movements (profile_id, planting_id, action, quantity, effective_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, planting.id, item.action, item.quantity ?? 0, item.effective_date, item.notes ?? '', nowISO()],
      );
    }
    counts.tree_movements = movementItems.length;

    const expenses: any[] = [];
    for (const item of requireList(payload, 'expenses')) {
      const farm = requireIndex(farms, item.farm, 'expenses', 'farm');
      const category = requireIndex(expenseCats, item.category, 'expenses', 'category');
      const vendor = item.vendor != null ? requireIndex(vendors, item.vendor, 'expenses', 'vendor') : null;
      if (mode === 'merge') {
        const dup = await db.getFirstAsync<any>(
          'SELECT * FROM expenses WHERE profile_id = ? AND farm_id = ? AND title = ? AND date = ? AND amount = ?',
          [SINGLE_PROFILE_ID, farm.id, item.title ?? '', item.date, item.amount ?? 0],
        );
        if (dup) {
          expenses.push(dup);
          continue;
        }
      }
      const res = await db.runAsync(
        'INSERT INTO expenses (profile_id, farm_id, category_id, vendor_id, title, description, amount, date, document_type, include_in_tax, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, farm.id, category.id, vendor?.id ?? null, item.title ?? '', item.description ?? '', item.amount ?? 0, item.date,
          checkedDocument(item.document_type, 'expenses'), item.include_in_tax ? 1 : 0, item.is_archived ? 1 : 0, nowISO(), nowISO()],
      );
      expenses.push((await db.getFirstAsync<any>('SELECT * FROM expenses WHERE id = ?', [res.lastInsertRowId]))!);
    }

    const incomes: any[] = [];
    const incomeItems: any[] = requireList(payload, 'incomes');
    for (const item of incomeItems) {
      const category = requireIndex(incomeCats, item.category, 'incomes', 'category');
      const customer = item.customer != null ? requireIndex(customers, item.customer, 'incomes', 'customer') : null;
      if (mode === 'merge') {
        const dup = await db.getFirstAsync<any>(
          'SELECT * FROM incomes WHERE profile_id = ? AND title = ? AND date = ? AND amount = ?',
          [SINGLE_PROFILE_ID, item.title ?? '', item.date, item.amount ?? 0],
        );
        if (dup) {
          incomes.push(dup);
          continue;
        }
      }
      const res = await db.runAsync(
        'INSERT INTO incomes (profile_id, category_id, customer_id, title, description, amount, date, document_type, include_in_tax, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, category.id, customer?.id ?? null, item.title ?? '', item.description ?? '', item.amount ?? 0, item.date,
          checkedDocument(item.document_type, 'incomes'), item.include_in_tax ?? true ? 1 : 0, item.is_archived ? 1 : 0, nowISO(), nowISO()],
      );
      incomes.push((await db.getFirstAsync<any>('SELECT * FROM incomes WHERE id = ?', [res.lastInsertRowId]))!);
    }
    for (let i = 0; i < incomes.length; i++) {
      const income = incomes[i];
      const item = incomeItems[i];
      const allocationItems: any[] = payload.version >= 3
        ? (item.allocations ?? [])
        : item.farm != null ? [{ farm: item.farm, amount: item.amount ?? 0 }] : [];
      let allocated = 0;
      for (const a of allocationItems) {
        const farm = requireIndex(farms, a.farm, 'incomes', 'farm');
        const existing = await db.getFirstAsync<any>(
          'SELECT * FROM income_farm_allocations WHERE profile_id = ? AND income_id = ? AND farm_id = ?',
          [SINGLE_PROFILE_ID, income.id, farm.id],
        );
        if (existing && mode === 'merge') {
          allocated += Number(existing.amount);
          continue;
        }
        if (existing) continue;
        await db.runAsync(
          'INSERT INTO income_farm_allocations (profile_id, income_id, farm_id, amount) VALUES (?, ?, ?, ?)',
          [SINGLE_PROFILE_ID, income.id, farm.id, a.amount ?? 0],
        );
        allocated += Number(a.amount ?? 0);
      }
      if (allocated > Number(income.amount) + 0.000001) throw new BackupError('Income allocations exceed the income amount.');
    }

    let createdTasks = 0;
    for (const item of requireList(payload, 'tasks')) {
      const farm = requireIndex(farms, item.farm, 'tasks', 'farm');
      const category = requireIndex(taskCats, item.category, 'tasks', 'category');
      const planting = item.planting != null ? requireIndex(plantings, item.planting, 'tasks', 'planting') : null;
      const expense = item.expense != null ? requireIndex(expenses, item.expense, 'tasks', 'expense') : null;
      if (mode === 'merge') {
        const dup = await db.getFirstAsync<{ n: number }>(
          'SELECT COUNT(*) AS n FROM farm_tasks WHERE profile_id = ? AND farm_id = ? AND title = ? AND date = ?',
          [SINGLE_PROFILE_ID, farm.id, item.title ?? '', item.date],
        );
        if ((dup?.n ?? 0) > 0) continue;
      }
      await db.runAsync(
        'INSERT INTO farm_tasks (profile_id, farm_id, planting_id, category_id, expense_id, title, description, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [SINGLE_PROFILE_ID, farm.id, planting?.id ?? null, category.id, expense?.id ?? null, item.title ?? '', item.description ?? '', item.date, nowISO(), nowISO()],
      );
      createdTasks += 1;
    }
    if (payload.display_name && mode === 'replace') {
      await db.runAsync("UPDATE profiles SET display_name = ?, updated_at = datetime('now') WHERE id = ?", [payload.display_name, SINGLE_PROFILE_ID]);
    }
    counts.tasks = mode === 'merge' ? createdTasks : requireList(payload, 'tasks').length;
  });
  return counts;
}
