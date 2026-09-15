import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Expense, Income } from '../db/types';

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function money(n: number | string): string {
  return Number(n ?? 0).toFixed(2);
}

export function transactionsToCSV(
  kind: 'expenses' | 'incomes',
  rows: (Expense | Income)[],
): string {
  const contact = kind === 'expenses' ? 'vendor' : 'customer';
  const header = kind === 'incomes'
    ? ['title', 'date', 'farms', 'unallocated', 'category', contact, 'document_type', 'include_in_tax', 'is_archived', 'amount', 'description']
    : ['title', 'date', 'farm', 'category', contact, 'document_type', 'include_in_tax', 'is_archived', 'amount', 'description'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const farm = kind === 'incomes'
      ? (r as Income).farm_summary ?? 'Unallocated'
      : (r as Expense).farm_title ?? String((r as Expense).farm_id);
    const unallocated = kind === 'incomes' ? money((r as Income).unallocated_amount ?? 0) : null;
    const base = [
      csvCell(r.title),
      r.date,
      csvCell(farm),
    ];
    if (kind === 'incomes') base.push(unallocated as string);
    base.push(
      csvCell(r.category_name ?? String(r.category_id)),
      csvCell(r.contact_name ?? ''),
      r.document_type,
      r.include_in_tax ? 'yes' : 'no',
      (r as Expense).is_archived ? 'yes' : 'no',
      money(r.amount),
      csvCell(r.description ?? ''),
    );
    lines.push(base.join(','));
  }
  return lines.join('\n');
}

/** Port of server analytics_export: overview / pl / cf / tax CSVs. */
export function overviewToCSV(data: { period_label: string; monthly: Array<{ label: string; income: number; expense: number; balance: number }>; income_total: number; expense_total: number; balance: number }): string {
  const lines = ['month,income,expenses,net'];
  for (const row of data.monthly) lines.push([csvCell(row.label), money(row.income), money(row.expense), money(row.balance)].join(','));
  lines.push(['total', money(data.income_total), money(data.expense_total), money(data.balance)].join(','));
  return lines.join('\n');
}

export function profitLossToCSV(data: {
  period_label: string;
  monthly: Array<{ label: string; income: number; expense: number; balance: number }>;
  farms: Array<{ farm: string; income: number; expense: number; net: number }>;
  income_categories: Array<{ label: string; total: number }>;
  expense_categories: Array<{ label: string; total: number }>;
  income_total: number; expense_total: number; net: number;
}): string {
  const lines = ['section,label,income,expenses,net'];
  for (const row of data.monthly) lines.push(['month', csvCell(row.label), money(row.income), money(row.expense), money(row.balance)].join(','));
  for (const row of data.farms) lines.push(['farm', csvCell(row.farm), money(row.income), money(row.expense), money(row.net)].join(','));
  for (const item of data.income_categories) lines.push(['income-category', csvCell(item.label), money(item.total), '', ''].join(','));
  for (const item of data.expense_categories) lines.push(['expense-category', csvCell(item.label), '', money(item.total), ''].join(','));
  lines.push(['total', csvCell(data.period_label), money(data.income_total), money(data.expense_total), money(data.net)].join(','));
  return lines.join('\n');
}

export function cashFlowToCSV(data: {
  rows: Array<{ label: string; income: number; expense: number; balance: number; running: number }>;
  income_total: number; expense_total: number; net: number;
}): string {
  const lines = ['month,income,expenses,net,running'];
  for (const row of data.rows) lines.push([csvCell(row.label), money(row.income), money(row.expense), money(row.balance), money(row.running)].join(','));
  lines.push(['total', money(data.income_total), money(data.expense_total), money(data.net), ''].join(','));
  return lines.join('\n');
}

export function taxToCSV(data: {
  incomes: Array<{ title: string; date: string; category_name?: string; category_id: number; contact_name?: string | null; amount: number }>;
  expenses: Array<{ title: string; date: string; category_name?: string; category_id: number; contact_name?: string | null; amount: number }>;
  income_total: number; expense_total: number; net: number;
}): string {
  const lines = ['kind,title,date,category,contact,amount'];
  for (const item of data.incomes) {
    lines.push(['income', csvCell(item.title), item.date, csvCell(item.category_name ?? String(item.category_id)), csvCell(item.contact_name ?? ''), money(item.amount)].join(','));
  }
  for (const item of data.expenses) {
    lines.push(['expense', csvCell(item.title), item.date, csvCell(item.category_name ?? String(item.category_id)), csvCell(item.contact_name ?? ''), money(item.amount)].join(','));
  }
  lines.push('');
  lines.push(['taxable income', '', '', '', '', money(data.income_total)].join(','));
  lines.push(['deductible expenses', '', '', '', '', money(data.expense_total)].join(','));
  lines.push(['taxable net', '', '', '', '', money(data.net)].join(','));
  return lines.join('\n');
}

/** Write CSV to cache dir and open the share sheet (port of record_export). */
export async function exportAndShare(kind: 'expenses' | 'incomes', rows: (Expense | Income)[]): Promise<string> {
  const csv = transactionsToCSV(kind, rows);
  const file = new File(Paths.cache, `${kind}.csv`);
  file.write(csv);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  return file.uri;
}

export async function exportReportAndShare(name: string, csv: string): Promise<string> {
  const file = new File(Paths.cache, `${name}.csv`);
  file.write(csv);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  return file.uri;
}
