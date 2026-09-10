import { getDb } from './client';
import { nowISO, SINGLE_PROFILE_ID } from './types';

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
}
