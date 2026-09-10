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

export type DocumentType = 'invoice' | 'receipt';

export interface Expense {
  id: number;
  profile_id: number;
  farm_id: number;
  category_id: number;
  vendor_id: number | null;
  title: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  document_type: DocumentType;
  include_in_tax: number;
  created_at: string;
  updated_at: string;
  farm_title?: string;
  category_name?: string;
  contact_name?: string | null;
}

export interface Income {
  id: number;
  profile_id: number;
  farm_id: number;
  category_id: number;
  customer_id: number | null;
  title: string;
  description: string;
  amount: number;
  date: string;
  document_type: DocumentType;
  include_in_tax: number;
  created_at: string;
  updated_at: string;
  farm_title?: string;
  category_name?: string;
  contact_name?: string | null;
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

export interface MonthlyRow {
  label: string;
  income: number;
  expense: number;
  balance: number;
}

export interface FinancialSummary {
  year: number;
  income_total: number;
  expense_total: number;
  balance: number;
  taxable_income: number;
  deductible_expenses: number;
  taxable_net: number;
  has_activity: boolean;
  monthly: MonthlyRow[];
}

export const SINGLE_PROFILE_ID = 1;
export const nowISO = () => new Date().toISOString();
export const todayISODate = () => new Date().toISOString().slice(0, 10);
