import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';
import { SearchBar } from './ui';

export interface SelectOption {
  id: number;
  label: string;
  sub?: string;
}

interface SelectProps {
  label?: string;
  placeholder?: string;
  value?: number | null;
  options: SelectOption[];
  onChange: (id: number | null) => void;
  allowClear?: boolean;
  disabled?: boolean;
}

/**
 * Expo Go-compatible dropdown: Pressable field + Modal + searchable FlatList.
 * Avoids native picker deps so it works in Go, dev builds and production.
 */
export function Select({ label, placeholder, value, options, onChange, allowClear = true, disabled = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder ?? 'Select'}
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={[styles.field, disabled && { opacity: 0.55 }]}
      >
        <Text style={[styles.fieldText, !selected && { color: theme.faint }]} numberOfLines={1}>
          {selected ? selected.label : placeholder ?? 'Select…'}
        </Text>
        <Ionicons name="chevron-down" size={17} color={theme.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{label ?? placeholder ?? 'Select'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}>
              <Ionicons name="close" size={20} color={theme.ink} />
            </Pressable>
          </View>
          <SearchBar value={query} onChange={setQuery} placeholder="Search…" />
          {allowClear ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
              style={styles.clearRow}
            >
              <Ionicons name="ban-outline" size={16} color={theme.muted} />
              <Text style={styles.clearText}>Clear selection</Text>
            </Pressable>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No matches. Create the item first in its own screen.</Text>}
            renderItem={({ item }) => {
              const active = item.id === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, active && { color: theme.pine }]}>{item.label}</Text>
                    {item.sub ? <Text style={styles.rowSub}>{item.sub}</Text> : null}
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={19} color={theme.pine} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: theme.inkSoft, marginBottom: 6, letterSpacing: 0.2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: theme.borderStrong,
    borderRadius: theme.radiusSm,
    paddingHorizontal: 13,
    minHeight: 48,
  },
  fieldText: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 12 },
  sheet: { flex: 1, backgroundColor: theme.bg, padding: 16, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: theme.ink },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 4 },
  clearText: { fontSize: 13.5, fontWeight: '700', color: theme.muted },
  empty: { fontSize: 13, color: theme.muted, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.border, borderRadius: theme.radiusSm, padding: 13, marginBottom: 8 },
  rowActive: { borderColor: theme.pine, borderWidth: 1.5 },
  rowLabel: { fontSize: 14.5, fontWeight: '800', color: theme.ink },
  rowSub: { fontSize: 12.5, color: theme.muted, marginTop: 2 },
});
