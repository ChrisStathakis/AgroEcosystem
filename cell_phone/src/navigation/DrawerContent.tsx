import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../components/theme';
import { t, useLang } from '../lib/i18n';

const GROUPS: { titleKey: string; items: { route: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] }[] = [
  {
    titleKey: 'nav_main',
    items: [
      { route: 'Overview', labelKey: 'overview', icon: 'home-outline' },
      { route: 'Farms', labelKey: 'farms', icon: 'leaf-outline' },
      { route: 'Production', labelKey: 'production', icon: 'basket-outline' },
      { route: 'Trees', labelKey: 'trees', icon: 'nutrition-outline' },
      { route: 'Tasks', labelKey: 'tasks', icon: 'checkbox-outline' },
    ],
  },
  {
    titleKey: 'nav_money',
    items: [
      { route: 'Expenses', labelKey: 'expenses', icon: 'trending-down-outline' },
      { route: 'Incomes', labelKey: 'incomes', icon: 'trending-up-outline' },
      { route: 'Analytics', labelKey: 'analytics', icon: 'bar-chart-outline' },
    ],
  },
  {
    titleKey: 'nav_network',
    items: [
      { route: 'Vendors', labelKey: 'vendors', icon: 'storefront-outline' },
      { route: 'Customers', labelKey: 'customers', icon: 'people-outline' },
    ],
  },
  {
    titleKey: 'nav_setup',
    items: [
      { route: 'ExpenseCategories', labelKey: 'expense_categories', icon: 'pricetags-outline' },
      { route: 'IncomeCategories', labelKey: 'income_categories', icon: 'pricetag-outline' },
      { route: 'TreeTypes', labelKey: 'tree_types', icon: 'git-branch-outline' },
      { route: 'TaskCategories', labelKey: 'task_categories', icon: 'list-outline' },
      { route: 'Settings', labelKey: 'settings', icon: 'settings-outline' },
    ],
  },
];

export function DrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const theme = useColors();
  const styles = useDrawerStyles();
  useLang();
  const insets = useSafeAreaInsets();
  const active = state.routes[state.index]?.name;
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['#1E4D3A', '#2E6B4F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="leaf" size={22} color="#A8C686" />
        </View>
        <Text style={styles.brandTitle}>Agro</Text>
        <Text style={styles.brandSub}>{t('nav_workspace')}</Text>
      </LinearGradient>
      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {GROUPS.map((g) => (
          <View key={g.titleKey} style={{ marginBottom: 6 }}>
            <Text style={styles.group}>{t(g.titleKey)}</Text>
            {g.items.map((item) => {
              const isActive = item.route === active;
              return (
                <Pressable
                  key={item.route}
                  onPress={() => navigation.navigate(item.route as never)}
                  style={[styles.row, isActive && styles.rowActive]}
                >
                  <Ionicons name={item.icon} size={18} color={isActive ? '#fff' : theme.muted} />
                  <Text style={[styles.label, isActive && styles.labelActive]}>{t(item.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function useDrawerStyles() {
  const theme = useColors();
  return React.useMemo(
    () =>
      StyleSheet.create({
        wrap: { flex: 1, backgroundColor: theme.bg },
        brand: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
        logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
        brandTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
        brandSub: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: '700', color: '#A8C686', marginTop: 2 },
        list: { flex: 1 },
        listContent: { padding: 14, paddingBottom: 28 },
        group: { fontSize: 10.5, letterSpacing: 1.3, fontWeight: '800', color: theme.faint, marginBottom: 6, marginTop: 6, marginLeft: 10 },
        row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
        rowActive: { backgroundColor: theme.pine },
        label: { fontSize: 14.5, fontWeight: '600', color: theme.inkSoft },
        labelActive: { color: '#fff', fontWeight: '700' },
      }),
    [theme],
  );
}
