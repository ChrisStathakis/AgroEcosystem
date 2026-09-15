import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { financialSummary, recentTransactions } from '../db/repositories/analytics';
import type { FinancialSummary } from '../db/types';
import { HeroBalance, MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { AppButton, Card, EmptyState, RowCard, SectionTitle, Skeleton } from '../components/ui';
import { fmt, theme } from '../components/theme';
import { localizeMonthLabel, t } from '../lib/i18n';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export function OverviewScreen({ navigation }: any) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          setSummary(await financialSummary());
          setRecent(await recentTransactions(6));
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen title={`${t('overview')}${summary ? ` · ${summary.period_label}` : ''}`} subtitle="THE BIG PICTURE">
        {loading && !summary ? (
          <View>
            <Skeleton height={150} />
            <Skeleton height={90} />
            <Skeleton height={170} />
          </View>
        ) : (
          <View>
            {summary && <HeroBalance balance={summary.balance} income={summary.income_total} expense={summary.expense_total} />}
            {summary && <Stats income={summary.income_total} expense={summary.expense_total} balance={summary.balance} />}
            {summary && <MonthlyChart monthly={summary.monthly.map((m) => ({ ...m, label: localizeMonthLabel(m.label) }))} />}

            <Card style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <AppButton title="Add expense" icon="remove-circle-outline" variant="primary" onPress={() => navigation.navigate('Expenses')} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title="Record income" icon="add-circle-outline" variant="secondary" onPress={() => navigation.navigate('Incomes')} />
              </View>
            </Card>
            <View style={{ marginTop: 4 }}>
              <AppButton title="View analytics" icon="bar-chart-outline" variant="ghost" onPress={() => navigation.navigate('Analytics')} />
            </View>

            <SectionTitle title="Latest activity" />
            {recent.length === 0 && <EmptyState icon="receipt-outline" title="No transactions yet" hint="Start with a farm and a category." />}
            {recent.map((r) => {
              const isOut = r.kind === 'expenses';
              return (
                <RowCard key={`${r.kind}-${r.id}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isOut ? theme.dangerSoft : theme.successSoft,
                      }}
                    >
                      <Ionicons name={isOut ? 'arrow-up' : 'arrow-down'} size={17} color={isOut ? theme.danger : theme.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.ink }}>{r.title}</Text>
                      <Text style={{ fontSize: 12.5, color: theme.muted }}>
                        {r.farm_title} · {r.date}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14.5, fontWeight: '800', color: isOut ? theme.danger : theme.success }}>
                      {isOut ? '−' : '+'}
                      {fmt(r.amount)}
                    </Text>
                  </View>
                </RowCard>
              );
            })}
          </View>
        )}
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
