import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { theme } from '../components/theme';

const TABS: { route: string; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { route: 'Overview', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { route: 'Farms', label: 'Farms', icon: 'leaf-outline', activeIcon: 'leaf' },
  { route: 'Tasks', label: 'Tasks', icon: 'checkbox-outline', activeIcon: 'checkbox' },
  { route: 'Expenses', label: 'Money', icon: 'cash-outline', activeIcon: 'cash' },
  { route: 'Analytics', label: 'Stats', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
];

const PRIMARY = new Set(['Overview', 'Farms', 'Tasks', 'Expenses', 'Incomes', 'Analytics']);

export function FloatingTabBar() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  if (!PRIMARY.has(route.name)) return null;
  const active = route.name === 'Incomes' ? 'Expenses' : route.name;
  return (
    <View style={styles.absolute} pointerEvents="box-none">
      <BlurView intensity={86} tint="light" style={styles.bar}>
        {TABS.map((t) => {
          const isActive = t.route === active;
          return (
            <Pressable
              key={t.route}
              accessibilityRole="tab"
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (route.name !== t.route) navigation.navigate(t.route);
              }}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Ionicons name={isActive ? t.activeIcon : t.icon} size={21} color={isActive ? '#fff' : theme.muted} />
              <Text style={[styles.label, isActive && styles.labelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            (navigation as any).openDrawer?.();
          }}
          style={styles.tab}
        >
          <Ionicons name="menu-outline" size={21} color={theme.muted} />
          <Text style={styles.label}>More</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: 18, paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#FFFFFFE8',
    ...theme.shadow,
  },
  tab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 18, minWidth: 52 },
  tabActive: { backgroundColor: theme.pine },
  label: { fontSize: 10, fontWeight: '700', color: theme.muted, marginTop: 2 },
  labelActive: { color: '#fff' },
});
