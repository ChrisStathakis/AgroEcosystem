// Port of the server's shared-expense split helpers (analytics/services.py
// farm_tree_weights + farm_share_ratio, expenses/models.py):
// an expense with no farm is "shared" and counts towards every farm, split
// proportionally to current tree counts (equal split when no trees exist).
import { getDb } from '../client';
import { SINGLE_PROFILE_ID } from '../types';

export interface TreeWeights {
  weights: Map<number, number>;
  total: number;
}

/** Current tree counts per farm: {farm_id: trees} + total (server: farm_tree_weights). */
export async function farmTreeWeights(): Promise<TreeWeights> {
  const db = getDb();
  const farms = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM farms WHERE profile_id = ? ORDER BY title',
    [SINGLE_PROFILE_ID],
  );
  const rows = await db.getAllAsync<{ farm_id: number; total: number | null }>(
    'SELECT farm_id, SUM(count) AS total FROM tree_plantings WHERE profile_id = ? GROUP BY farm_id',
    [SINGLE_PROFILE_ID],
  );
  const totals = new Map<number, number>(rows.map((r) => [r.farm_id, Number(r.total ?? 0)]));
  const weights = new Map<number, number>();
  let total = 0;
  for (const farm of farms) {
    const trees = totals.get(farm.id) ?? 0;
    weights.set(farm.id, trees);
    total += trees;
  }
  return { weights, total };
}

/** Portion of a shared expense attributable to one farm (server: farm_share_ratio). */
export function shareRatio(w: TreeWeights, farmId: number): number {
  if (!w.weights.size) return 0;
  if (w.total > 0) return (w.weights.get(farmId) ?? 0) / w.total;
  if (!w.weights.has(farmId)) return 0;
  return 1 / w.weights.size;
}

/** Async convenience wrapper: ratio for one farm (loads weights itself). */
export async function farmShareRatio(farmId: number): Promise<number> {
  return shareRatio(await farmTreeWeights(), farmId);
}

/**
 * SQL expression replacing `${alias}.amount` so shared rows are counted at
 * this farm's share. Pass `ratio = null` when no farm filter is active —
 * then the global total is simply the sum (shared rows count once).
 *
 * The ratio is a computed number interpolated into the SQL, never user input.
 */
export function expenseAmountExpr(alias: string, ratio: number | null | undefined): string {
  if (ratio == null) return `${alias}.amount`;
  return `CASE WHEN ${alias}.farm_id IS NULL THEN ${alias}.amount * ${ratio} ELSE ${alias}.amount END`;
}
