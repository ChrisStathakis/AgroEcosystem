// Minimal EN/EL localization port of server RESOURCES_EL + forms EL labels.
import { useEffect, useState } from 'react';

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

/** Re-render the calling component whenever the language changes. */
export function useLang(): Lang {
  const [, force] = useState(0);
  useEffect(() => subscribeLang(() => force((n) => n + 1)), []);
  return current;
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
  unallocated_income: { en: 'Unallocated income', el: 'Έσοδα χωρίς κατανομή' },
  unlinked_harvests: { en: 'Unlinked harvests', el: 'Σοδειές χωρίς σύνδεση' },
  recent_tasks: { en: 'Recent tasks', el: 'Πρόσφατες εργασίες' },
  recent_harvests: { en: 'Recent harvests', el: 'Πρόσφατες σοδειές' },
  no_tasks_lately: { en: 'No tasks in the last 14 days.', el: 'Καμία εργασία τις τελευταίες 14 μέρες.' },
  nothing_owed: { en: 'Nothing owed — every expense is paid.', el: 'Τίποτα ανοιχτό — όλα τα έξοδα είναι πληρωμένα.' },
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
  split_basis_label: { en: 'Split basis', el: 'Βάση επιμερισμού' },
  split_trees: { en: 'Trees (total)', el: 'Δέντρα (σύνολο)' },
  split_tree_type: { en: 'Tree/Crop (variety)', el: 'Δέντρο/Καλλιέργεια (ποικιλία)' },
  split_area: { en: 'Stremmata', el: 'Στρέμματα' },
  split_equal: { en: 'Equal', el: 'Ίσα' },
  split_tree_label: { en: 'Tree/Crop', el: 'Δέντρο/Καλλιέργεια' },
  alloc_manual: { en: 'Manual allocations', el: 'Χειροκίνητες κατανομές' },
  alloc_auto: { en: 'Auto split', el: 'Αυτόματη κατανομή' },
  unit_kg: { en: 'Kg', el: 'Κιλά' },
  unit_tn: { en: 'Tn', el: 'Τόνοι' },
  unit_l: { en: 'L', el: 'Λίτρα' },
  phone: { en: 'Phone', el: 'Τηλέφωνο' },
  email: { en: 'Email', el: 'Email' },
  address: { en: 'Address', el: 'Διεύθυνση' },
  notes: { en: 'Notes', el: 'Σημειώσεις' },
  name: { en: 'Name', el: 'Όνομα' },
  plantings: { en: 'Plantings', el: 'Φυτεύσεις' },
  record_movement: { en: 'Record tree movement', el: 'Καταγραφή κίνησης δέντρων' },
  movement_history: { en: 'Movement history', el: 'Ιστορικό κινήσεων' },
  obligations_hint: { en: 'Control this with the “Paid” flag on each expense. Overdue means dated before today.', el: 'Ελέγξτε το με το πεδίο «Πληρωμένο» σε κάθε έξοδο. Ληξιπρόθεσμο σημαίνει με ημερομηνία πριν από σήμερα.' },
  obligations_empty: { en: 'No unpaid expenses match these filters.', el: 'Καμία απλήρωτη εγγραφή δεν ταιριάζει με αυτά τα φίλτρα.' },
  // Appearance (theme preference, Settings screen)
  appearance: { en: 'Appearance', el: 'Εμφάνιση' },
  appearance_hint: { en: 'Follow the phone setting, or lock the app to light or dark.', el: 'Ακολούθησε τη ρύθμιση του τηλεφώνου ή κλείδωσε την εφαρμογή σε ανοιχτό ή σκοτεινό.' },
  theme_light: { en: 'Light', el: 'Φωτεινό' },
  theme_dark: { en: 'Dark', el: 'Σκοτεινό' },
  theme_system: { en: 'System', el: 'Σύστημα' },
  // Drawer groups + tabs
  nav_main: { en: 'MAIN', el: 'ΚΥΡΙΑ' },
  nav_money: { en: 'MONEY', el: 'ΧΡΗΜΑΤΑ' },
  nav_network: { en: 'NETWORK', el: 'ΔΙΚΤΥΟ' },
  nav_setup: { en: 'SETUP', el: 'ΡΥΘΜΙΣΕΙΣ' },
  nav_workspace: { en: 'OFFLINE WORKSPACE', el: 'ΧΩΡΟΣ ΕΡΓΑΣΙΑΣ OFFLINE' },
  tab_home: { en: 'Home', el: 'Αρχική' },
  tab_money: { en: 'Money', el: 'Χρήματα' },
  tab_stats: { en: 'Stats', el: 'Στατιστικά' },
  tab_more: { en: 'More', el: 'Άλλα' },
  // Filter dropdown
  filters: { en: 'Filters', el: 'Φίλτρα' },
  clear: { en: 'Clear', el: 'Καθαρισμός' },
  all_docs: { en: 'All docs', el: 'Όλα τα παραστατικά' },
  all_records: { en: 'All records', el: 'Όλες οι εγγραφές' },
  taxed_flag: { en: 'Tax flagged only', el: 'Μόνο με σήμανση' },
  untaxed_flag: { en: 'Unflagged only', el: 'Χωρίς σήμανση' },
  // Filter labels
  filter_farm: { en: 'Farm filter', el: 'Φίλτρο φάρμας' },
  filter_category: { en: 'Category', el: 'Κατηγορία' },
  filter_vendor: { en: 'Vendor', el: 'Προμηθευτής' },
  filter_customer: { en: 'Customer', el: 'Πελάτης' },
  filter_tree_group: { en: 'Tree group', el: 'Ομάδα δέντρων' },
  filter_planting_history: { en: 'Planting (history)', el: 'Φύτευση (ιστορικό)' },
  filter_year: { en: 'Year', el: 'Έτος' },
  filter_unit: { en: 'Unit', el: 'Μονάδα' },
  filter_doc: { en: 'Document', el: 'Παραστατικό' },
  filter_tax: { en: 'Tax', el: 'Φόρος' },
  shared: { en: 'Shared', el: 'Κοινό' },
  // Screen subtitles
  sub_default: { en: 'YOUR FARM, IN FOCUS', el: 'Η ΦΑΡΜΑ ΣΟΥ ΣΤΟ ΕΠΙΚΕΝΤΡΟ' },
  sub_overview: { en: 'THE BIG PICTURE', el: 'Η ΜΕΓΑΛΗ ΕΙΚΟΝΑ' },
  sub_farms: { en: 'FIELDS YOU STEWARD', el: 'ΤΑ ΧΩΡΑΦΙΑ ΠΟΥ ΦΡΟΝΤΙΖΕΙΣ' },
  sub_production: { en: 'HARVEST PER YEAR AND FARM', el: 'ΣΟΔΕΙΑ ΑΝΑ ΕΤΟΣ ΚΑΙ ΦΑΡΜΑ' },
  sub_trees: { en: 'HOW MANY TREES OF EACH TYPE EACH FARM HAS', el: 'ΠΟΣΑ ΔΕΝΤΡΑ ΚΑΘΕ ΕΙΔΟΥΣ ΕΧΕΙ ΚΑΘΕ ΦΑΡΜΑ' },
  sub_tasks: { en: 'HISTORY OF WORK DONE ON A FARM', el: 'ΙΣΤΟΡΙΚΟ ΕΡΓΑΣΙΩΝ ΣΤΗ ΦΑΡΜΑ' },
  sub_expenses: { en: 'EVERY INVESTMENT IN YOUR FARM', el: 'ΚΑΘΕ ΕΠΕΝΔΥΣΗ ΣΤΗ ΦΑΡΜΑ ΣΟΥ' },
  sub_incomes: { en: 'WHAT YOUR HARD WORK BRINGS IN', el: 'ΤΙ ΦΕΡΝΕΙ Η ΔΟΥΛΕΙΑ ΣΟΥ' },
  sub_vendors: { en: 'WHO YOU BUY FROM', el: 'ΑΠΟ ΠΟΙΟΥΣ ΑΓΟΡΑΖΕΙΣ' },
  sub_customers: { en: 'WHO BUYS FROM YOU', el: 'ΠΟΙΟΙ ΑΓΟΡΑΖΟΥΝ ΑΠΟ ΕΣΕΝΑ' },
  sub_analytics: { en: 'KNOW YOUR NUMBERS', el: 'ΓΝΩΡΙΣΕ ΤΑ ΝΟΥΜΕΡΑ ΣΟΥ' },
  sub_workspace: { en: 'YOUR WORKSPACE', el: 'Ο ΧΩΡΟΣ ΕΡΓΑΣΙΑΣ ΣΟΥ' },
  sub_lists: { en: 'KEEP LISTS TIDY', el: 'ΚΡΑΤΑ ΤΙΣ ΛΙΣΤΕΣ ΤΑΚΤΟΠΟΙΗΜΕΝΕΣ' },
  // Stats + hero
  stat_income: { en: 'Income', el: 'Έσοδα' },
  stat_expenses: { en: 'Expenses', el: 'Έξοδα' },
  stat_balance: { en: 'Balance', el: 'Υπόλοιπο' },
  hero_net_balance: { en: 'NET BALANCE · YEAR', el: 'ΚΑΘΑΡΟ ΥΠΟΛΟΙΠΟ · ΕΤΟΣ' },
  chart_cash_rhythm: { en: 'Cash rhythm', el: 'Ρυθμός ταμείου' },
  chart_cumulative: { en: 'Cumulative balance', el: 'Σωρευτικό υπόλοιπο' },
  chart_net_per_farm: { en: 'Net per farm', el: 'Καθαρό ανά φάρμα' },
  chart_in: { en: 'In', el: 'Μέσα' },
  chart_out: { en: 'Out', el: 'Έξω' },
  // Sections
  attention: { en: '⚠ Attention', el: '⚠ Προσοχή' },
  sec_monthly_breakdown: { en: 'Monthly breakdown', el: 'Μηνιαία ανάλυση' },
  sec_profit_farm: { en: 'Profit per farm', el: 'Κέρδος ανά φάρμα' },
  sec_by_month: { en: 'By month', el: 'Ανά μήνα' },
  sec_by_farm: { en: 'By farm', el: 'Ανά φάρμα' },
  sec_by_category: { en: 'By category', el: 'Ανά κατηγορία' },
  sec_tax_items: { en: 'Tax-flagged items', el: 'Στοιχεία με σήμανση φόρου' },
  sec_cash_running: { en: 'Cash flow (running balance)', el: 'Ταμειακή ροή (τρέχον υπόλοιπο)' },
  sec_taxable_hint: { en: 'Control this with the “Tax” checkbox on each income/expense. Guidance only.', el: 'Ελέγξτε το με το πεδίο «Φόρος» σε κάθε έσοδο/έξοδο. Μόνο ενδεικτικά.' },
  total: { en: 'Total', el: 'Σύνολο' },
  records: { en: 'records', el: 'εγγραφές' },
  contacts: { en: 'contacts', el: 'επαφές' },
  // Buttons
  btn_add_expense: { en: 'Add expense', el: 'Προσθήκη εξόδου' },
  btn_record_income: { en: 'Record income', el: 'Καταγραφή εσόδου' },
  btn_view_analytics: { en: 'View analytics', el: 'Προβολή αναλύσεων' },
  btn_new_farm: { en: '＋ New farm', el: '＋ Νέα φάρμα' },
  btn_new_task: { en: '＋ New task', el: '＋ Νέα εργασία' },
  btn_export: { en: 'Export', el: 'Εξαγωγή' },
  btn_export_current: { en: 'Export current view (CSV)', el: 'Εξαγωγή τρέχουσας προβολής (CSV)' },
  btn_search: { en: 'Search', el: 'Αναζήτηση' },
  btn_reset: { en: 'Reset', el: 'Επαναφορά' },
  btn_add: { en: '＋ Add', el: '＋ Προσθήκη' },
  btn_remove: { en: '− Remove', el: '− Αφαίρεση' },
  btn_new_contact: { en: 'New contact', el: 'Νέα επαφή' },
  btn_edit_contact: { en: 'Edit contact', el: 'Επεξεργασία επαφής' },
  btn_add_task: { en: 'Add task', el: 'Προσθήκη εργασίας' },
  btn_edit_task: { en: 'Edit task', el: 'Επεξεργασία εργασίας' },
  btn_add_production: { en: 'Add production', el: 'Προσθήκη παραγωγής' },
  btn_edit_production: { en: 'Edit production', el: 'Επεξεργασία παραγωγής' },
  btn_add_expense_form: { en: 'Add expense', el: 'Προσθήκη εξόδου' },
  btn_edit_expense: { en: 'Edit expense', el: 'Επεξεργασία εξόδου' },
  btn_add_income: { en: 'Add income', el: 'Προσθήκη εσόδου' },
  btn_edit_income: { en: 'Edit income', el: 'Επεξεργασία εσόδου' },
  btn_add_farm: { en: 'Add farm', el: 'Προσθήκη φάρμας' },
  btn_edit_farm: { en: 'Edit farm', el: 'Επεξεργασία φάρμας' },
  btn_archive: { en: 'Archive', el: 'Αρχειοθέτηση' },
  btn_unarchive: { en: 'Unarchive', el: 'Επαναφορά' },
  btn_download_backup: { en: 'Download backup (JSON)', el: 'Λήψη αντιγράφου (JSON)' },
  btn_pick_backup: { en: 'Pick backup file…', el: 'Επιλογή αρχείου αντιγράφου…' },
  btn_preview_data: { en: 'Preview current data', el: 'Προεπισκόπηση τρεχόντων δεδομένων' },
  btn_restore: { en: 'Restore', el: 'Επαναφορά' },
  btn_delete_all: { en: 'Delete all workspace data', el: 'Διαγραφή όλων των δεδομένων' },
  btn_add_allocation: { en: 'Add allocation', el: 'Προσθήκη κατανομής' },
  btn_fill_allocations: { en: 'Fill allocations', el: 'Συμπλήρωση κατανομών' },
  // Empty states
  empty_no_tx: { en: 'No transactions yet', el: 'Καμία συναλλαγή ακόμα' },
  empty_no_tx_hint: { en: 'Start with a farm and a category.', el: 'Ξεκίνα με μία φάρμα και μία κατηγορία.' },
  empty_no_tasks: { en: 'No tasks yet', el: 'Καμία εργασία ακόμα' },
  empty_no_tasks_found: { en: 'No tasks found', el: 'Δεν βρέθηκαν εργασίες' },
  empty_no_tasks_hint: { en: 'Log pruning, spraying, harvest and more.', el: 'Κατέγραψε κλάδεμα, ψεκασμό, συγκομιδή και άλλα.' },
  empty_no_production: { en: 'No production yet', el: 'Καμία παραγωγή ακόμα' },
  empty_no_production_hint: { en: 'Record harvest per year, farm and tree type.', el: 'Κατέγραψε σοδειά ανά έτος, φάρμα και είδος δέντρου.' },
  empty_no_farms: { en: 'No farms yet', el: 'Καμία φάρμα ακόμα' },
  empty_no_farms_hint: { en: 'Create your first farm to unlock trees, tasks and money.', el: 'Δημιούργησε την πρώτη σου φάρμα για δέντρα, εργασίες και χρήματα.' },
  empty_no_contacts: { en: 'No contacts', el: 'Καμία επαφή' },
  empty_no_contacts_hint: { en: 'Add vendors or customers to link transactions.', el: 'Πρόσθεσε προμηθευτές ή πελάτες για σύνδεση συναλλαγών.' },
  empty_no_entries: { en: 'No entries', el: 'Καμία εγγραφή' },
  empty_no_entries_hint: { en: 'Add your first item below.', el: 'Πρόσθεσε το πρώτο στοιχείο παρακάτω.' },
  empty_no_plantings: { en: 'No plantings', el: 'Καμία φύτευση' },
  empty_no_plantings_hint: { en: 'Record a tree movement below to create one.', el: 'Κατέγραψε μία κίνηση δέντρων παρακάτω.' },
  empty_no_expenses: { en: 'No expenses', el: 'Κανένα έξοδο' },
  empty_no_expenses_hint: { en: 'Record seeds, fuel, labor and more.', el: 'Κατέγραψε σπόρους, καύσιμα, εργασία και άλλα.' },
  empty_no_income: { en: 'No income yet', el: 'Κανένα έσοδο ακόμα' },
  empty_no_income_hint: { en: 'Record your first sale.', el: 'Κατέγραψε την πρώτη σου πώληση.' },
  empty_no_profit: { en: 'No farm profit yet', el: 'Κανένα κέρδος φάρμας ακόμα' },
  empty_no_cash: { en: 'No cash movement for these filters.', el: 'Καμία κίνηση ταμείου για αυτά τα φίλτρα.' },
  empty_no_matches: { en: 'No matches', el: 'Κανένα αποτέλεσμα' },
  empty_no_matches_hint: { en: 'Try a different search.', el: 'Δοκίμασε διαφορετική αναζήτηση.' },
  empty_no_matches_create: { en: 'No matches. Create the item first in its own screen.', el: 'Κανένα αποτέλεσμα. Δημιούργησε πρώτα το στοιχείο στη δική του οθόνη.' },
  // Forms
  form_title: { en: 'Title', el: 'Τίτλος' },
  form_amount: { en: 'Amount', el: 'Ποσό' },
  form_date: { en: 'Date', el: 'Ημερομηνία' },
  form_farm: { en: 'Farm', el: 'Φάρμα' },
  form_category: { en: 'Category', el: 'Κατηγορία' },
  form_vendor_opt: { en: 'Vendor (optional)', el: 'Προμηθευτής (προαιρετικά)' },
  form_customer_opt: { en: 'Customer (optional)', el: 'Πελάτης (προαιρετικά)' },
  form_description: { en: 'Description', el: 'Περιγραφή' },
  form_quantity: { en: 'Quantity', el: 'Ποσότητα' },
  form_year: { en: 'Year', el: 'Έτος' },
  form_notes: { en: 'Notes', el: 'Σημειώσεις' },
  form_name: { en: 'Name', el: 'Όνομα' },
  form_phone: { en: 'Phone', el: 'Τηλέφωνο' },
  form_email: { en: 'Email', el: 'Email' },
  form_address: { en: 'Address', el: 'Διεύθυνση' },
  form_size: { en: 'Size (stremmata)', el: 'Μέγεθος (στρέμματα)' },
  form_active: { en: 'Active', el: 'Ενεργή' },
  form_document: { en: 'Document', el: 'Παραστατικό' },
  form_tax: { en: 'Tax', el: 'Φόρος' },
  form_tree_group: { en: 'Tree group', el: 'Ομάδα δέντρων' },
  form_tree_group_opt: { en: 'Tree group (optional)', el: 'Ομάδα δέντρων (προαιρετικά)' },
  form_linked_expense: { en: 'Linked expense (optional)', el: 'Συνδεδεμένο έξοδο (προαιρετικά)' },
  form_farm_alloc: { en: 'Farm allocations (optional)', el: 'Κατανομές φαρμών (προαιρετικά)' },
  form_farm_alloc_hint: { en: 'Split income across farms. Total cannot exceed the amount.', el: 'Μοίρασε το έσοδο στις φάρμες. Το σύνολο δεν μπορεί να ξεπεράσει το ποσό.' },
  form_task_link_hint: { en: 'Tree group must belong to the selected farm; linked expenses may belong to that farm or be shared (all farms). Only active expenses can be newly linked.', el: 'Η ομάδα δέντρων πρέπει να ανήκει στην επιλεγμένη φάρμα· τα συνδεδεμένα έξοδα μπορεί να ανήκουν σε αυτή ή να είναι κοινά. Μόνο ενεργά έξοδα συνδέονται.' },
  form_trees_add_hint: { en: 'Pick a farm and a tree type, then add or remove.', el: 'Διάλεξε φάρμα και είδος δέντρου, μετά πρόσθεσε ή αφαίρεσε.' },
  form_add_farm_first: { en: 'Add a farm first. ', el: 'Πρόσθεσε πρώτα φάρμα. ' },
  form_add_type_first: { en: 'Add a tree type first.', el: 'Πρόσθεσε πρώτα είδος δέντρου.' },
  form_allocated_amount: { en: 'Allocated amount', el: 'Ποσό κατανομής' },
  form_all_docs: { en: 'All documents', el: 'Όλα τα παραστατικά' },
  form_all_vendors: { en: 'All vendors', el: 'Όλοι οι προμηθευτές' },
  form_all_customers: { en: 'All customers', el: 'Όλοι οι πελάτες' },
  form_all_cats: { en: 'All categories', el: 'Όλες οι κατηγορίες' },
  form_all_tree_groups: { en: 'All tree groups', el: 'Όλες οι ομάδες δέντρων' },
  form_whole_farm: { en: 'Whole farm', el: 'Ολόκληρη η φάρμα' },
  form_no_expense: { en: 'No expense', el: 'Κανένα έξοδο' },
  form_select_farm: { en: 'Select farm…', el: 'Διάλεξε φάρμα…' },
  form_select_category: { en: 'Select category…', el: 'Διάλεξε κατηγορία…' },
  form_select_type: { en: 'Select tree type…', el: 'Διάλεξε είδος δέντρου…' },
  form_select_one: { en: 'Select…', el: 'Διάλεξε…' },
  form_none: { en: 'None', el: 'Καμία' },
  form_optional: { en: 'Optional', el: 'Προαιρετικά' },
  form_receipt: { en: '🧾 Receipt', el: '🧾 Απόδειξη' },
  form_invoice: { en: '🧾 Invoice', el: '🧾 Τιμολόγιο' },
  form_tax_yes: { en: 'Tax ✓', el: 'Φόρος ✓' },
  form_tax_no: { en: 'Tax ✕', el: 'Φόρος ✕' },
  trees_unit: { en: 'trees', el: 'δέντρα' },
  farms_prereq: { en: 'Prerequisite: create farms before trees, tasks and transactions.', el: 'Προϋπόθεση: δημιούργησε φάρμες πριν δέντρα, εργασίες και συναλλαγές.' },
  farms_unit: { en: 'str.', el: 'στρ.' },
  farms_off: { en: 'off', el: 'ανενεργή' },
  // Placeholders
  ph_search: { en: 'Search…', el: 'Αναζήτηση…' },
  ph_search_farms: { en: 'Search farms…', el: 'Αναζήτηση φαρμών…' },
  ph_search_plantings: { en: 'Search plantings…', el: 'Αναζήτηση φυτεύσεων…' },
  ph_search_tasks: { en: 'Search tasks…', el: 'Αναζήτηση εργασιών…' },
  ph_olive: { en: 'e.g. Olive grove', el: 'π.χ. Ελαιώνας' },
  ph_pruning: { en: 'e.g. Pruning', el: 'π.χ. Κλάδεμα' },
  ph_from: { en: 'From YYYY-MM-DD', el: 'Από ΕΕΕΕ-ΜΜ-ΗΗ' },
  ph_to: { en: 'To YYYY-MM-DD', el: 'Έως ΕΕΕΕ-ΜΜ-ΗΗ' },
  ph_confirm_delete: { en: 'Type to confirm deletion', el: 'Πληκτρολόγησε για επιβεβαίωση διαγραφής' },
  ph_farm_name: { en: 'e.g. My farm', el: 'π.χ. Η φάρμα μου' },
  // Alerts
  msg_invalid: { en: 'Invalid', el: 'Μη έγκυρο' },
  msg_error: { en: 'Error', el: 'Σφάλμα' },
  msg_saved: { en: 'Saved', el: 'Αποθηκεύτηκε' },
  msg_blocked: { en: 'Blocked', el: 'Αποκλείστηκε' },
  msg_export_failed: { en: 'Export failed', el: 'Η εξαγωγή απέτυχε' },
  msg_cannot_create: { en: 'Cannot create', el: 'Αδύνατη η δημιουργία' },
  msg_no_backup: { en: 'No backup', el: 'Κανένα αντίγραφο' },
  msg_pick_backup_first: { en: 'Pick a backup file (or preview current data) first.', el: 'Διάλεξε πρώτα αρχείο αντιγράφου (ή προεπισκόπηση τρεχόντων δεδομένων).' },
  msg_restore_complete: { en: 'Restore complete', el: 'Η επαναφορά ολοκληρώθηκε' },
  msg_restore_failed: { en: 'Restore failed', el: 'Η επαναφορά απέτυχε' },
  msg_backup_ready: { en: 'Backup ready', el: 'Το αντίγραφο είναι έτοιμο' },
  msg_backup_failed: { en: 'Backup failed', el: 'Το αντίγραφο απέτυχε' },
  msg_backup_loaded: { en: 'Backup loaded', el: 'Το αντίγραφο φορτώθηκε' },
  msg_import_failed: { en: 'Import failed', el: 'Η εισαγωγή απέτυχε' },
  msg_confirm: { en: 'Confirm', el: 'Επιβεβαίωση' },
  msg_deleted: { en: 'Deleted', el: 'Διαγράφηκε' },
  msg_file_too_large: { en: 'This file is too large (5 MB limit).', el: 'Το αρχείο είναι πολύ μεγάλο (όριο 5 MB).' },
  msg_workspace_saved: { en: 'Your workspace name has been updated.', el: 'Το όνομα του χώρου εργασίας ενημερώθηκε.' },
  msg_type_to_confirm: { en: 'Type workspace display name (or "DELETE") to confirm.', el: 'Πληκτρολόγησε το όνομα του χώρου (ή "DELETE") για επιβεβαίωση.' },
  msg_workspace_deleted: { en: 'Workspace data has been deleted.', el: 'Τα δεδομένα του χώρου διαγράφηκαν.' },
  msg_records_found: { en: 'records found. Choose a mode, then Restore.', el: 'εγγραφές βρέθηκαν. Διάλεξε λειτουργία και μετά Επαναφορά.' },
  // Settings
  set_profile: { en: 'Profile', el: 'Προφίλ' },
  set_profile_hint: { en: 'Display name for this offline workspace.', el: 'Εμφανιζόμενο όνομα για αυτόν τον offline χώρο εργασίας.' },
  set_backup: { en: 'Backup', el: 'Αντίγραφο ασφαλείας' },
  set_current_rows: { en: 'Current rows: ', el: 'Τρέχουσες γραμμές: ' },
  set_backup_hint: { en: 'Same JSON format as the website backup, including replace/merge modes.', el: 'Ίδια μορφή JSON με το αντίγραφο της ιστοσελίδας, με λειτουργίες αντικατάστασης/συγχώνευσης.' },
  set_pending: { en: 'Pending: ', el: 'Εκκρεμεί: ' },
  set_replace_hint: { en: 'Replace wipes workspace first; merge keeps existing rows.', el: 'Η αντικατάσταση σβήνει πρώτα τον χώρο· η συγχώνευση κρατά τις υπάρχουσες γραμμές.' },
  set_danger: { en: 'Danger zone', el: 'Επικίνδυνη ζώνη' },
  set_mode: { en: 'Mode: ', el: 'Λειτουργία: ' },
  // Misc rows
  row_cash_total: { en: 'Cash flow (running balance)', el: 'Ταμειακή ροή (τρέχον υπόλοιπο)' },
  row_taxable_income: { en: 'Taxable income', el: 'Φορολογητέο εισόδημα' },
  row_deductible: { en: 'Deductible expenses', el: 'Εκπιπτόμενα έξοδα' },
  row_taxable_net: { en: 'Taxable net (guidance)', el: 'Φορολογητέο καθαρό (ενδεικτικά)' },
  row_taxable_net_short: { en: 'Taxable net', el: 'Φορολογητέο καθαρό' },
  unalloc_short: { en: 'Unalloc', el: 'Ακατ.' },
  msg_pick_cat: { en: 'Pick a category first.', el: 'Διάλεξε πρώτα κατηγορία.' },
  msg_pick_split: { en: 'Choose a tree/crop for this split basis.', el: 'Διάλεξε δέντρο/καλλιέργεια για αυτή τη βάση επιμερισμού.' },
  msg_select_farm: { en: 'Select a farm.', el: 'Διάλεξε φάρμα.' },
  msg_select_type: { en: 'Select a tree type.', el: 'Διάλεξε είδος δέντρου.' },
  msg_farm_cat_required: { en: 'Farm and category are required.', el: 'Η φάρμα και η κατηγορία είναι υποχρεωτικά.' },
  row_unpaid_total: { en: 'Unpaid total', el: 'Σύνολο απλήρωτων' },
  row_net: { en: 'Net', el: 'Καθαρό' },
  in_short: { en: 'in', el: 'μέσα' },
  out_short: { en: 'out', el: 'έξω' },
  running_bal: { en: 'running', el: 'τρέχον' },
  mode_replace: { en: 'replace', el: 'αντικατάσταση' },
  mode_merge: { en: 'merge', el: 'συγχώνευση' },
  tab_cash: { en: 'Cash', el: 'Ταμείο' },
  row_period_total: { en: 'Period total', el: 'Σύνολο περιόδου' },
  cat_top_expense: { en: 'Top expense categories', el: 'Κορυφαίες κατηγορίες εξόδων' },
  cat_top_income: { en: 'Top income categories', el: 'Κορυφαίες κατηγορίες εσόδων' },
  cash_by_month: { en: 'By month', el: 'Ανά μήνα' },
  cash_by_farm: { en: 'By farm', el: 'Ανά φάρμα' },
  cash_by_category: { en: 'By category', el: 'Ανά κατηγορία' },
  cash_no_farm_rows: { en: 'No farm rows for these filters.', el: 'Καμία γραμμή φάρμας για αυτά τα φίλτρα.' },
  analytics_tax_hint: { en: 'Tax-flagged items', el: 'Στοιχεία με σήμανση φόρου' },
  prod_records_hint: { en: 'Record harvest per year, farm and tree type.', el: 'Καταγραφή σοδειάς ανά έτος, φάρμα και είδος.' },
  period: { en: 'Period', el: 'Περίοδος' },
  farms_n: { en: 'farms', el: 'φάρμες' },
  tasks_n: { en: 'tasks', el: 'εργασίες' },
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
