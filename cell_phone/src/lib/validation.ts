// Ports server/frontend/forms.py validation rules (bilingual EN/EL to match Django forms).
import { isGreek } from './i18n';

function msg(en: string, el: string): string {
  try {
    return isGreek() ? el : en;
  } catch {
    return en;
  }
}

export function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(msg('Enter an amount greater than zero.', 'Εισαγάγετε ποσό μεγαλύτερο από μηδέν.'));
}

export function assertPositiveSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) throw new Error(msg('Enter a size greater than zero.', 'Εισαγάγετε μέγεθος μεγαλύτερο από μηδέν.'));
}

export function assertPositiveCount(count: number): void {
  if (!Number.isInteger(count) || count <= 0) throw new Error(msg('Enter a number of trees greater than zero.', 'Εισαγάγετε αριθμό δέντρων μεγαλύτερο από μηδέν.'));
}

/** Server TreePlantingForm allows count >= 0 (0-count groups stay in history, hidden from inventory). */
export function assertNonNegativeCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) throw new Error(msg('Enter a number of trees of zero or more.', 'Εισαγάγετε αριθμό δέντρων μηδέν ή περισσότερο.'));
}

export function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(msg(`${field} is required.`, `Το πεδίο «${field}» είναι υποχρεωτικό.`));
}

export function assertDateRange(start?: string, end?: string): void {
  if (start && end && start > end) throw new Error(msg('The end date must be on or after the start date.', 'Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη.'));
}

export function assertSameFarm(selectedFarmId: number, relatedFarmId: number, label: string): void {
  if (selectedFarmId !== relatedFarmId) throw new Error(msg(`${label} must belong to the selected farm.`, `Το «${label}» πρέπει να ανήκει στην επιλεγμένη φάρμα.`));
}

export function assertAllocationTotal(allocations: Array<{ farm_id: number; amount: number }>, incomeAmount: number): void {
  const seen = new Set<number>();
  let total = 0;
  for (const a of allocations) {
    if (seen.has(a.farm_id)) throw new Error(msg('Each farm can be selected only once.', 'Κάθε φάρμα μπορεί να επιλεγεί μόνο μία φορά.'));
    if (!Number.isFinite(a.amount) || a.amount <= 0) throw new Error(msg('Allocation amounts must be greater than zero.', 'Τα ποσά κατανομής πρέπει να είναι μεγαλύτερα από μηδέν.'));
    seen.add(a.farm_id);
    total += a.amount;
  }
  if (total > incomeAmount + 0.000001) throw new Error(msg('Farm allocations cannot exceed the income amount.', 'Οι κατανομές δεν μπορούν να υπερβαίνουν το ποσό του εσόδου.'));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function assertISODate(value: string, field = 'Date'): void {
  if (!DATE_RE.test(value)) throw new Error(msg(`${field} must be YYYY-MM-DD.`, `Το «${field}» πρέπει να είναι ΕΕΕΕ-ΜΜ-ΗΗ.`));
}
