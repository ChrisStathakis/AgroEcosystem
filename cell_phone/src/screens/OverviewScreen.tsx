import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { financialSummary, lastTaskDate, obligationsSummary, recentProductions, recentTasks, recentTransactions, unallocatedIncomeTotal, unlinkedProductionsCount } from '../db/repositories/analytics';
import type { FinancialSummary } from '../db/types';
import { HeroBalance, MonthlyChart, Stats } from '../components/panels';
import { Screen } from './Screen';
import { AppButton, Card, EmptyState, RowCard, SectionTitle, Skeleton } from '../components/ui';
import { fmt, useColors } from '../components/theme';
import { localizeMonthLabel, t, useLang } from '../lib/i18n';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export function OverviewScreen({ navigation }: any) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [obligations, setObligations] = useState<{ unpaid_total: number; overdue_total: number; unpaid_count: number; overdue_count: number; items: any[] } | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [harvests, setHarvests] = useState<any[]>([]);
  const [unallocated, setUnallocated] = useState(0);
  const [unlinked, setUnlinked] = useState(0);
  const [tasksStale, setTasksStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const theme = useColors();
  useLang();

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          setSummary(await financialSummary());
          setRecent(await recentTransactions(6));
          setObligations(await obligationsSummary());
          setTasks(await recentTasks(5));
          setHarvests(await recentProductions(5));
          setUnallocated(await unallocatedIncomeTotal());
          setUnlinked(await unlinkedProductionsCount());
          const last = await lastTaskDate();
          // Date-based like the server ((today - last.date).days > 14).
          if (!last) setTasksStale(true);
          else {
            const d = new Date();
            const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const [y, m, day] = String(last).slice(0, 10).split('-').map(Number);
            const lastDate = new Date(y, (m ?? 1) - 1, day ?? 1);
            setTasksStale(Math.round((today.getTime() - lastDate.getTime()) / 86400000) > 14);
          }
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen title={`${t('overview')}${summary ? ` · ${summary.period_label}` : ''}`} subtitle={t('sub_overview')}>
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

            {((obligations && (obligations.overdue_count > 0 || obligations.unpaid_count > 0)) || unallocated > 0.000001 || unlinked > 0) && (
              <Card>
                <Text style={{ fontWeight: '800', color: theme.ink, fontSize: 15, marginBottom: 8 }}>{t('attention')}</Text>
                {(obligations?.overdue_count ?? 0) > 0 && (
                  <Text style={{ color: theme.danger, fontWeight: '700', paddingVertical: 3 }}>
                    {t('overdue')}: {fmt(obligations!.overdue_total)} ({obligations!.overdue_count})
                  </Text>
                )}
                {(obligations?.unpaid_count ?? 0) > 0 && (
                  <Text style={{ color: theme.danger, fontWeight: '700', paddingVertical: 3 }}>
                    {t('unpaid')}: {fmt(obligations!.unpaid_total)} ({obligations!.unpaid_count})
                  </Text>
                )}
                {unallocated > 0.000001 && (
                  <Text style={{ color: theme.ink, fontWeight: '700', paddingVertical: 3 }}>
                    {t('unallocated_income')}: {fmt(unallocated)}
                  </Text>
                )}
                {unlinked > 0 && (
                  <Text style={{ color: theme.ink, fontWeight: '700', paddingVertical: 3 }}>
                    {t('unlinked_harvests')}: {unlinked}
                  </Text>
                )}
              </Card>
            )}
            {tasksStale && (
              <Card>
                <Text style={{ color: theme.muted }}>{t('no_tasks_lately')}</Text>
              </Card>
            )}

            <SectionTitle title={t('upcoming_payments')} />
            {(!obligations || obligations.items.length === 0) && (
              <Card><Text style={{ color: theme.muted }}>{t('nothing_owed')}</Text></Card>
            )}
            {(obligations?.items ?? []).map((o) => (
              <RowCard key={`due-${o.id}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: theme.ink }}>{o.title}</Text>
                    <Text style={{ fontSize: 12, color: theme.muted }}>{o.farm_title ?? t('unallocated')} · {o.date}{o.overdue ? ` · ${t('overdue')}` : ''}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: theme.danger }}>{fmt(o.amount)}</Text>
                </View>
              </RowCard>
            ))}

            <Card style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <AppButton title={t('btn_add_expense')} icon="remove-circle-outline" variant="primary" onPress={() => navigation.navigate('Expenses')} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title={t('btn_record_income')} icon="add-circle-outline" variant="secondary" onPress={() => navigation.navigate('Incomes')} />
              </View>
            </Card>
            <View style={{ marginTop: 4 }}>
              <AppButton title={t('btn_view_analytics')} icon="bar-chart-outline" variant="ghost" onPress={() => navigation.navigate('Analytics')} />
            </View>

            <SectionTitle title={t('latest_activity')} />
            {recent.length === 0 && <EmptyState icon="receipt-outline" title={t('empty_no_tx')} hint={t('empty_no_tx_hint')} />}
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
                        {(isOut ? (r.farm_title ?? t('all_farms_split')) : (r.farm_summary || t('unallocated')))} · {r.date}
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
            <SectionTitle title={t('recent_tasks')} />
            {tasks.length === 0 && <EmptyState icon="checkbox-outline" title={t('empty_no_tasks')} />}
            {tasks.map((x) => (
              <RowCard key={`task-${x.id}`}>
                <Text style={{ fontWeight: '800', color: theme.ink }}>{x.title}</Text>
                <Text style={{ fontSize: 12, color: theme.muted }}>{x.farm_title} · {x.category_name} · {x.date}</Text>
              </RowCard>
            ))}
            <SectionTitle title={t('recent_harvests')} />
            {harvests.length === 0 && <EmptyState icon="basket-outline" title={t('empty_no_production')} />}
            {harvests.map((h) => (
              <RowCard key={`harvest-${h.id}`}>
                <Text style={{ fontWeight: '800', color: theme.ink }}>{h.year} · {h.farm_title} · {h.tree_type_name}</Text>
                <Text style={{ fontSize: 12, color: theme.muted }}>
                  {fmt(h.quantity)} {h.unit}{h.income_summary ? ` · ${h.income_summary}` : ` · ${t('unlinked')}`}
                </Text>
              </RowCard>
            ))}
          </View>
        )}
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
