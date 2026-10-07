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
import { CategoryBars, CumulativeBars, MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt, useColors } from '../components/theme';
import { cashFlowToCSV, exportReportAndShare, obligationsToCSV, overviewToCSV, profitLossToCSV, taxToCSV } from '../lib/csv';
import { localizeCategoryName, localizeFarmName, localizeMonthLabel, t, useLang } from '../lib/i18n';
import { AppButton, AppInput, AppSelect, Badge, Card, EmptyState, FilterDropdown, RowCard, SegmentedTabs, SectionTitle, Skeleton, type SelectOption } from '../components/ui';
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
  const lang = useLang();
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
  }, [year, start, end, farmId, expenseCat, incomeCat, vendorId, customerId, doc, taxF, lang]);

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
    // Reversed range matches nothing (server: invalid range -> empty records).
    if (f.start && f.end && f.start > f.end) {
      setSummary(null);
      setDesc(t('no_data_filters'));
      return;
    }
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
      Alert.alert(t('msg_export_failed'), e.message);
    }
  };

  const maxFarm = Math.max(1, ...farms.map((x) => Math.abs(x.net)));

  return (
    <View style={{ flex: 1 }}>
      <Screen title={`${t('analytics')} · ${summary.period_label}`} subtitle={t('sub_analytics')}>
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 4 }}>{desc}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <Badge label={`${t('filter_year')}: ${years.join(', ') || '—'}`} tone="neutral" />
        </View>
        <FilterDropdown
          activeCount={
            (start || end ? 1 : 0) + (farmId ? 1 : 0) + (expenseCat ? 1 : 0) + (incomeCat ? 1 : 0) +
            (vendorId ? 1 : 0) + (customerId ? 1 : 0) + (doc ? 1 : 0) + (taxF !== 'all' ? 1 : 0)
          }
          onClear={resetFilters}
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput label={t('filter_year')} value={year} onChangeText={setYear} keyboardType="number-pad" /></View>
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 10 }}>
              <AppButton title={t('btn_reset')} variant="ghost" onPress={resetFilters} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput label={t('ph_from')} placeholder={t('ph_from')} value={start} onChangeText={setStart} /></View>
            <View style={{ flex: 1 }}><AppInput label={t('ph_to')} placeholder={t('ph_to')} value={end} onChangeText={setEnd} /></View>
          </View>
          <AppSelect label={t('form_farm')} placeholder={t('all_farms')} value={farmId || null} options={opts.farms} onChange={(id) => setFarmId(id == null ? '' : String(id))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppSelect label={t('expense_categories')} placeholder={t('all')} value={expenseCat || null} options={opts.expenseCats} onChange={(id) => setExpenseCat(id == null ? '' : String(id))} />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect label={t('income_categories')} placeholder={t('all')} value={incomeCat || null} options={opts.incomeCats} onChange={(id) => setIncomeCat(id == null ? '' : String(id))} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppSelect label={t('filter_vendor')} placeholder={t('form_all_vendors')} value={vendorId || null} options={opts.vendors} onChange={(id) => setVendorId(id == null ? '' : String(id))} />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect label={t('filter_customer')} placeholder={t('form_all_customers')} value={customerId || null} options={opts.customers} onChange={(id) => setCustomerId(id == null ? '' : String(id))} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppSelect
                label={t('filter_doc')}
                placeholder={t('form_all_docs')}
                value={doc || null}
                options={[{ id: 'invoice', label: t('invoice') }, { id: 'receipt', label: t('receipt') }]}
                onChange={(id) => setDoc((id as DocFilter) ?? '')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect
                label={t('filter_tax')}
                placeholder={t('all_records')}
                value={taxF}
                options={[{ id: 'all', label: t('all_records') }, { id: 'taxed', label: t('taxed_flag') }, { id: 'untaxed', label: t('untaxed_flag') }]}
                onChange={(id) => setTaxF(((id as TaxFilter) ?? 'all'))}
                allowClear={false}
              />
            </View>
          </View>
          <AppButton title={t('apply')} variant="secondary" icon="filter" onPress={load} />
        </FilterDropdown>

        <View style={{ marginTop: 12 }}>
          <SegmentedTabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'overview', label: t('overview') },
              { id: 'pl', label: 'P&L' },
              { id: 'cf', label: t('tab_cash') },
              { id: 'tax', label: t('form_tax') },
              { id: 'obligations', label: t('obligations') },
            ]}
          />
        </View>

        <Stats income={summary.income_total} expense={summary.expense_total} balance={summary.balance} />
        <Card>
          <Row label={t('row_taxable_income')} value={fmt(summary.taxable_income)} tone="green" />
          <Row label={t('row_deductible')} value={fmt(summary.deductible_expenses)} tone="red" />
          <Row label={t('row_taxable_net')} value={fmt(summary.taxable_net)} bold tone={summary.taxable_net < 0 ? 'red' : 'green'} />
        </Card>
        <View style={{ height: 12 }} />
        <MonthlyChart monthly={summary.monthly.map((m) => ({ ...m, label: localizeMonthLabel(m.label) }))} />
        <View style={{ height: 12 }} />

        {tab === 'overview' && (
          <View>
            <SectionTitle title={t('sec_monthly_breakdown')} />
            <Card>
              {(summary.monthly ?? []).map((m) => (
                <Row key={`${m.year}-${m.month}`} label={`${localizeMonthLabel(m.label)}`} value={`${fmt(m.income)} − ${fmt(m.expense)} = ${fmt(m.balance)}`} />
              ))}
              <Row label={t('row_period_total')} value={fmt(summary.balance)} bold />
            </Card>
            <SectionTitle title={t('sec_profit_farm')} />
            {farms.length === 0 && <EmptyState icon="leaf-outline" title={t('empty_no_profit')} />}
            {farms.map((farm) => (
              <RowCard key={farm.farm}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '800', color: theme.ink }}>{localizeFarmName(farm.farm)}</Text>
                  <Badge label={fmt(farm.net)} tone={farm.net < 0 ? 'red' : 'green'} />
                </View>
                <View style={{ height: 8, borderRadius: 5, backgroundColor: theme.neutralSoft, marginTop: 8, overflow: 'hidden' }}>
                  <View style={{ height: 8, borderRadius: 5, width: `${Math.max(4, (Math.abs(farm.net) / maxFarm) * 100)}%`, backgroundColor: farm.net < 0 ? theme.danger : theme.pine }} />
                </View>
                <Text style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>{t('in_short')} {fmt(farm.income)} · {t('out_short')} {fmt(farm.expense)}</Text>
              </RowCard>
            ))}
            <SectionTitle title={t('top_categories')} />
            <CategoryBars title={t('cat_top_expense')} tone="red" items={(cats?.expenses ?? []).map((c) => ({ label: localizeCategoryName(c.label), total: c.total }))} />
            <View style={{ height: 12 }} />
            <CategoryBars title={t('cat_top_income')} tone="green" items={(cats?.incomes ?? []).map((c) => ({ label: localizeCategoryName(c.label), total: c.total }))} />
            <View style={{ height: 12 }} />
            {(cats?.expenses ?? []).map((c) => <RowCard key={`e-${c.label}`}><Text style={{ color: theme.danger }}>E · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
            {(cats?.incomes ?? []).map((c) => <RowCard key={`i-${c.label}`}><Text style={{ color: theme.success }}>I · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
          </View>
        )}
        {tab === 'pl' && (
          <View>
            <SectionTitle title={`${t('profit_per_farm')} · ${pl?.period_label ?? summary.period_label}`} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>{t('sec_by_month')}</Text>
              {(pl?.monthly ?? summary.monthly).map((m: any) => (
                <Row key={`${m.year}-${m.month}`} label={localizeMonthLabel(m.label)} value={`${fmt(m.income)} − ${fmt(m.expense)} = ${fmt(m.balance)}`} tone={m.balance < 0 ? 'red' : 'green'} />
              ))}
            </Card>
            <View style={{ height: 10 }} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>{t('sec_by_farm')}</Text>
              {(pl?.farms ?? []).map((r) => (
                <Row key={r.farm} label={`${localizeFarmName(r.farm)}`} value={`${t('in_short')} ${fmt(r.income)} · ${t('out_short')} ${fmt(r.expense)} · ${t('row_net')} ${fmt(r.net)}`} />
              ))}
              {(pl?.farms ?? []).length === 0 && <Text style={{ color: theme.muted }}>{t('cash_no_farm_rows')}</Text>}
            </Card>
            <View style={{ height: 10 }} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>{t('sec_by_category')}</Text>
              {(pl?.income_categories ?? []).map((c) => (
                <Text key={`pi-${c.label}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>{t('incomes')} · {localizeCategoryName(c.label)} — {fmt(c.total)}</Text>
              ))}
              {(pl?.expense_categories ?? []).map((c) => (
                <Text key={`pe-${c.label}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>{t('expenses')} · {localizeCategoryName(c.label)} — {fmt(c.total)}</Text>
              ))}
              <Row label={t('row_net')} value={fmt(pl?.net ?? summary.balance)} bold />
            </Card>
          </View>
        )}
        {tab === 'cf' && (
          <View>
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>{t('row_cash_total')}</Text>
              {(cf?.rows ?? []).map((r) => (
                <Row key={`${r.year}-${r.month}`} label={localizeMonthLabel(r.label)} value={`${t('row_net')} ${fmt(r.balance)} · ${t('running_bal')} ${fmt(r.running)}`} tone={r.running < 0 ? 'red' : 'green'} />
              ))}
              {(cf?.rows ?? []).length === 0 && <Text style={{ color: theme.muted }}>{t('empty_no_cash')}</Text>}
              <Row label={`${t('total')} ${cf?.period_label ?? ''}`} value={fmt(cf?.net ?? summary.balance)} bold />
            </Card>
            <View style={{ height: 10 }} />
            <CumulativeBars labels={(cf?.labels ?? []).map(localizeMonthLabel)} totals={cf?.cumulative ?? []} />
          </View>
        )}
        {tab === 'tax' && (
          <Card>
            <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>{t('analytics_tax_hint')}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 6 }}>{t('sec_taxable_hint')}</Text>
            {(tax?.incomes ?? []).map((i: any) => <Text key={`i-${i.id}`} style={{ paddingVertical: 3, color: theme.success }}>+{fmt(i.amount)} · {i.title} · {i.date}</Text>)}
            {(tax?.expenses ?? []).map((e: any) => <Text key={`e-${e.id}`} style={{ paddingVertical: 3, color: theme.danger }}>−{fmt(e.amount)} · {e.title} · {e.date}</Text>)}
            <Row label={t('row_taxable_income')} value={fmt(tax?.income_total ?? 0)} tone="green" />
            <Row label={t('row_deductible')} value={fmt(tax?.expense_total ?? 0)} tone="red" />
            <Row label={t('row_taxable_net_short')} value={fmt(tax?.net ?? 0)} bold tone={(tax?.net ?? 0) < 0 ? 'red' : 'green'} />
          </Card>
        )}
        {tab === 'obligations' && (
          <View>
            <SectionTitle title={`${t('obligations')} · ${obl?.period_label ?? summary.period_label}`} />
            <Card>
              <Row label={t('unpaid_total')} value={fmt(obl?.unpaid_total ?? 0)} tone="red" />
              <Row label={t('overdue')} value={fmt(obl?.overdue_total ?? 0)} tone="red" />
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
        <AppButton title={t('btn_export_current')} icon="share-outline" variant="secondary" onPress={exportCurrent} />
      </Screen>
      <FloatingTabBar />
    </View>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'green' | 'red' }) {
  const theme = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 10 }}>
      <Text style={{ color: theme.muted, fontSize: 13.5, flex: 1 }}>{label}</Text>
      <Text style={{ color: tone === 'red' ? theme.danger : tone === 'green' ? theme.success : theme.ink, fontWeight: bold ? '800' : '700', fontSize: 13.5, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
