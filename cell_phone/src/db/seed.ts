import { getDb } from './client';
import { DEFAULT_HOME_PERIODS, nowISO, SINGLE_PROFILE_ID } from './types';

/** Starter lookup values for a fresh workspace. Idempotent. */
export async function seedDefaults(): Promise<void> {
  const db = getDb();
  const now = nowISO();
  const simple: Record<string, string[]> = {
    expense_categories: ['Seeds', 'Fertilizer', 'Labor', 'Fuel'],
    income_categories: ['Harvest sale', 'Market sale'],
  };
  const dated: Record<string, string[]> = {
    tree_types: ['Olive', 'Orange'],
    task_categories: ['Watering (Potisma)', 'Fertilizing (Lipasma)', 'Pruning'],
  };
  for (const [table, names] of Object.entries(simple)) {
    for (const name of names) {
      await db.runAsync(
        `INSERT INTO ${table} (profile_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING;`,
        [SINGLE_PROFILE_ID, name],
      );
    }
  }
  for (const [table, names] of Object.entries(dated)) {
    for (const name of names) {
      await db.runAsync(
        `INSERT INTO ${table} (profile_id, name, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING;`,
        [SINGLE_PROFILE_ID, name, now],
      );
    }
  }
  // Default home-page periods (Q1-Q4). Seeded only for a fresh workspace
  // (no periods and no core data) so deleting all periods sticks.
  const existing = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM home_periods WHERE profile_id = ?',
    [SINGLE_PROFILE_ID],
  );
  if ((existing?.n ?? 0) === 0) {
    let hasData = false;
    for (const t of ['farms', 'expenses', 'incomes', 'tree_plantings'] as const) {
      try {
        const row = await db.getFirstAsync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${t} WHERE profile_id = ?`,
          [SINGLE_PROFILE_ID],
        );
        if ((row?.n ?? 0) > 0) {
          hasData = true;
          break;
        }
      } catch {
        // Table may not exist on very old DBs — ignore.
      }
    }
    if (!hasData) {
      for (let i = 0; i < DEFAULT_HOME_PERIODS.length; i++) {
        const p = DEFAULT_HOME_PERIODS[i];
        await db.runAsync(
          `INSERT INTO home_periods (profile_id, name, start_month, end_month, sort_order) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING;`,
          [SINGLE_PROFILE_ID, p.name, p.start_month, p.end_month, i],
        );
      }
    }
  }
}
