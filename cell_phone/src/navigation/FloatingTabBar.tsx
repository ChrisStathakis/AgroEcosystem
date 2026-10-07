import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../components/theme';
import { t, useLang } from '../lib/i18n';

const TABS: { route: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { route: 'Overview', labelKey: 'tab_home', icon: 'home-outline', activeIcon: 'home' },
  { route: 'Farms', labelKey: 'farms', icon: 'leaf-outline', activeIcon: 'leaf' },
  { route: 'Tasks', labelKey: 'tasks', icon: 'checkbox-outline', activeIcon: 'checkbox' },
  { route: 'Expenses', labelKey: 'tab_money', icon: 'cash-outline', activeIcon: 'cash' },
  { route: 'Analytics', labelKey: 'tab_stats', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
];

const PRIMARY = new Set(['Overview', 'Farms', 'Tasks', 'Expenses', 'Incomes', 'Analytics']);

export function FloatingTabBar() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const theme = useColors();
  useLang();
  const insets = useSafeAreaInsets();
  const styles = useTabStyles();
  if (!PRIMARY.has(route.name)) return null;
  const active = route.name === 'Incomes' ? 'Expenses' : route.name;
  const bottomPad = Math.max(12, insets.bottom + 10);
  return (
    <View style={[styles.absolute, { paddingBottom: bottomPad, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]} pointerEvents="box-none">
      <BlurView intensity={86} tint="light" style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = tab.route === active;
          return (
            <Pressable
              key={tab.route}
              accessibilityRole="tab"
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (route.name !== tab.route) navigation.navigate(tab.route);
              }}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Ionicons name={isActive ? tab.activeIcon : tab.icon} size={21} color={isActive ? '#fff' : theme.muted} />
              <Text style={[styles.label, isActive && styles.labelActive]}>{t(tab.labelKey)}</Text>
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
          <Text style={styles.label}>{t('tab_more')}</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

function useTabStyles() {
  const theme = useColors();
  return React.useMemo(
    () =>
      StyleSheet.create({
        absolute: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
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
          backgroundColor: theme.card,
          ...theme.shadow,
        },
        tab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 18, minWidth: 52 },
        tabActive: { backgroundColor: theme.pine },
        label: { fontSize: 10, fontWeight: '700', color: theme.muted, marginTop: 2 },
        labelActive: { color: '#fff' },
      }),
    [theme],
  );
}
