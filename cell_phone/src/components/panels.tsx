import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fmt, theme } from './theme';

export function Stats({ income, expense, balance }: { income: number; expense: number; balance: number }) {
  const cards = [
    { label: 'Income (year)', value: income, tone: theme.green },
    { label: 'Expenses (year)', value: expense, tone: theme.accent },
    { label: 'Balance', value: balance, tone: balance < 0 ? theme.danger : theme.green },
  ];
  return (
    <View style={styles.row}>
      {cards.map((c) => (
        <View key={c.label} style={styles.card}>
          <Text style={styles.label}>{c.label}</Text>
          <Text style={[styles.value, { color: c.tone }]}>{fmt(c.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function MonthlyChart({ monthly }: { monthly: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(1, ...monthly.map((m) => Math.max(m.income, m.expense)));
  return (
    <View style={styles.chart}>
      {monthly.map((m) => (
        <View key={m.label} style={styles.col}>
          <View style={styles.bars}>
            <View style={[styles.bar, { height: Math.max(2, (m.income / max) * 90), backgroundColor: theme.green }]} />
            <View style={[styles.bar, { height: Math.max(2, (m.expense / max) * 90), backgroundColor: theme.accent }]} />
          </View>
          <Text style={styles.month}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  card: { flex: 1, backgroundColor: theme.card, borderRadius: theme.radius, padding: 12, borderWidth: 1, borderColor: theme.border },
  label: { fontSize: 11, color: theme.muted, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '700' },
  chart: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: theme.radius, padding: 12, borderWidth: 1, borderColor: theme.border },
  col: { flex: 1, alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 96 },
  bar: { width: 7, borderRadius: 3 },
  month: { fontSize: 10, color: theme.muted, marginTop: 6 },
});
