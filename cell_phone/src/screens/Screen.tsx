import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { theme } from '../components/theme';

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.body}>
      <Text style={styles.eyebrow}>{subtitle ?? 'YOUR FARM, IN FOCUS'}</Text>
      <Text style={styles.title}>{title}</Text>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  body: { padding: 16, paddingBottom: 40 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, color: theme.muted, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', color: theme.ink, marginBottom: 14 },
});
