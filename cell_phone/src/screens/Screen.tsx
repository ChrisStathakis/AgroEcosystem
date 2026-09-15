import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../components/theme';

export function Screen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  headerAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerAction?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.hero}>
        <LinearGradient colors={['#DDE9D9', '#F6F7F2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View entering={FadeInDown.duration(380)} style={styles.heroInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{subtitle ?? 'YOUR FARM, IN FOCUS'}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          {headerAction}
        </Animated.View>
      </View>
      <ScrollView
        style={styles.wrap}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.pine} /> : undefined}
      >
        <Animated.View entering={FadeInDown.duration(420).delay(80)}>{children}</Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  hero: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, overflow: 'hidden' },
  heroInner: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  wrap: { flex: 1, backgroundColor: theme.bg },
  body: { padding: 16, paddingBottom: 110 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: '700', color: theme.muted, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: theme.ink, letterSpacing: -0.4 },
});
