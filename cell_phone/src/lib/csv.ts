import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Expense, Income } from '../db/types';

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function transactionsToCSV(
  kind: 'expenses' | 'incomes',
  rows: (Expense | Income)[],
): string {
  const contact = kind === 'expenses' ? 'vendor' : 'customer';
  const header = ['title', 'date', 'farm', 'category', contact, 'document_type', 'include_in_tax', 'amount', 'description'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.title),
        r.date,
        csvCell(r.farm_title ?? String(r.farm_id)),
        csvCell(r.category_name ?? String(r.category_id)),
        csvCell(r.contact_name ?? ''),
        r.document_type,
        r.include_in_tax ? 'yes' : 'no',
        Number(r.amount).toFixed(2),
        csvCell(r.description ?? ''),
      ].join(','),
    );
  }
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
