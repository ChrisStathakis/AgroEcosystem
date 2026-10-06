import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type Production, type ProductionIncomeLink, type ProductionUnit } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { assertHarvestYear, assertNonEmpty, assertProductionUnit, assertQuantity } from '../../lib/validation';

export interface ProductionFilters {
  q?: string;
  farm_id?: number;
  tree_type_id?: number;
  year?: number;
  unit?: ProductionUnit;
  linked?: 'all' | 'linked' | 'unlinked';
  income_id?: number;
}

export interface ProductionInput {
  farm_id: number;
  tree_type_id: number;
  year: number;
  quantity: number;
  unit: ProductionUnit;
  notes?: string;
  income_ids?: number[];
}

function whereClause(filters: ProductionFilters): { sql: string; params: SQLiteBindValue[] } {
  let sql = `p.profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (filters.q?.trim()) {
    sql += ` AND (p.notes LIKE ? OR f.title LIKE ? OR t.name LIKE ?)`;
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q);
  }
  if (filters.farm_id) {
    sql += ` AND p.farm_id = ?`;
    params.push(filters.farm_id);
  }
  if (filters.tree_type_id) {
    sql += ` AND p.tree_type_id = ?`;
    params.push(filters.tree_type_id);
  }
  if (filters.year) {
    sql += ` AND p.year = ?`;
    params.push(filters.year);
  }
  if (filters.unit) {
    sql += ` AND p.unit = ?`;
    params.push(filters.unit);
  }
  if (filters.linked === 'linked') {
    sql += ` AND EXISTS (SELECT 1 FROM production_income_links l WHERE l.production_id = p.id)`;
  } else if (filters.linked === 'unlinked') {
    sql += ` AND NOT EXISTS (SELECT 1 FROM production_income_links l WHERE l.production_id = p.id)`;
  }
  if (filters.income_id) {
    sql += ` AND EXISTS (SELECT 1 FROM production_income_links l WHERE l.production_id = p.id AND l.income_id = ?)`;
    params.push(filters.income_id);
  }
  return { sql, params };
}

export async function listProductions(filters: ProductionFilters = {}): Promise<Production[]> {
  const db = getDb();
  const { sql, params } = whereClause(filters);
  return db.getAllAsync<Production>(
    `SELECT p.*, f.title AS farm_title, t.name AS tree_type_name,
      (SELECT GROUP_CONCAT(i.title || ' (' || printf('%.2f', i.amount) || ')', ', ')
        FROM production_income_links l JOIN incomes i ON i.id = l.income_id WHERE l.production_id = p.id) AS income_summary
     FROM productions p JOIN farms f ON f.id = p.farm_id JOIN tree_types t ON t.id = p.tree_type_id
     WHERE ${sql} ORDER BY p.year DESC, f.title ASC, t.name ASC, p.id DESC`,
    params,
  );
}

export async function listProductionIncomeLinks(productionId: number): Promise<ProductionIncomeLink[]> {
  const db = getDb();
  return db.getAllAsync<ProductionIncomeLink>(
    `SELECT l.*, i.title AS income_title, i.amount AS income_amount
     FROM production_income_links l JOIN incomes i ON i.id = l.income_id
     WHERE l.profile_id = ? AND l.production_id = ? ORDER BY i.date DESC, i.id DESC`,
    [SINGLE_PROFILE_ID, productionId],
  );
}

function assertProductionCommon(input: ProductionInput) {
  assertHarvestYear(input.year);
  assertQuantity(input.quantity);
  assertProductionUnit(input.unit);
}

export async function createProduction(input: ProductionInput): Promise<number> {
  assertProductionCommon(input);
  const db = getDb();
  let productionId = 0;
  await db.withTransactionAsync(async () => {
    const farm = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM farms WHERE id = ?', [input.farm_id]);
    if (!farm || farm.profile_id !== SINGLE_PROFILE_ID) throw new Error('Selected farm must belong to this workspace.');
    const treeType = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM tree_types WHERE id = ?', [input.tree_type_id]);
    if (!treeType || treeType.profile_id !== SINGLE_PROFILE_ID) throw new Error('Selected tree type must belong to this workspace.');
    const incomeIds = [...new Set(input.income_ids ?? [])];
    for (const incomeId of incomeIds) {
      const income = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM incomes WHERE id = ?', [incomeId]);
      if (!income || income.profile_id !== SINGLE_PROFILE_ID) throw new Error('Linked income must belong to this workspace.');
    }
    const now = nowISO();
    try {
      const res = await db.runAsync(
        `INSERT INTO productions (profile_id, farm_id, tree_type_id, year, quantity, unit, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [SINGLE_PROFILE_ID, input.farm_id, input.tree_type_id, input.year, input.quantity, input.unit, input.notes ?? '', now, now],
      );
      productionId = res.lastInsertRowId;
    } catch (e: any) {
      if (String(e?.message ?? '').includes('UNIQUE')) throw new Error('One record per farm, year and tree type already exists.');
      throw e;
    }
    for (const incomeId of incomeIds) {
      await db.runAsync(
        'INSERT INTO production_income_links (profile_id, production_id, income_id) VALUES (?, ?, ?)',
        [SINGLE_PROFILE_ID, productionId, incomeId],
      );
    }
  });
  return productionId;
}

export async function updateProduction(id: number, input: ProductionInput): Promise<void> {
  assertProductionCommon(input);
  const db = getDb();
  await db.withTransactionAsync(async () => {
    const farm = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM farms WHERE id = ?', [input.farm_id]);
    if (!farm || farm.profile_id !== SINGLE_PROFILE_ID) throw new Error('Selected farm must belong to this workspace.');
    const treeType = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM tree_types WHERE id = ?', [input.tree_type_id]);
    if (!treeType || treeType.profile_id !== SINGLE_PROFILE_ID) throw new Error('Selected tree type must belong to this workspace.');
    const incomeIds = [...new Set(input.income_ids ?? [])];
    for (const incomeId of incomeIds) {
      const income = await db.getFirstAsync<{ profile_id: number }>('SELECT profile_id FROM incomes WHERE id = ?', [incomeId]);
      if (!income || income.profile_id !== SINGLE_PROFILE_ID) throw new Error('Linked income must belong to this workspace.');
    }
    try {
      await db.runAsync(
        `UPDATE productions SET farm_id = ?, tree_type_id = ?, year = ?, quantity = ?, unit = ?, notes = ?, updated_at = ?
         WHERE id = ? AND profile_id = ?`,
        [input.farm_id, input.tree_type_id, input.year, input.quantity, input.unit, input.notes ?? '', nowISO(), id, SINGLE_PROFILE_ID],
      );
    } catch (e: any) {
      if (String(e?.message ?? '').includes('UNIQUE')) throw new Error('One record per farm, year and tree type already exists.');
      throw e;
    }
    await db.runAsync('DELETE FROM production_income_links WHERE production_id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
    for (const incomeId of incomeIds) {
      await db.runAsync(
        'INSERT INTO production_income_links (profile_id, production_id, income_id) VALUES (?, ?, ?)',
        [SINGLE_PROFILE_ID, id, incomeId],
      );
    }
  });
}

export async function deleteProduction(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM productions WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}

export async function productionTotalsByUnit(farmId?: number, year?: number): Promise<Array<{ unit: ProductionUnit; total: number }>> {
  const db = getDb();
  let sql = `SELECT unit, SUM(quantity) AS total FROM productions WHERE profile_id = ?`;
  const params: SQLiteBindValue[] = [SINGLE_PROFILE_ID];
  if (farmId) {
    sql += ` AND farm_id = ?`;
    params.push(farmId);
  }
  if (year) {
    sql += ` AND year = ?`;
    params.push(year);
  }
  sql += ` GROUP BY unit ORDER BY unit`;
  return db.getAllAsync(sql, params);
}

export { assertNonEmpty };
