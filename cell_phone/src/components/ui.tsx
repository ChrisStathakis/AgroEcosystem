import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
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
import { spacing, useColors } from './theme';
import { t, useLang } from '../lib/i18n';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Palette handling: module-level styles below are layout-only; styles that carry
// colors are built inside the `useXStyles()` hooks (they shadow `theme` with the
// reactive palette). Components that read `theme.*` inline declare
// `const theme = useColors();` first — so a missing subscription is a compile error.

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
  const styles = useBtnStyles(variant);
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
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  text: { fontSize: 15, fontWeight: '700' },
});

function useBtnStyles(variant: BtnVariant) {
  const theme = useColors();
  return useMemo(() => {
    const styles: Record<BtnVariant, { wrap: object; fg: { color: string } }> = {
      primary: { wrap: { backgroundColor: theme.pine }, fg: { color: '#fff' } },
      secondary: {
        wrap: { backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.borderStrong },
        fg: { color: theme.green },
      },
      ghost: { wrap: { backgroundColor: 'transparent' }, fg: { color: theme.green } },
      danger: { wrap: { backgroundColor: theme.danger }, fg: { color: '#fff' } },
    };
    return styles[variant];
  }, [theme, variant]);
}

// ---------- Card ----------
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const cardStyles = useCardStyles();
  return <View style={[cardStyles.card, style]}>{children}</View>;
}
function useCardStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: theme.card,
          borderRadius: theme.radius,
          borderWidth: 1,
          borderColor: theme.border,
          padding: spacing.md,
          ...theme.shadowSm,
        },
      }),
    [theme],
  );
}

// ---------- Section title ----------
export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  const sTitle = useSectionStyles();
  return (
    <View style={sTitle.wrap}>
      <Text style={sTitle.text}>{title}</Text>
      {action}
    </View>
  );
}
function useSectionStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
        text: { fontSize: 17, fontWeight: '800', color: theme.ink, letterSpacing: -0.2 },
      }),
    [theme],
  );
}

// ---------- Input ----------
export function AppInput({
  label,
  error,
  icon,
  ...props
}: TextInputProps & { label?: string; error?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const theme = useColors();
  const inputStyles = useInputStyles();
  const focused = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    borderColor: focused.value ? theme.green : theme.borderStrong,
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
function useInputStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        label: { fontSize: 12, fontWeight: '700', color: theme.inkSoft, marginBottom: 6, letterSpacing: 0.2 },
        box: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: theme.surface,
          borderWidth: 1.5,
          borderRadius: theme.radiusSm,
          paddingHorizontal: 13,
          paddingVertical: 4,
          minHeight: 48,
        },
        field: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 10 },
        error: { fontSize: 12, color: theme.danger, marginTop: 4, fontWeight: '600' },
      }),
    [theme],
  );
}

// ---------- Search ----------
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const theme = useColors();
  const searchStyles = useSearchStyles();
  useLang();
  return (
    <View style={searchStyles.box}>
      <Ionicons name="search" size={17} color={theme.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? t('ph_search')}
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
function useSearchStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        box: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: theme.radiusPill,
          paddingHorizontal: 14,
          minHeight: 46,
          marginBottom: 10,
        },
        field: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 10 },
      }),
    [theme],
  );
}

// ---------- Chip / Badge ----------
export function Chip({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: string }) {
  const theme = useColors();
  const chipStyles = useChipStyles();
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
function useChipStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        base: {
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.borderStrong,
          borderRadius: theme.radiusPill,
          paddingHorizontal: 13,
          paddingVertical: 8,
          marginRight: 8,
          marginBottom: 8,
        },
        text: { fontSize: 13, fontWeight: '700', color: theme.inkSoft },
      }),
    [theme],
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) {
  const theme = useColors();
  const bg: Record<string, string> = {
    neutral: theme.neutralSoft,
    green: theme.successSoft,
    amber: theme.accentSoft,
    red: theme.dangerSoft,
    blue: theme.infoSoft,
  };
  const fg: Record<string, string> = {
    neutral: theme.inkSoft,
    green: theme.success,
    amber: theme.accentText,
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
  const theme = useColors();
  const rowStyles = useRowStyles();
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
function useRowStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: theme.radiusSm,
          padding: 13,
          marginBottom: 9,
          ...theme.shadowSm,
        },
      }),
    [theme],
  );
}

// ---------- Empty / Skeleton ----------
export function EmptyState({ icon = 'leaf-outline', title, hint }: { icon?: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  const theme = useColors();
  const emptyStyles = useEmptyStyles();
  return (
    <View style={emptyStyles.wrap}>
      <View style={emptyStyles.iconWrap}>
        <Ionicons name={icon} size={26} color={theme.green} />
      </View>
      <Text style={emptyStyles.title}>{title}</Text>
      {hint ? <Text style={emptyStyles.hint}>{hint}</Text> : null}
    </View>
  );
}
function useEmptyStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { alignItems: 'center', padding: 26, backgroundColor: theme.surface, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
        iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.sage, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
        title: { fontSize: 15, fontWeight: '800', color: theme.ink },
        hint: { fontSize: 13, color: theme.muted, marginTop: 4, textAlign: 'center' },
      }),
    [theme],
  );
}

export function Skeleton({ height = 74 }: { height?: number }) {
  const theme = useColors();
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.45, { duration: 800 })), -1, true);
  }, [opacity]);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ height, backgroundColor: theme.surfaceAlt, borderRadius: theme.radiusSm, marginBottom: 9 }, aStyle]} />;
}

// ---------- Segmented tabs ----------
export function SegmentedTabs<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const segStyles = useSegStyles();
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
function useSegStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderRadius: 999, padding: 4, gap: 4, marginBottom: 12 },
        btn: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
        active: { backgroundColor: theme.surface, ...theme.shadowSm },
        text: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
        activeText: { color: theme.green },
      }),
    [theme],
  );
}

// ---------- Select (pure-JS dropdown, port of web <select> fields) ----------
export interface SelectOption {
  id: number | string;
  label: string;
  sub?: string;
}

export function AppSelect({
  label,
  placeholder = '',
  value,
  options,
  onChange,
  allowClear = true,
}: {
  label?: string;
  placeholder?: string;
  value: number | string | null | undefined;
  options: SelectOption[];
  onChange: (id: number | string | null, option?: SelectOption) => void;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const theme = useColors();
  useLang();
  const inputStyles = useInputStyles();
  const ph = placeholder || t('form_select_one');
  const selected = useMemo(() => options.find((o) => String(o.id) === String(value ?? '')), [options, value]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(needle));
  }, [options, q]);
  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <Text style={inputStyles.label}>{label}</Text> : null}
      <Pressable onPress={() => { setQ(''); setOpen(true); }} style={inputStyles.box}>
        <Ionicons name="chevron-down" size={17} color={theme.muted} />
        <Text style={[inputStyles.field, !selected && { color: theme.faint }]} numberOfLines={1}>
          {selected ? selected.label : ph}
        </Text>
        {selected && allowClear ? (
          <Pressable onPress={() => onChange(null)}>
            <Ionicons name="close-circle" size={17} color={theme.faint} />
          </Pressable>
        ) : null}
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 48, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.ink }}>{label ?? ph}</Text>
            <Pressable onPress={() => setOpen(false)} style={{ padding: 8 }}>
              <Ionicons name="close" size={22} color={theme.ink} />
            </Pressable>
          </View>
          <SearchBar value={q} onChange={setQ} placeholder={t('ph_search')} />
          <FlatList
            data={allowClear ? [{ id: '__clear__', label: `— ${t('clear')} —` } as SelectOption, ...filtered] : filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setOpen(false);
                  if (String(item.id) === '__clear__') onChange(null);
                  else onChange(item.id, item);
                }}
                style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 13, marginBottom: 8 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink }}>{item.label}</Text>
                {item.sub ? <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 2 }}>{item.sub}</Text> : null}
              </Pressable>
            )}
            ListEmptyComponent={<EmptyState icon="search-outline" title={t('empty_no_matches')} hint={t('empty_no_matches_hint')} />}
          />
        </View>
      </Modal>
    </View>
  );
}

// ---------- FAB ----------
export function FAB({ icon = 'add', onPress, label }: { icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; label?: string }) {
  const fabStyles = useFabStyles();
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
// ---------- Filter dropdown (collapsible, collapsed by default) ----------
export function FilterDropdown({
  children,
  activeCount = 0,
  onClear,
  title = '',
  defaultOpen = false,
}: {
  children: React.ReactNode;
  activeCount?: number;
  onClear?: () => void;
  title?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const theme = useColors();
  useLang();
  const shown = open;
  const header = title || t('filters');
  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: theme.radius,
        borderWidth: 1,
        borderColor: theme.border,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen((v) => !v);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 13 }}
      >
        <Ionicons name="filter" size={17} color={theme.green} />
        <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.ink, flex: 1 }}>{header}</Text>
        {activeCount > 0 ? (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.pine, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{activeCount}</Text>
          </View>
        ) : null}
        {activeCount > 0 && onClear ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onClear()}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            hitSlop={8}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.muted }}>{t('clear')}</Text>
          </Pressable>
        ) : null}
        <Ionicons name={shown ? 'chevron-up' : 'chevron-down'} size={17} color={theme.muted} />
      </Pressable>
      {shown ? <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 }}>{children}</View> : null}
    </View>
  );
}

function useFabStyles() {
  const theme = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
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
      }),
    [theme],
  );
}
