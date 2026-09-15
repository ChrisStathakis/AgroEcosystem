import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  availableYears, cashFlowReport, categoryBreakdown, describeFilters, farmProfit, financialSummary,
  profitLossReport, taxReport,
} from '../db/repositories/analytics';
import type { AnalyticsFilters, CashFlowRow, CategoryTotal, FarmProfitRow, FinancialSummary } from '../db/types';
import { MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt, theme } from '../components/theme';
import { cashFlowToCSV, exportReportAndShare, overviewToCSV, profitLossToCSV, taxToCSV } from '../lib/csv';
import { localizeCategoryName, localizeFarmName, localizeMonthLabel, t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, EmptyState, RowCard, SegmentedTabs, SectionTitle, Skeleton } from '../components/ui';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

type Tab = 'overview' | 'pl' | 'cf' | 'tax';

export function AnalyticsScreen() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [farms, setFarms] = useState<FarmProfitRow[]>([]);
  const [cats, setCats] = useState<{ expenses: CategoryTotal[]; incomes: CategoryTotal[] } | null>(null);
  const [cf, setCf] = useState<{ rows: CashFlowRow[] } | null>(null);
  const [tax, setTax] = useState<{ incomes: any[]; expenses: any[] } | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [farmId, setFarmId] = useState('');
  const [years, setYears] = useState<number[]>([]);
  const [desc, setDesc] = useState('');

  const filters = useCallback((): AnalyticsFilters => {
    const f: AnalyticsFilters = { tax: 'all' };
    if (start || end) {
      if (start) f.start = start;
      if (end) f.end = end;
    } else if (year.trim()) {
      f.year = Number(year);
    }
    if (farmId) f.farm_id = Number(farmId);
    return f;
  }, [year, start, end, farmId]);

  const load = useCallback(async () => {
    const f = filters();
    const s = await financialSummary(f);
    setSummary(s);
    setFarms(await farmProfit(f));
    setCats(await categoryBreakdown(f));
    const cfReport = await cashFlowReport(f);
    setCf(cfReport);
    setTax(await taxReport(f));
    setYears(await availableYears());
    setDesc(describeFilters(f, s.period_label));
  }, [filters]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!summary) return <Screen title={t('analytics')}><Skeleton height={150} /><Skeleton height={170} /><Skeleton height={120} /></Screen>;

  const exportCurrent = async () => {
    try {
      const f = filters();
      if (tab === 'overview' && summary) {
        await exportReportAndShare(`analytics-overview-${summary.period_label}`, overviewToCSV(summary));
      } else if (tab === 'pl') {
        const pl = await profitLossReport(f);
        await exportReportAndShare(`analytics-pl-${pl.period_label}`, profitLossToCSV(pl));
      } else if (tab === 'cf') {
        const cfR = await cashFlowReport(f);
        await exportReportAndShare(`analytics-cf-${cfR.period_label}`, cashFlowToCSV(cfR));
      } else {
        const tx = await taxReport(f);
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
            <View style={{ flex: 1 }}><AppInput label="Farm id" placeholder="Optional" value={farmId} onChangeText={setFarmId} keyboardType="number-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput placeholder="From YYYY-MM-DD" value={start} onChangeText={setStart} /></View>
            <View style={{ flex: 1 }}><AppInput placeholder="To YYYY-MM-DD" value={end} onChangeText={setEnd} /></View>
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
            <SectionTitle title="Profit per farm" />
            {farms.length === 0 && <EmptyState icon="leaf-outline" title="No farm profit yet" />}
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
            <SectionTitle title="Top categories" />
            {(cats?.expenses ?? []).map((c) => <RowCard key={`e-${c.label}`}><Text style={{ color: theme.ink }}>E · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
            {(cats?.incomes ?? []).map((c) => <RowCard key={`i-${c.label}`}><Text style={{ color: theme.ink }}>I · {localizeCategoryName(c.label)} — <Text style={{ fontWeight: '800' }}>{fmt(c.total)}</Text></Text></RowCard>)}
          </View>
        )}
        {tab === 'pl' && (
          <Card>
            <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Profit & loss · {summary.period_label}</Text>
            {summary.monthly.map((m) => (
              <Text key={`${m.year}-${m.month}`} style={{ paddingVertical: 4, color: theme.inkSoft }}>{localizeMonthLabel(m.label)}: {fmt(m.income)} − {fmt(m.expense)} = {fmt(m.balance)}</Text>
            ))}
          </Card>
        )}
        {tab === 'cf' && (
          <Card>
            <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>Cash flow (running balance)</Text>
            {(cf?.rows ?? []).map((r) => (
              <Text key={`${r.year}-${r.month}`} style={{ paddingVertical: 4, color: theme.inkSoft }}>{localizeMonthLabel(r.label)}: net {fmt(r.balance)} · running {fmt(r.running)}</Text>
            ))}
          </Card>
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
