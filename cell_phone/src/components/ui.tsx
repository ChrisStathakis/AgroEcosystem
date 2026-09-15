import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------- Button ----------
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function AppButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: BtnVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const styles = btnStyles[variant];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 12, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 400 });
      }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[btnBase.base, styles.wrap, (disabled || loading) && { opacity: 0.55 }, aStyle]}
    >
      {icon ? <Ionicons name={icon} size={17} color={styles.fg.color} /> : null}
      <Text style={[btnBase.text, styles.fg]}>{loading ? '…' : title}</Text>
    </AnimatedPressable>
  );
}

const btnBase = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.radiusPill,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  text: { fontSize: 15, fontWeight: '700' },
});

const btnStyles: Record<BtnVariant, { wrap: object; fg: { color: string } }> = {
  primary: { wrap: { backgroundColor: theme.pine }, fg: { color: '#fff' } },
  secondary: {
    wrap: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: theme.borderStrong },
    fg: { color: theme.pine },
  },
  ghost: { wrap: { backgroundColor: 'transparent' }, fg: { color: theme.pine } },
  danger: { wrap: { backgroundColor: theme.danger }, fg: { color: '#fff' } },
};

// ---------- Card ----------
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[cardStyles.card, style]}>{children}</View>;
}
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    ...theme.shadowSm,
  },
});

// ---------- Section title ----------
export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={sTitle.wrap}>
      <Text style={sTitle.text}>{title}</Text>
      {action}
    </View>
  );
}
const sTitle = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  text: { fontSize: 17, fontWeight: '800', color: theme.ink, letterSpacing: -0.2 },
});

// ---------- Input ----------
export function AppInput({
  label,
  error,
  icon,
  ...props
}: TextInputProps & { label?: string; error?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const focused = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    borderColor: focused.value ? theme.pine : theme.borderStrong,
    shadowOpacity: focused.value ? 0.12 : 0,
  }));
  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <Text style={inputStyles.label}>{label}</Text> : null}
      <Animated.View style={[inputStyles.box, aStyle]}>
        {icon ? <Ionicons name={icon} size={17} color={theme.muted} /> : null}
        <TextInput
          placeholderTextColor={theme.faint}
          style={inputStyles.field}
          onFocus={() => {
            focused.value = withTiming(1, { duration: 160 });
          }}
          onBlur={() => {
            focused.value = withTiming(0, { duration: 160 });
          }}
          {...props}
        />
      </Animated.View>
      {error ? <Text style={inputStyles.error}>{error}</Text> : null}
    </View>
  );
}
const inputStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: theme.inkSoft, marginBottom: 6, letterSpacing: 0.2 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderRadius: theme.radiusSm,
    paddingHorizontal: 13,
    paddingVertical: 4,
    minHeight: 48,
  },
  field: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 10 },
  error: { fontSize: 12, color: theme.danger, marginTop: 4, fontWeight: '600' },
});

// ---------- Search ----------
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={searchStyles.box}>
      <Ionicons name="search" size={17} color={theme.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Search…'}
        placeholderTextColor={theme.faint}
        style={searchStyles.field}
      />
      {value ? (
        <Pressable onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={17} color={theme.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}
const searchStyles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusPill,
    paddingHorizontal: 14,
    minHeight: 46,
    marginBottom: 10,
  },
  field: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 10 },
});

// ---------- Chip / Badge ----------
export function Chip({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: string }) {
  return (
    <Pressable
      onPress={() => {
        if (onPress) Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={[
        chipStyles.base,
        active ? { backgroundColor: theme.pine, borderColor: theme.pine } : tone ? { backgroundColor: tone } : null,
      ]}
    >
      <Text style={[chipStyles.text, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}
const chipStyles = StyleSheet.create({
  base: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: theme.radiusPill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  text: { fontSize: 13, fontWeight: '700', color: theme.inkSoft },
});

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) {
  const bg: Record<string, string> = {
    neutral: '#EFF1EA',
    green: theme.successSoft,
    amber: theme.accentSoft,
    red: theme.dangerSoft,
    blue: theme.infoSoft,
  };
  const fg: Record<string, string> = {
    neutral: theme.inkSoft,
    green: theme.success,
    amber: '#8A5E12',
    red: theme.danger,
    blue: theme.info,
  };
  return (
    <View style={[badgeStyles.base, { backgroundColor: bg[tone] }]}>
      <Text style={[badgeStyles.text, { color: fg[tone] }]}>{label}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  base: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  text: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
});

// ---------- Avatar dot ----------
const AVATAR_COLORS = ['#2E6B4F', '#D9A441', '#2F6FED', '#8E5BD6', '#C65D3A', '#1890A4'];
export function AvatarDot({ name, size = 40 }: { name: string; size?: number }) {
  const idx = (name?.length ?? 0) % AVATAR_COLORS.length;
  const initial = (name?.trim()?.[0] ?? '•').toUpperCase();
  return (
    <View style={[avatarStyles.base, { backgroundColor: AVATAR_COLORS[idx], width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[avatarStyles.text, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}
const avatarStyles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '800' },
});

// ---------- Row card ----------
export function RowCard({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inner = (
    <Animated.View style={[rowStyles.card, aStyle]}>
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.faint} /> : null}
    </Animated.View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      onPress={onPress}
    >
      {inner}
    </Pressable>
  );
}
const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusSm,
    padding: 13,
    marginBottom: 9,
    ...theme.shadowSm,
  },
});

// ---------- Empty / Skeleton ----------
export function EmptyState({ icon = 'leaf-outline', title, hint }: { icon?: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  return (
    <View style={emptyStyles.wrap}>
      <View style={emptyStyles.iconWrap}>
        <Ionicons name={icon} size={26} color={theme.moss} />
      </View>
      <Text style={emptyStyles.title}>{title}</Text>
      {hint ? <Text style={emptyStyles.hint}>{hint}</Text> : null}
    </View>
  );
}
const emptyStyles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 26, backgroundColor: '#fff', borderRadius: theme.radius, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.sage, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '800', color: theme.ink },
  hint: { fontSize: 13, color: theme.muted, marginTop: 4, textAlign: 'center' },
});

export function Skeleton({ height = 74 }: { height?: number }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.45, { duration: 800 })), -1, true);
  }, [opacity]);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ height, backgroundColor: '#E9EDE4', borderRadius: theme.radiusSm, marginBottom: 9 }, aStyle]} />;
}

// ---------- Segmented tabs ----------
export function SegmentedTabs<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={segStyles.wrap}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.id);
            }}
            style={[segStyles.btn, active && segStyles.active]}
          >
            <Text style={[segStyles.text, active && segStyles.activeText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const segStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: '#E9EDE4', borderRadius: 999, padding: 4, gap: 4, marginBottom: 12 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  active: { backgroundColor: '#fff', ...theme.shadowSm },
  text: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
  activeText: { color: theme.pine },
});

// ---------- FAB ----------
export function FAB({ icon = 'add', onPress, label }: { icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; label?: string }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.9);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={[fabStyles.base, aStyle]}
    >
      <Ionicons name={icon} size={22} color="#fff" />
      {label ? <Text style={fabStyles.label}>{label}</Text> : null}
    </AnimatedPressable>
  );
}
const fabStyles = StyleSheet.create({
  base: {
    position: 'absolute',
    right: 18,
    bottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.pine,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 15,
    ...theme.shadow,
  },
  label: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
