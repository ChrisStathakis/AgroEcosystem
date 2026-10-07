import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fmt, fmtCompact, useColors } from './theme';
import { Card } from './ui';
import { t, useLang } from '../lib/i18n';

function useCountUp(target: number, duration = 700) {
  const v = useSharedValue(0);
  const [display, setDisplay] = React.useState(0);
  useEffect(() => {
    v.value = withTiming(target, { duration });
    const id = setInterval(() => {
      // read on JS thread via simple lerp fallback for offline safety
      setDisplay((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) {
          clearInterval(id);
          return target;
        }
        return prev + diff * 0.18;
      });
    }, 32);
    return () => clearInterval(id);
  }, [target]);
  return display;
}

function StatCard({ label, value, icon, tint, bg, delay }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; delay: number }) {
  const theme = useColors();
  const styles = useStatStyles();
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 220 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 350 }));
  }, [delay]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const animated = useCountUp(value);
  return (
    <Animated.View style={[{ flex: 1 }, aStyle]}>
      <View style={[styles.stat, { backgroundColor: bg }]}>
        <View style={[styles.iconBubble, { backgroundColor: theme.surface }]}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color: tint }]}>{fmt(animated)}</Text>
      </View>
    </Animated.View>
  );
}

function useStatStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
        stat: { borderRadius: 18, padding: 12, borderWidth: 1, borderColor: '#FFFFFF88', minHeight: 118, justifyContent: 'space-between' },
        iconBubble: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
        statLabel: { fontSize: 11.5, fontWeight: '700', color: theme.inkSoft },
        statValue: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.3 },
      }),
    [theme],
  );
}

export function Stats({ income, expense, balance }: { income: number; expense: number; balance: number }) {
  const theme = useColors();
  const styles = useStatStyles();
  useLang();
  return (
    <View style={styles.row}>
      <StatCard label={t('stat_income')} value={income} icon="trending-up" tint={theme.success} bg={theme.successSoft} delay={0} />
      <StatCard label={t('stat_expenses')} value={expense} icon="trending-down" tint={theme.danger} bg={theme.dangerSoft} delay={90} />
      <StatCard
        label={t('stat_balance')}
        value={balance}
        icon="wallet"
        tint={balance < 0 ? theme.danger : theme.success}
        bg={balance < 0 ? theme.dangerSoft : theme.successSoft}
        delay={180}
      />
    </View>
  );
}

function useHeroStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { borderRadius: 22, overflow: 'hidden', marginBottom: 14, ...theme.shadow },
        gradient: { padding: 18, borderRadius: 22 },
        topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
        eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: '700', color: '#A8C686' },
        balance: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -0.8 },
        subRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
        pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff22', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
        pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
      }),
    [theme],
  );
}

export function HeroBalance({ balance, income, expense }: { balance: number; income: number; expense: number }) {
  const heroStyles = useHeroStyles();
  useLang();
  return (
    <View style={heroStyles.wrap}>
      <LinearGradient colors={['#1E4D3A', '#2E6B4F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={heroStyles.gradient}>
        <View style={heroStyles.topRow}>
          <Text style={heroStyles.eyebrow}>{t('hero_net_balance')}</Text>
          <Ionicons name="leaf" size={20} color="#A8C686" />
        </View>
        <Text style={heroStyles.balance}>{fmt(balance)}</Text>
        <View style={heroStyles.subRow}>
          <View style={heroStyles.pill}>
            <Ionicons name="arrow-down-circle" size={14} color="#A8C686" />
            <Text style={heroStyles.pillText}>+{fmtCompact(income)}</Text>
          </View>
          <View style={heroStyles.pill}>
            <Ionicons name="arrow-up-circle" size={14} color="#F2C879" />
            <Text style={heroStyles.pillText}>−{fmtCompact(expense)}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

export function MiniBars({ items, format }: { items: Array<{ label: string; value: number; tone?: 'green' | 'red' | 'neutral' }>; format?: (n: number) => string }) {
  const theme = useColors();
  const max = Math.max(1, ...items.map((x) => Math.abs(x.value)));
  const fmtFn = format ?? fmt;
  return (
    <View style={{ gap: 8 }}>
      {items.map((item) => (
        <View key={item.label}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: theme.ink, fontSize: 13, flex: 1 }} numberOfLines={1}>{item.label}</Text>
            <Text style={{ fontWeight: '800', color: item.tone === 'red' ? theme.danger : item.tone === 'green' ? theme.success : theme.ink, fontSize: 13 }}>{fmtFn(item.value)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 5, backgroundColor: theme.neutralSoft, marginTop: 5, overflow: 'hidden' }}>
            <View
              style={{
                height: 8,
                borderRadius: 5,
                width: `${Math.max(4, (Math.abs(item.value) / max) * 100)}%`,
                backgroundColor: item.tone === 'red' ? theme.danger : item.tone === 'neutral' ? theme.muted : theme.success,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function useChartStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
        title: { fontSize: 15, fontWeight: '800', color: theme.ink },
        legend: { flexDirection: 'row', gap: 10 },
        dotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        dot: { width: 9, height: 9, borderRadius: 5 },
        legendText: { fontSize: 11, color: theme.muted, fontWeight: '700' },
        chart: { flexDirection: 'row' },
        col: { flex: 1, alignItems: 'center' },
        bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 100 },
        bar: { width: 7, borderRadius: 4 },
        month: { fontSize: 9.5, color: theme.muted, marginTop: 6, fontWeight: '600' },
      }),
    [theme],
  );
}

export function CategoryBars({ title, items, tone }: { title: string; items: Array<{ label: string; total: number }>; tone?: 'green' | 'red' }) {
  const chartStyles = useChartStyles();
  if (items.length === 0) return null;
  return (
    <Card>
      <Text style={chartStyles.title}>{title}</Text>
      <View style={{ height: 8 }} />
      <MiniBars items={items.slice(0, 8).map((c) => ({ label: c.label, value: c.total, tone }))} />
    </Card>
  );
}

export function FarmProfitBars({ rows }: { rows: Array<{ farm: string; net: number }> }) {
  const chartStyles = useChartStyles();
  useLang();
  if (rows.length === 0) return null;
  return (
    <Card>
      <Text style={chartStyles.title}>{t('chart_net_per_farm')}</Text>
      <View style={{ height: 8 }} />
      <MiniBars items={rows.map((r) => ({ label: r.farm, value: r.net, tone: r.net < 0 ? 'red' as const : 'green' as const }))} />
    </Card>
  );
}

export function CumulativeBars({ labels, totals }: { labels: string[]; totals: number[] }) {
  const theme = useColors();
  const chartStyles = useChartStyles();
  useLang();
  if (labels.length === 0) return null;
  const min = Math.min(0, ...totals);
  const max = Math.max(1, ...totals.map((x) => x - min));
  return (
    <Card>
      <Text style={chartStyles.title}>{t('chart_cumulative')}</Text>
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 90 }}>
        {totals.map((v, i) => (
          <View key={`${labels[i]}-${i}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: '70%',
                borderRadius: 3,
                height: Math.max(4, ((v - min) / max) * 70),
                backgroundColor: v < 0 ? theme.danger : theme.pine,
              }}
            />
            <Text style={{ fontSize: 8.5, color: theme.muted, fontWeight: '600' }} numberOfLines={1}>{labels[i]}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function MonthlyChart({ monthly }: { monthly: { label: string; income: number; expense: number }[] }) {
  const theme = useColors();
  const chartStyles = useChartStyles();
  useLang();
  const max = Math.max(1, ...monthly.map((m) => Math.max(m.income, m.expense)));
  return (
    <Card>
      <View style={chartStyles.head}>
        <Text style={chartStyles.title}>{t('chart_cash_rhythm')}</Text>
        <View style={chartStyles.legend}>
          <View style={chartStyles.dotRow}>
            <View style={[chartStyles.dot, { backgroundColor: theme.success }]} />
            <Text style={chartStyles.legendText}>{t('chart_in')}</Text>
          </View>
          <View style={chartStyles.dotRow}>
            <View style={[chartStyles.dot, { backgroundColor: theme.danger }]} />
            <Text style={chartStyles.legendText}>{t('chart_out')}</Text>
          </View>
        </View>
      </View>
      <View style={chartStyles.chart}>
        {monthly.map((m, i) => (
          <BarPair key={m.label} income={m.income} expense={m.expense} max={max} label={m.label} index={i} />
        ))}
      </View>
    </Card>
  );
}

function BarPair({ income, expense, max, label, index }: { income: number; expense: number; max: number; label: string; index: number }) {
  const theme = useColors();
  const chartStyles = useChartStyles();
  const h1 = useSharedValue(2);
  const h2 = useSharedValue(2);
  useEffect(() => {
    h1.value = withDelay(index * 45, withSpring(Math.max(4, (income / max) * 92), { damping: 15, stiffness: 180 }));
    h2.value = withDelay(index * 45 + 60, withSpring(Math.max(4, (expense / max) * 92), { damping: 15, stiffness: 180 }));
  }, [income, expense, max, index]);
  const s1 = useAnimatedStyle(() => ({ height: h1.value }));
  const s2 = useAnimatedStyle(() => ({ height: h2.value }));
  return (
    <View style={chartStyles.col}>
      <View style={chartStyles.bars}>
        <Animated.View style={[chartStyles.bar, { backgroundColor: theme.success }, s1]} />
        <Animated.View style={[chartStyles.bar, { backgroundColor: theme.danger }, s2]} />
      </View>
      <Text style={chartStyles.month}>{label}</Text>
    </View>
  );
}
