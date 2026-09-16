import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  availableYears, cashFlowReport, categoryBreakdown, describeFiltersWithNames, farmProfit, financialSummary,
  profitLossReport, sanitizePeriodForFilename, taxReport,
} from '../db/repositories/analytics';
import type { AnalyticsFilters, CashFlowRow, CategoryTotal, Farm, FarmProfitRow, FinancialSummary, NamedRow } from '../db/types';
import { CategoryBars, CumulativeBars, FarmProfitBars, MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt, theme } from '../components/theme';
import { cashFlowToCSV, exportReportAndShare, overviewToCSV, profitLossToCSV, taxToCSV } from '../lib/csv';
import { localizeCategoryName, localizeFarmName, localizeMonthLabel, t } from '../lib/i18n';
import { assertDateRange, assertISODate } from '../lib/validation';
import { AppButton, AppInput, Badge, Card, EmptyState, RowCard, SegmentedTabs, SectionTitle, Skeleton } from '../components/ui';
import { Select } from '../components/Select';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import { listCustomers, listVendors } from '../db/repositories/contacts';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

type Tab = 'overview' | 'pl' | 'cf' | 'tax';

export function AnalyticsScreen() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [farms, setFarms] = useState<FarmProfitRow[]>([]);
  const [cats, setCats] = useState<{ expenses: CategoryTotal[]; incomes: CategoryTotal[] } | null>(null);
  const [cf, setCf] = useState<{ rows: CashFlowRow[]; cumulative?: number[] } | null>(null);
  const [tax, setTax] = useState<{ incomes: any[]; expenses: any[] } | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [year, setYear] = useState<number | null>(new Date().getFullYear());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [farmId, setFarmId] = useState<number | null>(null);
  const [expenseCategoryId, setExpenseCategoryId] = useState<number | null>(null);
  const [incomeCategoryId, setIncomeCategoryId] = useState<number | null>(null);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [doc, setDoc] = useState<'' | 'invoice' | 'receipt'>('');
  const [taxFilter, setTaxFilter] = useState<'all' | 'taxed' | 'untaxed'>('all');
  const [farmOptions, setFarmOptions] = useState<Farm[]>([]);
  const [expenseCats, setExpenseCats] = useState<NamedRow[]>([]);
  const [incomeCats, setIncomeCats] = useState<NamedRow[]>([]);
  const [vendors, setVendors] = useState<NamedRow[]>([]);
  const [customers, setCustomers] = useState<NamedRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [desc, setDesc] = useState('');
  const [filterError, setFilterError] = useState('');
  const [emptyRange, setEmptyRange] = useState(false);

  const filters = useCallback((): AnalyticsFilters => {
    const f: AnalyticsFilters = { tax: taxFilter };
    if (start || end) {
      if (start) f.start = start;
      if (end) f.end = end;
    } else if (year != null) {
      f.year = year;
    }
    if (farmId) f.farm_id = farmId;
    if (expenseCategoryId) f.expense_category_id = expenseCategoryId;
    if (incomeCategoryId) f.income_category_id = incomeCategoryId;
    if (vendorId) f.vendor_id = vendorId;
    if (customerId) f.customer_id = customerId;
    if (doc) f.document_type = doc;
    return f;
  }, [year, start, end, farmId, expenseCategoryId, incomeCategoryId, vendorId, customerId, doc, taxFilter]);

  const load = useCallback(async () => {
    setFilterError('');
    setEmptyRange(false);
    try {
      const f = filters();
      // Mirror server parse_analytics_filters: invalid input yields an empty range, never leaked rows.
      if (f.start) assertISODate(f.start, 'From');
      if (f.end) assertISODate(f.end, 'To');
      assertDateRange(f.start ?? undefined, f.end ?? undefined);
    } catch (e: any) {
      setFilterError(e.message);
      setEmptyRange(true);
      return;
    }
    const f = filters();
    const s = await financialSummary(f);
    setSummary(s);
    setFarms(await farmProfit(f));
    setCats(await categoryBreakdown(f));
    const cfReport = await cashFlowReport(f);
    setCf(cfReport as any);
    setTax(await taxReport(f));
    setYears(await availableYears());
    try {
      setFarmOptions(await listFarms());
      setExpenseCats(await listLookups('expense_categories'));
      setIncomeCats(await listLookups('income_categories'));
      setVendors((await listVendors()) as any);
      setCustomers((await listCustomers()) as any);
    } catch {
      // best-effort
    }
    setDesc(await describeFiltersWithNames(f, s.period_label));
  }, [filters]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!summary) return <Screen title={t('analytics')}><Skeleton height={150} /><Skeleton height={170} /><Skeleton height={120} /></Screen>;

  const exportCurrent = async () => {
    try {
      const f = filters();
      if (tab === 'overview' && summary) {
        await exportReportAndShare(`analytics-overview-${sanitizePeriodForFilename(summary.period_label)}`, overviewToCSV(summary));
      } else if (tab === 'pl') {
        const pl = await profitLossReport(f);
        await exportReportAndShare(`analytics-pl-${sanitizePeriodForFilename(pl.period_label)}`, profitLossToCSV(pl));
      } else if (tab === 'cf') {
        const cfR = await cashFlowReport(f);
        await exportReportAndShare(`analytics-cf-${sanitizePeriodForFilename(cfR.period_label)}`, cashFlowToCSV(cfR));
      } else {
        const tx = await taxReport(f);
        await exportReportAndShare(`analytics-tax-${sanitizePeriodForFilename(tx.period_label)}`, taxToCSV(tx as any));
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
          {filterError ? <Text style={{ color: theme.danger, fontSize: 13, marginBottom: 8 }}>{filterError}</Text> : null}
          <Select
            label={t('year')}
            placeholder="Custom range"
            value={year}
            options={years.map((y) => ({ id: y, label: String(y) }))}
            onChange={setYear}
          />
          <Select
            label={t('farm')}
            placeholder={t('all_farms')}
            value={farmId}
            options={farmOptions.map((x) => ({ id: x.id, label: x.title }))}
            onChange={setFarmId}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Select
                label={t('expense_categories')}
                placeholder={t('all')}
                value={expenseCategoryId}
                options={expenseCats.map((x) => ({ id: x.id, label: x.name }))}
                onChange={setExpenseCategoryId}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Select
                label={t('income_categories')}
                placeholder={t('all')}
                value={incomeCategoryId}
                options={incomeCats.map((x) => ({ id: x.id, label: x.name }))}
                onChange={setIncomeCategoryId}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Select
                label={t('vendor')}
                placeholder={t('all')}
                value={vendorId}
                options={vendors.map((x) => ({ id: x.id, label: x.name }))}
                onChange={setVendorId}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Select
                label={t('customer')}
                placeholder={t('all')}
                value={customerId}
                options={customers.map((x) => ({ id: x.id, label: x.name }))}
                onChange={setCustomerId}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Select
                label="Document"
                placeholder={t('all')}
                value={doc === '' ? 0 : doc === 'invoice' ? -1 : -2}
                options={[{ id: 0, label: t('all') }, { id: -1, label: t('invoice') }, { id: -2, label: t('receipt') }]}
                onChange={(v) => setDoc(v === -1 ? 'invoice' : v === -2 ? 'receipt' : '')}
                allowClear={false}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Select
                label="Tax"
                placeholder={t('all')}
                value={taxFilter === 'all' ? 0 : taxFilter === 'taxed' ? -1 : -2}
                options={[{ id: 0, label: t('tax_all') }, { id: -1, label: t('taxed_only') }, { id: -2, label: t('untaxed_only') }]}
                onChange={(v) => setTaxFilter(v === -1 ? 'taxed' : v === -2 ? 'untaxed' : 'all')}
                allowClear={false}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput placeholder={t('from')} value={start} onChangeText={setStart} /></View>
            <View style={{ flex: 1 }}><AppInput placeholder={t('to')} value={end} onChangeText={setEnd} /></View>
          </View>
          <AppButton title={t('apply')} variant="secondary" icon="filter" onPress={load} />
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

        {emptyRange && (
          <Card>
            <Text style={{ color: theme.muted }}>{t('no_data_filters')}</Text>
          </Card>
        )}
        {tab === 'overview' && (
          <View>
            <SectionTitle title={t('profit_per_farm')} />
            {farms.length === 0 && <EmptyState icon="leaf-outline" title="No farm profit yet" />}
            <FarmProfitBars rows={farms.map((x) => ({ farm: localizeFarmName(x.farm), net: x.net }))} />
            <View style={{ height: 12 }} />
            {farms.map((farm) => (
              <RowCard key={farm.farm}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '800', color: theme.ink }}>{localizeFarmName(farm.farm)}</Text>
                  <Badge label={fmt(farm.net)} tone={farm.net < 0 ? 'red' : 'green'} />
                </View>
                <View style={{ height: 8, borderRadius: 5, backgroundColor: '#EFF1EA', marginTop: 8, overflow: 'hidden' }}>
                  <View style={{ height: 8, borderRadius: 5, width: `${Math.max(4, (Math.abs(farm.net) / maxFarm) * 100)}%`, backgroundColor: farm.net < 0 ? theme.danger : theme.pine }} />
                </View>
                <Text style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>in {fmt(farm.income)} · out {fmt(farm.expense)}</Text>
              </RowCard>
            ))}
            <SectionTitle title={t('top_categories')} />
            <CategoryBars title="Top expense categories" items={(cats?.expenses ?? []).map((c) => ({ label: localizeCategoryName(c.label), total: c.total }))} />
            <View style={{ height: 12 }} />
            <CategoryBars title="Top income categories" items={(cats?.incomes ?? []).map((c) => ({ label: localizeCategoryName(c.label), total: c.total }))} />
            <View style={{ height: 12 }} />
            {(cats?.expenses ?? []).map((c) => <RowCard key={`e-${c.label}`}><Text style={{ color: theme.ink }}>E · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
            {(cats?.incomes ?? []).map((c) => <RowCard key={`i-${c.label}`}><Text style={{ color: theme.ink }}>I · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
          </View>
        )}
        {tab === 'pl' && (
          <View>
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Profit & loss · {summary.period_label}</Text>
              {summary.monthly.map((m) => (
                <Text key={`${m.year}-${m.month}`} style={{ paddingVertical: 4, color: theme.inkSoft }}>{localizeMonthLabel(m.label)}: {fmt(m.income)} − {fmt(m.expense)} = {fmt(m.balance)}</Text>
              ))}
            </Card>
            <View style={{ height: 12 }} />
            <FarmProfitBars rows={farms.map((x) => ({ farm: localizeFarmName(x.farm), net: x.net }))} />
          </View>
        )}
        {tab === 'cf' && (
          <View>
            <CumulativeBars labels={(cf?.rows ?? []).map((r) => localizeMonthLabel(r.label))} totals={(cf?.rows ?? []).map((r) => r.running)} />
            <View style={{ height: 12 }} />
            <Card>
              <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Cash flow (running balance)</Text>
              {(cf?.rows ?? []).map((r) => (
                <Text key={`${r.year}-${r.month}`} style={{ paddingVertical: 4, color: theme.inkSoft }}>{localizeMonthLabel(r.label)}: net {fmt(r.balance)} · running {fmt(r.running)}</Text>
              ))}
            </Card>
          </View>
        )}
        {tab === 'tax' && (
          <Card>
            <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Tax-flagged items</Text>
            {(tax?.incomes ?? []).map((i: any) => <Text key={`i-${i.id}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>+{fmt(i.amount)} · {i.title} · {i.date}</Text>)}
            {(tax?.expenses ?? []).map((e: any) => <Text key={`e-${e.id}`} style={{ paddingVertical: 3, color: theme.inkSoft }}>−{fmt(e.amount)} · {e.title} · {e.date}</Text>)}
          </Card>
        )}
        <View style={{ height: 12 }} />
        <AppButton title="Export current view (CSV)" icon="share-outline" variant="secondary" onPress={exportCurrent} />
      </Screen>
      <FloatingTabBar />
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: theme.muted, fontSize: 13.5 }}>{label}</Text>
      <Text style={{ color: theme.ink, fontWeight: bold ? '800' : '700', fontSize: 13.5 }}>{value}</Text>
    </View>
  );
}
