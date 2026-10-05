import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  availableYears, cashFlowReport, categoryBreakdown, describeFilters, farmProfit, financialSummary,
  obligationsReport, profitLossReport, taxReport,
} from '../db/repositories/analytics';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import { listCustomers, listVendors } from '../db/repositories/contacts';
import type { AnalyticsFilters, CashFlowRow, CategoryTotal, FarmProfitRow, FinancialSummary, MonthlyRow, ObligationsReport } from '../db/types';
import { CumulativeBars, MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt, useColors } from '../components/theme';
import { cashFlowToCSV, exportReportAndShare, obligationsToCSV, overviewToCSV, profitLossToCSV, taxToCSV } from '../lib/csv';
import { localizeCategoryName, localizeFarmName, localizeMonthLabel, t } from '../lib/i18n';
import { AppButton, AppInput, AppSelect, Badge, Card, EmptyState, RowCard, SegmentedTabs, SectionTitle, Skeleton, type SelectOption } from '../components/ui';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

type Tab = 'overview' | 'pl' | 'cf' | 'tax' | 'obligations';
type DocFilter = '' | 'invoice' | 'receipt';
type TaxFilter = 'all' | 'taxed' | 'untaxed';

interface FilterOptions {
  farms: SelectOption[];
  expenseCats: SelectOption[];
  incomeCats: SelectOption[];
  vendors: SelectOption[];
  customers: SelectOption[];
}

export function AnalyticsScreen() {
  const theme = useColors();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [farms, setFarms] = useState<FarmProfitRow[]>([]);
  const [cats, setCats] = useState<{ expenses: CategoryTotal[]; incomes: CategoryTotal[] } | null>(null);
  const [cf, setCf] = useState<{ rows: CashFlowRow[]; labels: string[]; cumulative: number[]; income_total: number; expense_total: number; net: number; period_label: string } | null>(null);
  const [pl, setPl] = useState<{ monthly: MonthlyRow[]; farms: FarmProfitRow[]; income_categories: CategoryTotal[]; expense_categories: CategoryTotal[]; income_total: number; expense_total: number; net: number; period_label: string } | null>(null);
  const [tax, setTax] = useState<{ incomes: any[]; expenses: any[]; income_total: number; expense_total: number; net: number; period_label: string } | null>(null);
  const [obl, setObl] = useState<ObligationsReport | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [farmId, setFarmId] = useState<string>('');
  const [expenseCat, setExpenseCat] = useState<string>('');
  const [incomeCat, setIncomeCat] = useState<string>('');
  const [vendorId, setVendorId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [doc, setDoc] = useState<DocFilter>('');
  const [taxF, setTaxF] = useState<TaxFilter>('all');
  const [years, setYears] = useState<number[]>([]);
  const [desc, setDesc] = useState('');
  const [opts, setOpts] = useState<FilterOptions>({ farms: [], expenseCats: [], incomeCats: [], vendors: [], customers: [] });

  const filters = useCallback((): AnalyticsFilters => {
    const f: AnalyticsFilters = { tax: taxF };
    if (start || end) {
      if (start) f.start = start;
      if (end) f.end = end;
    } else if (year.trim()) {
      f.year = Number(year);
    }
    if (farmId) f.farm_id = Number(farmId);
    if (expenseCat) f.expense_category_id = Number(expenseCat);
    if (incomeCat) f.income_category_id = Number(incomeCat);
    if (vendorId) f.vendor_id = Number(vendorId);
    if (customerId) f.customer_id = Number(customerId);
    if (doc) f.document_type = doc;
    return f;
  }, [year, start, end, farmId, expenseCat, incomeCat, vendorId, customerId, doc, taxF]);

  const loadOptions = useCallback(async () => {
    const [farmRows, eCats, iCats, vendors, customers] = await Promise.all([
      listFarms(), listLookups('expense_categories'), listLookups('income_categories'), listVendors(), listCustomers(),
    ]);
    setOpts({
      farms: farmRows.map((f) => ({ id: f.id, label: f.title, sub: `#${f.id}` })),
      expenseCats: eCats.map((c) => ({ id: c.id, label: c.name })),
      incomeCats: iCats.map((c) => ({ id: c.id, label: c.name })),
      vendors: vendors.map((v: any) => ({ id: v.id, label: v.name })),
      customers: customers.map((c: any) => ({ id: c.id, label: c.name })),
    });
  }, []);

  const load = useCallback(async () => {
    const f = filters();
    const s = await financialSummary(f);
    setSummary(s);
    setFarms(await farmProfit(f));
    setCats(await categoryBreakdown(f));
    setCf(await cashFlowReport(f) as any);
    setPl(await profitLossReport(f) as any);
    setTax(await taxReport(f) as any);
    setObl(await obligationsReport(f));
    setYears(await availableYears());
    setDesc(describeFilters(f, s.period_label));
  }, [filters]);

  useFocusEffect(useCallback(() => { loadOptions().catch(() => {}); load(); }, [load, loadOptions]));

  if (!summary) return <Screen title={t('analytics')}><Skeleton height={150} /><Skeleton height={170} /><Skeleton height={120} /></Screen>;

  const resetFilters = () => {
    setYear(String(new Date().getFullYear())); setStart(''); setEnd('');
    setFarmId(''); setExpenseCat(''); setIncomeCat(''); setVendorId(''); setCustomerId('');
    setDoc(''); setTaxF('all');
  };

  const exportCurrent = async () => {
    try {
      const f = filters();
      if (tab === 'overview' && summary) {
        await exportReportAndShare(`analytics-overview-${summary.period_label}`, overviewToCSV(summary));
      } else if (tab === 'pl') {
        const report = pl ?? await profitLossReport(f);
        await exportReportAndShare(`analytics-pl-${report.period_label}`, profitLossToCSV(report as any));
      } else if (tab === 'cf') {
        const cfR = cf ?? await cashFlowReport(f);
        await exportReportAndShare(`analytics-cf-${cfR.period_label}`, cashFlowToCSV(cfR as any));
      } else if (tab === 'obligations') {
        const report = obl ?? await obligationsReport(f);
        await exportReportAndShare(`analytics-obligations-${report.period_label}`, obligationsToCSV(report));
      } else {
        const tx = tax ?? await taxReport(f);
        await exportReportAndShare(`analytics-tax-${tx.period_label}`, taxToCSV(tx as any));
      }
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    }
  };

  const maxFarm = Math.max(1, ...farms.map((x) => Math.abs(x.net)));

  return (
    <View style={{ flex: 1 }}>
      <Screen title={`${t('analytics')} · ${summary.period_label}`} subtitle="KNOW YOUR NUMBERS">
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 4 }}>{desc}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <Badge label={`Years: ${years.join(', ') || '—'}`} tone="neutral" />
        </View>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" /></View>
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 10 }}>
              <AppButton title="Reset" variant="ghost" onPress={resetFilters} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput label="From YYYY-MM-DD" placeholder="From YYYY-MM-DD" value={start} onChangeText={setStart} /></View>
            <View style={{ flex: 1 }}><AppInput label="To YYYY-MM-DD" placeholder="To YYYY-MM-DD" value={end} onChangeText={setEnd} /></View>
          </View>
          <AppSelect label="Farm" placeholder="All farms" value={farmId || null} options={opts.farms} onChange={(id) => setFarmId(id == null ? '' : String(id))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppSelect label="Expense category" placeholder="All" value={expenseCat || null} options={opts.expenseCats} onChange={(id) => setExpenseCat(id == null ? '' : String(id))} />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect label="Income category" placeholder="All" value={incomeCat || null} options={opts.incomeCats} onChange={(id) => setIncomeCat(id == null ? '' : String(id))} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppSelect label="Vendor" placeholder="All vendors" value={vendorId || null} options={opts.vendors} onChange={(id) => setVendorId(id == null ? '' : String(id))} />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect label="Customer" placeholder="All customers" value={customerId || null} options={opts.customers} onChange={(id) => setCustomerId(id == null ? '' : String(id))} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppSelect
                label="Document"
                placeholder="All documents"
                value={doc || null}
                options={[{ id: 'invoice', label: 'Invoice' }, { id: 'receipt', label: 'Receipt' }]}
                onChange={(id) => setDoc((id as DocFilter) ?? '')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect
                label="Tax"
                placeholder="All records"
                value={taxF}
                options={[{ id: 'all', label: 'All records' }, { id: 'taxed', label: 'Tax flagged only' }, { id: 'untaxed', label: 'Unflagged only' }]}
                onChange={(id) => setTaxF(((id as TaxFilter) ?? 'all'))}
                allowClear={false}
              />
            </View>
          </View>
          <AppButton title="Apply" variant="secondary" icon="filter" onPress={load} />
        </Card>

        <View style={{ marginTop: 12 }}>
          <SegmentedTabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'overview', label: 'Overview' },
              { id: 'pl', label: 'P&L' },
              { id: 'cf', label: 'Cash' },
              { id: 'tax', label: 'Tax' },
              { id: 'obligations', label: t('obligations') },
            ]}
          />
        </View>

        <Stats income={summary.income_total} expense={summary.expense_total} balance={summary.balance} />
        <Card>
          <Row label="Taxable income" value={fmt(summary.taxable_income)} />
          <Row label="Deductible expenses" value={fmt(summary.deductible_expenses)} />
          <Row label="Taxable net (guidance)" value={fmt(summary.taxable_net)} bold />
        </Card>
        <View style={{ height: 12 }} />
        <MonthlyChart monthly={summary.monthly.map((m) => ({ ...m, label: localizeMonthLabel(m.label) }))} />
        <View style={{ height: 12 }} />

        {tab === 'overview' && (
          <View>
            <SectionTitle title="Monthly breakdown" />
            <Card>
              {(summary.monthly ?? []).map((m) => (
                <Row key={`${m.year}-${m.month}`} label={`${localizeMonthLabel(m.label)}`} value={`${fmt(m.income)} − ${fmt(m.expense)} = ${fmt(m.balance)}`} />
              ))}
              <Row label="Period total" value={fmt(summary.balance)} bold />
            </Card>
            <SectionTitle title="Profit per farm" />
            {farms.length === 0 && <EmptyState icon="leaf-outline" title="No farm profit yet" />}
            {farms.map((farm) => (
              <RowCard key={farm.farm}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '800', color: theme.ink }}>{localizeFarmName(farm.farm)}</Text>
                  <Badge label={fmt(farm.net)} tone={farm.net < 0 ? 'red' : 'green'} />
                </View>
                <View style={{ height: 8, borderRadius: 5, backgroundColor: theme.neutralSoft, marginTop: 8, overflow: 'hidden' }}>
                  <View style={{ height: 8, borderRadius: 5, width: `${Math.max(4, (Math.abs(farm.net) / maxFarm) * 100)}%`, backgroundColor: farm.net < 0 ? theme.danger : theme.pine }} />
                </View>
                <Text style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>in {fmt(farm.income)} · out {fmt(farm.expense)}</Text>
              </RowCard>
            ))}
            <SectionTitle title="Top categories" />
            {(cats?.expenses ?? []).map((c) => <RowCard key={`e-${c.label}`}><Text style={{ color: theme.ink }}>E · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
            {(cats?.incomes ?? []).map((c) => <RowCard key={`i-${c.label}`}><Text style={{ color: theme.ink }}>I · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
          </View>
        )}
        {tab === 'pl' && (
          <View>
            <SectionTitle title={`Profit & loss · ${pl?.period_label ?? summary.period_label}`} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>By month</Text>
              {(pl?.monthly ?? summary.monthly).map((m: any) => (
                <Row key={`${m.year}-${m.month}`} label={localizeMonthLabel(m.label)} value={`${fmt(m.income)} − ${fmt(m.expense)} = ${fmt(m.balance)}`} />
              ))}
            </Card>
            <View style={{ height: 10 }} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>By farm</Text>
              {(pl?.farms ?? []).map((r) => (
                <Row key={r.farm} label={`${localizeFarmName(r.farm)}`} value={`in ${fmt(r.income)} · out ${fmt(r.expense)} · net ${fmt(r.net)}`} />
              ))}
              {(pl?.farms ?? []).length === 0 && <Text style={{ color: theme.muted }}>No farm rows for these filters.</Text>}
            </Card>
            <View style={{ height: 10 }} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>By category</Text>
              {(pl?.income_categories ?? []).map((c) => (
                <Text key={`pi-${c.label}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>Income · {localizeCategoryName(c.label)} — {fmt(c.total)}</Text>
              ))}
              {(pl?.expense_categories ?? []).map((c) => (
                <Text key={`pe-${c.label}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>Expense · {localizeCategoryName(c.label)} — {fmt(c.total)}</Text>
              ))}
              <Row label="Net" value={fmt(pl?.net ?? summary.balance)} bold />
            </Card>
          </View>
        )}
        {tab === 'cf' && (
          <View>
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Cash flow (running balance)</Text>
              {(cf?.rows ?? []).map((r) => (
                <Row key={`${r.year}-${r.month}`} label={localizeMonthLabel(r.label)} value={`net ${fmt(r.balance)} · running ${fmt(r.running)}`} />
              ))}
              {(cf?.rows ?? []).length === 0 && <Text style={{ color: theme.muted }}>No cash movement for these filters.</Text>}
              <Row label={`Total ${cf?.period_label ?? ''}`} value={fmt(cf?.net ?? summary.balance)} bold />
            </Card>
            <View style={{ height: 10 }} />
            <CumulativeBars labels={(cf?.labels ?? []).map(localizeMonthLabel)} totals={cf?.cumulative ?? []} />
          </View>
        )}
        {tab === 'tax' && (
          <Card>
            <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Tax-flagged items</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 6 }}>Control this with the “Tax” checkbox on each income/expense. Guidance only.</Text>
            {(tax?.incomes ?? []).map((i: any) => <Text key={`i-${i.id}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>+{fmt(i.amount)} · {i.title} · {i.date}</Text>)}
            {(tax?.expenses ?? []).map((e: any) => <Text key={`e-${e.id}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>−{fmt(e.amount)} · {e.title} · {e.date}</Text>)}
            <Row label="Taxable income" value={fmt(tax?.income_total ?? 0)} />
            <Row label="Deductible expenses" value={fmt(tax?.expense_total ?? 0)} />
            <Row label="Taxable net" value={fmt(tax?.net ?? 0)} bold />
          </Card>
        )}
        {tab === 'obligations' && (
          <View>
            <SectionTitle title={`${t('obligations')} · ${obl?.period_label ?? summary.period_label}`} />
            <Card>
              <Row label={t('unpaid_total')} value={fmt(obl?.unpaid_total ?? 0)} />
              <Row label={t('overdue')} value={fmt(obl?.overdue_total ?? 0)} />
              <Row label={t('open_items')} value={String(obl?.count ?? 0)} bold />
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6 }}>{t('obligations_hint')}</Text>
            </Card>
            <View style={{ height: 10 }} />
            <SectionTitle title={t('per_farm')} />
            <Card>
              <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 6 }}>{t('shared_split_hint')}</Text>
              {(obl?.farms ?? []).map((r) => (
                <Row key={r.farm} label={localizeFarmName(r.farm)} value={`${fmt(r.unpaid)} · ${t('overdue')} ${fmt(r.overdue)}`} />
              ))}
              {(obl?.farms ?? []).length === 0 && <Text style={{ color: theme.muted }}>{t('obligations_empty')}</Text>}
            </Card>
            <View style={{ height: 10 }} />
            <SectionTitle title={`${t('unpaid')} (${obl?.count ?? 0})`} />
            {(obl?.items ?? []).length === 0 && <EmptyState icon="wallet-outline" title={t('obligations_empty')} hint={t('obligations_hint')} />}
            {(obl?.items ?? []).map((e) => (
              <RowCard key={e.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: theme.ink }}>{e.title}</Text>
                    <Text style={{ fontSize: 12, color: theme.muted }}>
                      {e.farm_title ?? t('all_farms_split')} · {e.date} · {e.category_name}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: theme.danger }}>−{fmt(e.amount)}</Text>
                </View>
                {e.is_overdue ? (
                  <View style={{ marginTop: 6 }}>
                    <Badge label={t('overdue')} tone="red" />
                  </View>
                ) : null}
              </RowCard>
            ))}
          </View>
        )}
        <View style={{ height: 12 }} />
        <AppButton title="Export current view (CSV)" icon="share-outline" variant="secondary" onPress={exportCurrent} />
      </Screen>
      <FloatingTabBar />
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const theme = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 10 }}>
      <Text style={{ color: theme.muted, fontSize: 13.5, flex: 1 }}>{label}</Text>
      <Text style={{ color: theme.ink, fontWeight: bold ? '800' : '700', fontSize: 13.5, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
