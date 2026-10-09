import { getDb } from '../client';
import { MAX_HOME_PERIODS, SINGLE_PROFILE_ID, type HomePeriod } from '../types';

function periodError(en: string, el: string): Error {
  let greek = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    greek = require('../../lib/i18n').isGreek();
  } catch {
    greek = false;
  }
  return new Error(greek ? el : en);
}

export function validatePeriodMonths(startMonth: number, endMonth: number): void {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw periodError('Start month must be 1–12.', 'Ο αρχικός μήνας πρέπει να είναι 1–12.');
  }
  if (!Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12) {
    throw periodError('End month must be 1–12.', 'Ο τελικός μήνας πρέπει να είναι 1–12.');
  }
  if (startMonth > endMonth) {
    throw periodError('Start month must be on or before end month.', 'Ο αρχικός μήνας πρέπει να είναι πριν ή ίσος με τον τελικό.');
  }
}

export async function listHomePeriods(): Promise<HomePeriod[]> {
  return getDb().getAllAsync<HomePeriod>(
    'SELECT * FROM home_periods WHERE profile_id = ? ORDER BY sort_order, start_month, id',
    [SINGLE_PROFILE_ID],
  );
}

export async function createHomePeriod(name: string, startMonth: number, endMonth: number): Promise<number> {
  const clean = name.trim();
  if (!clean) throw periodError('Name is required.', 'Το όνομα είναι υποχρεωτικό.');
  validatePeriodMonths(startMonth, endMonth);
  const db = getDb();
  const count = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM home_periods WHERE profile_id = ?',
    [SINGLE_PROFILE_ID],
  );
  if ((count?.n ?? 0) >= MAX_HOME_PERIODS) {
    throw periodError(
      `You can keep up to ${MAX_HOME_PERIODS} periods.`,
      `Μπορείτε να κρατήσετε έως ${MAX_HOME_PERIODS} περιόδους.`,
    );
  }
  try {
    const order = await db.getFirstAsync<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM home_periods WHERE profile_id = ?',
      [SINGLE_PROFILE_ID],
    );
    const res = await db.runAsync(
      'INSERT INTO home_periods (profile_id, name, start_month, end_month, sort_order) VALUES (?, ?, ?, ?, ?)',
      [SINGLE_PROFILE_ID, clean, startMonth, endMonth, (order?.m ?? -1) + 1],
    );
    return res.lastInsertRowId;
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      throw periodError('This name already exists.', 'Αυτό το όνομα υπάρχει ήδη.');
    }
    throw e;
  }
}

export async function updateHomePeriod(id: number, name: string, startMonth: number, endMonth: number): Promise<void> {
  const clean = name.trim();
  if (!clean) throw periodError('Name is required.', 'Το όνομα είναι υποχρεωτικό.');
  validatePeriodMonths(startMonth, endMonth);
  try {
    await getDb().runAsync(
      'UPDATE home_periods SET name = ?, start_month = ?, end_month = ? WHERE id = ? AND profile_id = ?',
      [clean, startMonth, endMonth, id, SINGLE_PROFILE_ID],
    );
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      throw periodError('This name already exists.', 'Αυτό το όνομα υπάρχει ήδη.');
    }
    throw e;
  }
}

export async function deleteHomePeriod(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM home_periods WHERE id = ? AND profile_id = ?', [id, SINGLE_PROFILE_ID]);
}

/** Resolve a month-range period to concrete YYYY-MM-DD bounds for a year. */
export function periodBounds(year: number, startMonth: number, endMonth: number): { start: string; end: string } {
  const lastDay = new Date(year, endMonth, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${year}-${pad(startMonth)}-01`, end: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}
