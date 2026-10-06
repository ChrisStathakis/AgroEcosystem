// Minimal EN/EL localization port of server RESOURCES_EL + forms EL labels.
export type Lang = 'en' | 'el';

let current: Lang = 'en';
const listeners = new Set<() => void>();
let loaded = false;

const LANG_FILE = 'agro-lang.json';

function langFile() {
  // Lazy-require expo-file-system so unit/smoke (node) environments don't crash.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('expo-file-system');
  const dir = fs.Paths?.document ?? fs.Paths?.cache;
  if (!dir) return null;
  return new fs.File(dir, LANG_FILE);
}

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  for (const fn of listeners) fn();
  // Fire-and-forget persistence; callers stay synchronous.
  persistLang(l).catch(() => {});
}

async function persistLang(l: Lang): Promise<void> {
  try {
    const file = langFile();
    if (!file) return;
    file.write(JSON.stringify({ lang: l }));
  } catch {
    // Persistence is best-effort; in-memory value still applies.
  }
}

export async function loadLang(): Promise<Lang> {
  if (loaded) return current;
  try {
    const file = langFile();
    if (file?.exists) {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as { lang?: Lang };
      if (parsed.lang === 'en' || parsed.lang === 'el') {
        current = parsed.lang;
      }
    }
  } catch {
    // Keep default 'en' on any read/parse error.
  }
  loaded = true;
  for (const fn of listeners) fn();
  return current;
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isGreek(): boolean {
  return current === 'el';
}

const MONTH_EL: Record<string, string> = {
  Jan: 'Ιαν', Feb: 'Φεβ', Mar: 'Μαρ', Apr: 'Απρ', May: 'Μάι', Jun: 'Ιουν',
  Jul: 'Ιουλ', Aug: 'Αυγ', Sep: 'Σεπ', Oct: 'Οκτ', Nov: 'Νοε', Dec: 'Δεκ',
};

export function localizeMonthLabel(label: string): string {
  if (!isGreek()) return label;
  const parts = String(label).split(' ');
  parts[0] = MONTH_EL[parts[0]] ?? parts[0];
  return parts.join(' ');
}

const STRINGS: Record<string, { en: string; el: string }> = {
  overview: { en: 'Overview', el: 'Επισκόπηση' },
  farms: { en: 'Your farms', el: 'Οι φάρμες μου' },
  trees: { en: 'Trees/Crops', el: 'Δέντρα/Καλλιέργειες' },
  tasks: { en: 'Tasks', el: 'Εργασίες' },
  expenses: { en: 'Expenses', el: 'Έξοδα' },
  incomes: { en: 'Income', el: 'Έσοδα' },
  vendors: { en: 'Vendors', el: 'Προμηθευτές' },
  customers: { en: 'Customers', el: 'Πελάτες' },
  expense_categories: { en: 'Expense categories', el: 'Κατηγορίες εξόδων' },
  income_categories: { en: 'Income categories', el: 'Κατηγορίες εσόδων' },
  tree_types: { en: 'Tree/crop types', el: 'Είδη δέντρων/καλλιεργειών' },
  task_categories: { en: 'Task categories', el: 'Κατηγορίες εργασιών' },
  analytics: { en: 'Analytics', el: 'Αναλύσεις' },
  production: { en: 'Production', el: 'Παραγωγή' },
  productions: { en: 'Production', el: 'Παραγωγή' },
  upcoming_payments: { en: 'Upcoming payments', el: 'Επερχόμενες πληρωμές' },
  overdue: { en: 'Overdue', el: 'Ληξιπρόθεσμα' },
  unpaid: { en: 'Unpaid', el: 'Απλήρωτα' },
  unallocated_income: { en: 'Unallocated income', el: 'Έσοδα χωρίς κατανομή' },
  unlinked_harvests: { en: 'Unlinked harvests', el: 'Σοδειές χωρίς σύνδεση' },
  recent_tasks: { en: 'Recent tasks', el: 'Πρόσφατες εργασίες' },
  recent_harvests: { en: 'Recent harvests', el: 'Πρόσφατες σοδειές' },
  no_tasks_lately: { en: 'No tasks in the last 14 days.', el: 'Καμία εργασία τις τελευταίες 14 μέρες.' },
  nothing_owed: { en: 'Nothing owed — every expense is paid.', el: 'Τίποτα ανοιχτό — όλα τα έξοδα είναι πληρωμένα.' },
  year: { en: 'Year', el: 'Έτος' },
  quantity: { en: 'Quantity', el: 'Ποσότητα' },
  unit: { en: 'Unit', el: 'Μονάδα' },
  incomes_linked: { en: 'Linked income', el: 'Συνδεδεμένα έσοδα' },
  unlinked: { en: 'Unlinked', el: 'Χωρίς σύνδεση' },
  linked_only: { en: 'Linked only', el: 'Μόνο συνδεδεμένα' },
  settings: { en: 'Workspace settings', el: 'Ρυθμίσεις χώρου' },
  search: { en: 'Search…', el: 'Αναζήτηση…' },
  unallocated: { en: 'Unallocated', el: 'Χωρίς κατανομή' },
  other: { en: 'Other', el: 'Άλλα' },
  archived: { en: 'Archived', el: 'Αρχειοθετημένο' },
  active: { en: 'Active', el: 'Ενεργή' },
  // Forms / filters (port of server EL_FIELD_LABELS + empty labels)
  title: { en: 'Title', el: 'Τίτλος' },
  amount: { en: 'Amount', el: 'Ποσό' },
  date: { en: 'Date', el: 'Ημερομηνία' },
  farm: { en: 'Farm', el: 'Φάρμα' },
  category: { en: 'Category', el: 'Κατηγορία' },
  vendor: { en: 'Vendor', el: 'Προμηθευτής' },
  customer: { en: 'Customer', el: 'Πελάτης' },
  description: { en: 'Description', el: 'Περιγραφή' },
  all_farms: { en: 'All farms', el: 'Όλες οι φάρμες' },
  all_categories: { en: 'All categories', el: 'Όλες οι κατηγορίες' },
  all_contacts: { en: 'All contacts', el: 'Όλες οι επαφές' },
  none: { en: 'None', el: 'Καμία επιλογή' },
  all: { en: 'All', el: 'Όλα' },
  invoice: { en: 'Invoice', el: 'Τιμολόγιο' },
  receipt: { en: 'Receipt', el: 'Απόδειξη' },
  taxed_only: { en: 'Taxed only', el: 'Μόνο με σήμανση' },
  untaxed_only: { en: 'Untaxed only', el: 'Χωρίς σήμανση' },
  tax_all: { en: 'All', el: 'Όλα' },
  apply: { en: 'Apply', el: 'Εφαρμογή' },
  apply_filters: { en: 'Apply filters', el: 'Εφαρμογή φίλτρων' },
  create: { en: 'Create', el: 'Δημιουργία' },
  save: { en: 'Save', el: 'Αποθήκευση' },
  cancel: { en: 'Cancel', el: 'Ακύρωση' },
  edit: { en: 'Edit', el: 'Επεξεργασία' },
  del: { en: 'Delete', el: 'Διαγραφή' },
  add: { en: 'Add', el: 'Προσθήκη' },
  year: { en: 'Year', el: 'Έτος' },
  from: { en: 'From YYYY-MM-DD', el: 'Από ΕΕΕΕ-ΜΜ-ΗΗ' },
  to: { en: 'To YYYY-MM-DD', el: 'Έως ΕΕΕΕ-ΜΜ-ΗΗ' },
  latest_activity: { en: 'Latest activity', el: 'Πρόσφατη δραστηριότητα' },
  profit_per_farm: { en: 'Profit per farm', el: 'Κέρδος ανά φάρμα' },
  top_categories: { en: 'Top categories', el: 'Κορυφαίες κατηγορίες' },
  no_data_filters: { en: 'No records match these filters.', el: 'Δεν υπάρχουν εγγραφές για αυτά τα φίλτρα.' },
  quick_add_hint: { en: 'You stay on the same form; the new item is selected automatically.', el: 'Παραμένετε στην ίδια φόρμα· το νέο στοιχείο επιλέγεται αυτόματα.' },
  // Payment status (server 0006) + shared expenses (server 0005)
  paid: { en: 'Paid', el: 'Πληρωμένο' },
  unpaid: { en: 'Unpaid', el: 'Απλήρωτο' },
  paid_only: { en: 'Paid only', el: 'Μόνο πληρωμένα' },
  unpaid_only: { en: 'Unpaid only', el: 'Μόνο απλήρωτα' },
  all_farms_split: { en: 'All farms (split)', el: 'Όλες οι φάρμες (επιμερισμός)' },
  farm_split_placeholder: { en: 'All farms — split by trees', el: 'Όλες οι φάρμες — επιμερισμός με δέντρα' },
  // Obligations report (server analytics_obligations)
  obligations: { en: 'Obligations', el: 'Υποχρεώσεις' },
  unpaid_total: { en: 'Unpaid total', el: 'Σύνολο απλήρωτων' },
  overdue: { en: 'Overdue', el: 'Ληξιπρόθεσμα' },
  open_items: { en: 'Open items', el: 'Ανοιχτά' },
  per_farm: { en: 'Per farm', el: 'Ανά φάρμα' },
  shared_split_hint: { en: 'Shared expenses split by tree count', el: 'Τα κοινά έξοδα επιμερίζονται με βάση τα δέντρα' },
  obligations_hint: { en: 'Control this with the “Paid” flag on each expense. Overdue means dated before today.', el: 'Ελέγξτε το με το πεδίο «Πληρωμένο» σε κάθε έξοδο. Ληξιπρόθεσμο σημαίνει με ημερομηνία πριν από σήμερα.' },
  obligations_empty: { en: 'No unpaid expenses match these filters.', el: 'Καμία απλήρωτη εγγραφή δεν ταιριάζει με αυτά τα φίλτρα.' },
  // Appearance (theme preference, Settings screen)
  appearance: { en: 'Appearance', el: 'Εμφάνιση' },
  appearance_hint: { en: 'Follow the phone setting, or lock the app to light or dark.', el: 'Ακολούθησε τη ρύθμιση του τηλεφώνου ή κλείδωσε την εφαρμογή σε ανοιχτό ή σκοτεινό.' },
  theme_light: { en: 'Light', el: 'Φωτεινό' },
  theme_dark: { en: 'Dark', el: 'Σκοτεινό' },
  theme_system: { en: 'System', el: 'Σύστημα' },
};

export function t(key: keyof typeof STRINGS | string): string {
  const entry = (STRINGS as Record<string, { en: string; el: string }>)[key];
  if (!entry) return key;
  return isGreek() ? entry.el : entry.en;
}

export function localizeFarmName(name: string): string {
  if (name === 'Unallocated' && isGreek()) return 'Χωρίς κατανομή';
  return name;
}

export function localizeCategoryName(name: string): string {
  if (name === 'Other' && isGreek()) return 'Άλλα';
  if (name === 'Unallocated' && isGreek()) return 'Χωρίς κατανομή';
  return name;
}
