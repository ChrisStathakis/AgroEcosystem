import { getDb } from '../client';
import { nowISO, SINGLE_PROFILE_ID, type Customer, type Vendor } from '../types';
import { assertNonEmpty } from '../../lib/validation';

async function listContacts<T>(table: 'vendors' | 'customers', query: string): Promise<T[]> {
  const db = getDb();
  if (query.trim()) {
    return db.getAllAsync<T>(`SELECT * FROM ${table} WHERE profile_id = ? AND name LIKE ? ORDER BY name`, [
      SINGLE_PROFILE_ID, `%${query.trim()}%`,
    ]);
  }
  return db.getAllAsync<T>(`SELECT * FROM ${table} WHERE profile_id = ? ORDER BY name`, [SINGLE_PROFILE_ID]);
}

export const listVendors = (q = '') => listContacts<Vendor>('vendors', q);
export const listCustomers = (q = '') => listContacts<Customer>('customers', q);

export async function createContact(
  table: 'vendors' | 'customers',
  input: { name: string; email?: string; phone?: string; address?: string; notes?: string },
): Promise<number> {
  assertNonEmpty(input.name, 'Name');
  const db = getDb();
  try {
    const res = await db.runAsync(
      `INSERT INTO ${table} (profile_id, name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [SINGLE_PROFILE_ID, input.name.trim(), input.email ?? '', input.phone ?? '', input.address ?? '', input.notes ?? ''],
    );
    return res.lastInsertRowId;
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new Error('This name already exists.');
    throw e;
  }
}

export async function deleteContact(table: 'vendors' | 'customers', id: number): Promise<void> {
  const db = getDb();
  const refTable = table === 'vendors' ? 'expenses' : 'incomes';
  const refCol = table === 'vendors' ? 'vendor_id' : 'customer_id';
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${refTable} WHERE ${refCol} = ?`, [id]);
  if ((row?.n ?? 0) > 0) throw new Error('Cannot delete: still used by transactions.');
  await db.runAsync(`DELETE FROM ${table} WHERE id = ? AND profile_id = ?`, [id, SINGLE_PROFILE_ID]);
  void nowISO;
}
