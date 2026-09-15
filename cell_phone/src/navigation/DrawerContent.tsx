import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../components/theme';

const GROUPS: { title: string; items: { route: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] }[] = [
  {
    title: 'MAIN',
    items: [
      { route: 'Overview', label: 'Overview', icon: 'home-outline' },
      { route: 'Farms', label: 'Farms', icon: 'leaf-outline' },
      { route: 'Trees', label: 'Trees', icon: 'nutrition-outline' },
      { route: 'Tasks', label: 'Tasks', icon: 'checkbox-outline' },
    ],
  },
  {
    title: 'MONEY',
    items: [
      { route: 'Expenses', label: 'Expenses', icon: 'trending-down-outline' },
      { route: 'Incomes', label: 'Income', icon: 'trending-up-outline' },
      { route: 'Analytics', label: 'Analytics', icon: 'bar-chart-outline' },
    ],
  },
  {
    title: 'NETWORK',
    items: [
      { route: 'Vendors', label: 'Vendors', icon: 'storefront-outline' },
      { route: 'Customers', label: 'Customers', icon: 'people-outline' },
    ],
  },
  {
    title: 'SETUP',
    items: [
      { route: 'ExpenseCategories', label: 'Expense categories', icon: 'pricetags-outline' },
      { route: 'IncomeCategories', label: 'Income categories', icon: 'pricetag-outline' },
      { route: 'TreeTypes', label: 'Tree types', icon: 'git-branch-outline' },
      { route: 'TaskCategories', label: 'Task categories', icon: 'list-outline' },
      { route: 'Settings', label: 'Settings', icon: 'settings-outline' },
    ],
  },
];

export function DrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const active = state.routes[state.index]?.name;
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['#1E4D3A', '#2E6B4F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="leaf" size={22} color="#A8C686" />
        </View>
        <Text style={styles.brandTitle}>Agro</Text>
        <Text style={styles.brandSub}>OFFLINE WORKSPACE</Text>
      </LinearGradient>
      <View style={styles.list}>
        {GROUPS.map((g) => (
          <View key={g.title} style={{ marginBottom: 6 }}>
            <Text style={styles.group}>{g.title}</Text>
            {g.items.map((item) => {
              const isActive = item.route === active;
              return (
                <Pressable
                  key={item.route}
                  onPress={() => navigation.navigate(item.route as never)}
                  style={[styles.row, isActive && styles.rowActive]}
                >
                  <Ionicons name={item.icon} size={18} color={isActive ? '#fff' : theme.muted} />
                  <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FAFAF6' },
  brand: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  brandTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  brandSub: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: '700', color: '#A8C686', marginTop: 2 },
  list: { flex: 1, padding: 14 },
  group: { fontSize: 10.5, letterSpacing: 1.3, fontWeight: '800', color: theme.faint, marginBottom: 6, marginTop: 6, marginLeft: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  rowActive: { backgroundColor: theme.pine },
  label: { fontSize: 14.5, fontWeight: '600', color: theme.inkSoft },
  labelActive: { color: '#fff', fontWeight: '700' },
});
