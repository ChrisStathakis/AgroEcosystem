import React, { useCallback, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { financialSummary, recentTransactions } from '../db/repositories/analytics';
import type { FinancialSummary } from '../db/types';
import { MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { fmt } from '../components/theme';

export function OverviewScreen({ navigation }: any) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setSummary(await financialSummary());
        setRecent(await recentTransactions(6));
      })();
    }, []),
  );

  return (
    <Screen title="Overview" subtitle="THE BIG PICTURE">
      {summary && <Stats income={summary.income_total} expense={summary.expense_total} balance={summary.balance} />}
      {summary && <MonthlyChart monthly={summary.monthly} />}
      <View style={{ height: 12 }} />
      <Button title="Add expense" onPress={() => navigation.navigate('Expenses')} />
      <View style={{ height: 8 }} />
      <Button title="Record income" onPress={() => navigation.navigate('Incomes')} />
      <View style={{ height: 8 }} />
      <Button title="View analytics" onPress={() => navigation.navigate('Analytics')} />
      <View style={{ height: 16 }} />
      <Text style={{ fontWeight: '700', marginBottom: 8 }}>Latest activity</Text>
      {recent.length === 0 && <Text>No transactions yet. Start with a farm and a category.</Text>}
      {recent.map((r) => (
        <Text key={`${r.kind}-${r.id}`}>
          {r.kind === 'expenses' ? '−' : '+'}
          {fmt(r.amount)} · {r.title} · {r.farm_title} · {r.date}
        </Text>
      ))}
    </Screen>
  );
}
