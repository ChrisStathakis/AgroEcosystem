// Mirror of server models (farm/models.py, expenses/models.py,
// incomes/models.py, profiles/models.py). Single local workspace
// profile id=1 replaces Django User+Profile auth.

export interface Profile {
  id: number;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Farm {
  id: number;
  profile_id: number;
  title: string;
  size: number;
  active: number; // 0/1
  created_at: string;
  updated_at: string;
  tree_total?: number | null;
}

export interface NamedRow {
  id: number;
  profile_id: number;
  name: string;
}

export interface Vendor extends NamedRow {
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export interface Customer extends NamedRow {
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export interface TreePlanting {
  id: number;
  profile_id: number;
  farm_id: number;
  tree_type_id: number;
  count: number;
  planted_on: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  farm_title?: string;
  tree_type_name?: string;
}

export type TreeMovementAction = 'add' | 'remove';

export interface TreeInventoryMovement {
  id: number;
  profile_id: number;
  planting_id: number;
  action: TreeMovementAction;
  quantity: number;
  effective_date: string;
  notes: string;
  created_at: string;
  farm_title?: string;
  tree_type_name?: string;
  balance_after?: number;
}

export type DocumentType = 'invoice' | 'receipt';

export interface Expense {
  id: number;
  profile_id: number;
  /** null = shared expense, split across farms by tree count (server 0005). */
  farm_id: number | null;
  category_id: number;
  vendor_id: number | null;
  title: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  document_type: DocumentType;
  include_in_tax: number;
  is_paid: number; // 0/1 — unpaid rows feed the obligations report (server 0006)
  is_archived: number; // 0/1 — archived stays in lists/reports, hidden from task dropdowns
  is_paid: number; // 0/1 — unpaid expenses appear in obligations
  split_basis: 'trees' | 'tree_type' | 'area' | 'equal';
  split_tree_type_id: number | null;
  created_at: string;
  updated_at: string;
  farm_title?: string | null;
  category_name?: string;
  contact_name?: string | null;
}

export interface Income {
  id: number;
  profile_id: number;
  category_id: number;
  customer_id: number | null;
  title: string;
  description: string;
  amount: number;
  date: string;
  document_type: DocumentType;
  include_in_tax: number;
  is_archived: number; // 0/1 — archived stays in lists/reports, hidden from pickers
  created_at: string;
  updated_at: string;
  farm_title?: string;
  farm_summary?: string | null;
  unallocated_amount?: number;
  category_name?: string;
  contact_name?: string | null;
}

export interface IncomeFarmAllocation {
  id: number;
  profile_id: number;
  income_id: number;
  farm_id: number;
  amount: number;
  farm_title?: string;
}

export interface FarmTask {
  id: number;
  profile_id: number;
  farm_id: number;
  planting_id: number | null;
  category_id: number;
  expense_id: number | null;
  title: string;
  description: string;
  date: string;
  created_at: string;
  updated_at: string;
  farm_title?: string;
  category_name?: string;
  planting_label?: string | null;
}

export type ProductionUnit = 'kg' | 'tn' | 'l';

export interface Production {
  id: number;
  profile_id: number;
  farm_id: number;
  tree_type_id: number;
  year: number;
  quantity: number;
  unit: ProductionUnit;
  notes: string;
  created_at: string;
  updated_at: string;
  farm_title?: string;
  tree_type_name?: string;
  income_summary?: string | null;
  income_ids?: number[];
}

export interface ProductionIncomeLink {
  id: number;
  profile_id: number;
  production_id: number;
  income_id: number;
  income_title?: string;
  income_amount?: number;
}

export interface MonthlyRow {
  year?: number;
  month?: number;
  label: string;
  full_label?: string;
  income: number;
  expense: number;
  balance: number;
}

export interface AnalyticsFilters {
  year?: number | null;
  start?: string | null;
  end?: string | null;
  farm_id?: number | null;
  expense_category_id?: number | null;
  income_category_id?: number | null;
  vendor_id?: number | null;
  customer_id?: number | null;
  document_type?: '' | DocumentType | null;
  tax?: 'all' | 'taxed' | 'untaxed' | null;
}

export interface CategoryTotal {
  label: string;
  total: number;
}

export interface CashFlowRow extends MonthlyRow {
  running: number;
}

export interface FinancialSummary {
  year: number | null;
  period_label: string;
  start: string;
  end: string;
  income_total: number;
  expense_total: number;
  balance: number;
  taxable_income: number;
  deductible_expenses: number;
  taxable_net: number;
  has_activity: boolean;
  monthly: MonthlyRow[];
}

export interface FarmProfitRow {
  farm: string;
  income: number;
  expense: number;
  net: number;
}

/** Port of analytics.services.obligations_report: unpaid expenses + per-farm split. */
export interface ObligationsFarmRow {
  farm: string;
  unpaid: number;
  overdue: number;
}

export interface ObligationsReport {
  period_label: string;
  start: string;
  end: string;
  year: number | null;
  items: Array<Expense & { is_overdue: boolean }>;
  unpaid_total: number;
  overdue_total: number;
  count: number;
  farms: ObligationsFarmRow[];
}

export const SINGLE_PROFILE_ID = 1;
export const nowISO = () => new Date().toISOString();
export const todayISODate = () => new Date().toISOString().slice(0, 10);
