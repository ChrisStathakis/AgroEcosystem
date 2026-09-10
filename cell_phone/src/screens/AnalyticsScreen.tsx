import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { financialSummary } from '../db/repositories/analytics';
import type { FinancialSummary } from '../db/types';
import { MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt } from '../components/theme';

export function AnalyticsScreen() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      (async () => setSummary(await financialSummary()))();
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
    </Screen>
  );
}
