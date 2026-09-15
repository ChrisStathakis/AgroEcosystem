import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createFarm, deleteFarm, listFarms, updateFarm } from '../db/repositories/farms';
import type { Farm } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { t } from '../lib/i18n';
import { AppButton, AppInput, AvatarDot, Badge, Card, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { theme } from '../components/theme';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export function FarmsScreen() {
  const [rows, setRows] = useState<Farm[]>([]);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [size, setSize] = useState('');
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => setRows(await listFarms(q)), [q]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const startEdit = (f: Farm) => {
    setEditingId(f.id);
    setTitle(f.title);
    setSize(String(f.size));
    setActive(!!f.active);
    setShowForm(true);
  };
  const reset = () => {
    setTitle(''); setSize(''); setActive(true); setEditingId(null); setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('farms')} subtitle="FIELDS YOU STEWARD">
        <SearchBar value={q} onChange={setQ} placeholder="Search farms…" />
        <AppButton title="Search" variant="secondary" icon="search" onPress={refresh} />

        <SectionTitle title={`${rows.length} farms`} action={<Badge label={todayISODate()} tone="neutral" />} />
        {rows.length === 0 && <EmptyState icon="leaf-outline" title="No farms yet" hint="Create your first farm to unlock trees, tasks and money." />}
        {rows.map((f) => (
          <RowCard key={f.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <AvatarDot name={f.title} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink }}>{f.title}</Text>
                <Text style={{ fontSize: 12.5, color: theme.muted }}>{f.size} ha · 🌳 {f.tree_total ?? 0} trees</Text>
              </View>
              <Badge label={f.active ? t('active') : 'off'} tone={f.active ? 'green' : 'neutral'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <AppButton title="Edit" variant="secondary" onPress={() => startEdit(f)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title="Delete" variant="ghost" onPress={() => deleteFarm(f.id).then(refresh).catch((e: Error) => Alert.alert('Blocked', e.message))} />
              </View>
            </View>
          </RowCard>
        ))}

        {!showForm ? (
          <View style={{ marginTop: 12 }}>
            <AppButton title="＋ New farm" icon="add-circle" onPress={() => setShowForm(true)} />
          </View>
        ) : (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 10 }}>{editingId ? 'Edit farm' : 'Add farm'}</Text>
            <AppInput label="Title" placeholder="e.g. Olive grove" value={title} onChangeText={setTitle} icon="leaf-outline" />
            <AppInput label="Size (ha)" placeholder="2.5" value={size} onChangeText={setSize} keyboardType="decimal-pad" icon="expand-outline" />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
              <Text style={{ fontWeight: '700', color: theme.ink }}>{t('active')}</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.pine }} />
            </View>
            <AppButton
              title={editingId ? 'Save' : 'Create'}
              icon="checkmark-circle"
              onPress={async () => {
                try {
                  if (editingId) await updateFarm(editingId, { title, size: Number(size), active });
                  else await createFarm({ title, size: Number(size), active });
                  reset();
                  refresh();
                } catch (e: any) {
                  Alert.alert('Invalid', e.message);
                }
              }}
            />
            <View style={{ height: 8 }} />
            <AppButton title="Cancel" variant="ghost" onPress={reset} />
          </Card>
        )}
        <Text style={{ marginTop: 12, color: theme.muted, fontSize: 12.5 }}>Prerequisite: create farms before trees, tasks and transactions.</Text>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
