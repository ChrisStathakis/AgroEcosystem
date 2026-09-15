// Ports server/frontend/forms.py validation rules.
export function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');
}

export function assertPositiveSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) throw new Error('Enter a size greater than zero.');
}

export function assertPositiveCount(count: number): void {
  if (!Number.isInteger(count) || count <= 0) throw new Error('Enter a number of trees greater than zero.');
}

export function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

export function assertDateRange(start?: string, end?: string): void {
  if (start && end && start > end) throw new Error('The end date must be on or after the start date.');
}

export function assertSameFarm(selectedFarmId: number, relatedFarmId: number, label: string): void {
  if (selectedFarmId !== relatedFarmId) throw new Error(`${label} must belong to the selected farm.`);
}

export function assertAllocationTotal(allocations: Array<{ farm_id: number; amount: number }>, incomeAmount: number): void {
  const seen = new Set<number>();
  let total = 0;
  for (const a of allocations) {
    if (seen.has(a.farm_id)) throw new Error('Each farm can be selected only once.');
    if (!Number.isFinite(a.amount) || a.amount <= 0) throw new Error('Allocation amounts must be greater than zero.');
    seen.add(a.farm_id);
    total += a.amount;
  }
  if (total > incomeAmount + 0.000001) throw new Error('Farm allocations cannot exceed the income amount.');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function assertISODate(value: string, field = 'Date'): void {
  if (!DATE_RE.test(value)) throw new Error(`${field} must be YYYY-MM-DD.`);
}
