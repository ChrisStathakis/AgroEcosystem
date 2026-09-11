import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { farmProfit, financialSummary } from '../db/repositories/analytics';
import type { FinancialSummary, FarmProfitRow } from '../db/types';
import { MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt } from '../components/theme';

export function AnalyticsScreen() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [farms, setFarms] = useState<FarmProfitRow[]>([]);
  useFocusEffect(
    useCallback(() => {
      (async () => { setSummary(await financialSummary()); setFarms(await farmProfit()); })();
    }, []),
  );
  if (!summary) return <Screen title="Analytics"><Text>Loading…</Text></Screen>;
  return (
    <Screen title={`Your year, ${summary.year}`} subtitle="KNOW YOUR NUMBERS">
      <Stats income={summary.income_total} expense={summary.expense_total} balance={summary.balance} />
      <Text>Taxable income: {fmt(summary.taxable_income)}</Text>
      <Text>Deductible expenses: {fmt(summary.deductible_expenses)}</Text>
      <Text>Taxable net: {fmt(summary.taxable_net)} (guidance only)</Text>
      <View style={{ height: 12 }} />
      <MonthlyChart monthly={summary.monthly} />
      <View style={{ height: 12 }} />
      {summary.monthly.map((m) => (
        <Text key={m.label}>{m.label}: income {fmt(m.income)} · expenses {fmt(m.expense)} · net {fmt(m.balance)}</Text>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Profit per farm</Text>
      {farms.map((farm) => <Text key={farm.farm}>{farm.farm}: income {fmt(farm.income)} · expenses {fmt(farm.expense)} · net {fmt(farm.net)}</Text>)}
    </Screen>
  );
}
