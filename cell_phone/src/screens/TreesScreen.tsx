import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { QuickAdd, type QuickAddKind } from '../components/QuickAdd';
import { useFocusEffect } from '@react-navigation/native';
import { listPlantings, listTreeMovements, recordTreeMovement } from '../db/repositories/trees';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { Farm, NamedRow, TreeInventoryMovement, TreePlanting } from '../db/types';
import { todayISODate } from '../db/types';
import { Screen } from './Screen';
import { t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { Select } from '../components/Select';
import { theme } from '../components/theme';

export function TreesScreen() {
  const [rows, setRows] = useState<TreePlanting[]>([]);
  const [history, setHistory] = useState<TreeInventoryMovement[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState<number | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [count, setCount] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [date, setDate] = useState(todayISODate());
  const [notes, setNotes] = useState('');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [types, setTypes] = useState<NamedRow[]>([]);
  const [allPlantings, setAllPlantings] = useState<TreePlanting[]>([]);
  const [quickAdd, setQuickAdd] = useState<QuickAddKind | null>(null);

  const refresh = useCallback(async () => {
    setRows(await listPlantings(farmId ?? undefined, q));
    setHistory(await listTreeMovements(plantingId ?? undefined));
    setFarms(await listFarms());
    setTypes(await listLookups('tree_types'));
    setAllPlantings(await listPlantings());
  }, [q, farmId, plantingId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen title={t('trees')} subtitle="HOW MANY TREES OF EACH TYPE EACH FARM HAS">
      <SearchBar value={q} onChange={setQ} placeholder="Search plantings…" />
      <Select
        label="Farm filter"
        placeholder="All farms"
        value={farmId}
        options={farms.map((f) => ({ id: f.id, label: f.title, sub: `${f.size} ha` }))}
        onChange={setFarmId}
      />
      <Select
        label="Planting filter (history)"
        placeholder="All plantings"
        value={plantingId}
        options={allPlantings.map((p) => ({ id: p.id, label: `${p.farm_title} — ${p.tree_type_name}`, sub: `${p.count} trees` }))}
        onChange={setPlantingId}
      />
      <AppButton title="Apply filters" variant="secondary" icon="filter" onPress={refresh} />

      <SectionTitle title="Plantings" action={<Badge label={`${rows.length}`} tone="green" />} />
      {rows.length === 0 && <EmptyState icon="nutrition-outline" title="No plantings" hint="Record a tree movement below to create one." />}
      {rows.map((r) => (
        <RowCard key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={`#${r.id}`} tone="neutral" />
            <Badge label={`${r.count} trees`} tone="green" />
          </View>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.ink, marginTop: 6 }}>{r.farm_title} — {r.tree_type_name}</Text>
        </RowCard>
      ))}

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 6 }}>Record tree movement</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton title="＋ Add" variant={action === 'add' ? 'primary' : 'secondary'} onPress={() => setAction('add')} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title="− Remove" variant={action === 'remove' ? 'danger' : 'secondary'} onPress={() => setAction('remove')} />
          </View>
        </View>
        <View style={{ height: 8 }} />
        <Select
          label="Farm"
          placeholder={farms.length === 0 ? 'No farms — add one first' : 'Select farm…'}
          value={farmId}
          options={farms.map((f) => ({ id: f.id, label: f.title, sub: `${f.size} ha` }))}
          onChange={setFarmId}
          allowClear={false}
        />
        <Pressable onPress={() => setQuickAdd({ type: 'farm' })} style={{ marginTop: -4, marginBottom: 10 }}>
          <Text style={{ color: theme.pine, fontWeight: '800', fontSize: 13 }}>+ New farm</Text>
        </Pressable>
        <Select
          label="Tree type"
          placeholder={types.length === 0 ? 'No tree types — add one first' : 'Select type…'}
          value={typeId}
          options={types.map((x) => ({ id: x.id, label: x.name }))}
          onChange={setTypeId}
          allowClear={false}
        />
        <Pressable onPress={() => setQuickAdd({ type: 'lookup', table: 'tree_types', label: 'tree type' })} style={{ marginTop: -4, marginBottom: 10 }}>
          <Text style={{ color: theme.pine, fontWeight: '800', fontSize: 13 }}>+ New tree type</Text>
        </Pressable>
        <QuickAdd
          visible={quickAdd != null}
          kind={quickAdd}
          onClose={() => setQuickAdd(null)}
          onCreated={(id) => {
            if (quickAdd?.type === 'farm') setFarmId(id);
            else setTypeId(id);
            refresh();
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><AppInput label="Quantity" value={count} onChangeText={setCount} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><AppInput label="Date" value={date} onChangeText={setDate} /></View>
        </View>
        <AppInput label="Notes" placeholder="Optional" value={notes} onChangeText={setNotes} />
        <AppButton
          title="Record movement"
          icon="checkmark-circle"
          onPress={async () => {
            try {
              if (!farmId || !typeId) throw new Error('Select a farm and a tree type.');
              await recordTreeMovement({ farm_id: farmId, tree_type_id: typeId, action, quantity: Number(count), effective_date: date, notes });
              setCount('');
              setNotes('');
              refresh();
            } catch (e: any) {
              Alert.alert('Invalid', e.message);
            }
          }}
        />
      </Card>

      <SectionTitle title="Movement history" />
      {history.map((m) => (
        <RowCard key={m.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={m.action === 'add' ? `+${m.quantity}` : `−${m.quantity}`} tone={m.action === 'add' ? 'green' : 'red'} />
            <Badge label={`bal ${m.balance_after}`} tone="neutral" />
          </View>
          <Text style={{ fontSize: 13, color: theme.inkSoft, marginTop: 6 }}>{m.effective_date} · {m.farm_title} — {m.tree_type_name}{m.notes ? ` · ${m.notes}` : ''}</Text>
        </RowCard>
      ))}
    </Screen>
  );
}
