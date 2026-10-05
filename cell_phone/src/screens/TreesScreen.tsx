import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listPlantings, listTreeMovements, recordTreeMovement } from '../db/repositories/trees';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { TreeInventoryMovement, TreePlanting } from '../db/types';
import { todayISODate } from '../db/types';
import { Screen } from './Screen';
import { t } from '../lib/i18n';
import { AppButton, AppInput, AppSelect, Badge, Card, EmptyState, RowCard, SearchBar, SectionTitle, type SelectOption } from '../components/ui';
import { theme } from '../components/theme';

export function TreesScreen() {
  const [rows, setRows] = useState<TreePlanting[]>([]);
  const [history, setHistory] = useState<TreeInventoryMovement[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [plantingId, setPlantingId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [count, setCount] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [date, setDate] = useState(todayISODate());
  const [notes, setNotes] = useState('');
  const [farmOpts, setFarmOpts] = useState<SelectOption[]>([]);
  const [typeOpts, setTypeOpts] = useState<SelectOption[]>([]);
  const [plantingOpts, setPlantingOpts] = useState<SelectOption[]>([]);

  const refresh = useCallback(async () => {
    setRows(await listPlantings(farmId ? Number(farmId) : undefined, q));
    setHistory(await listTreeMovements(plantingId ? Number(plantingId) : undefined));
    const farms = await listFarms();
    const types = await listLookups('tree_types');
    setFarmOpts(farms.map((f) => ({ id: f.id, label: f.title, sub: `#${f.id}` })));
    setTypeOpts(types.map((x) => ({ id: x.id, label: x.name, sub: `#${x.id}` })));
    const plantings = await listPlantings();
    setPlantingOpts(plantings.map((p) => ({ id: p.id, label: `#${p.id} · ${p.farm_title} — ${p.tree_type_name} (${p.count})` })));
  }, [q, farmId, plantingId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen title={t('trees')} subtitle="HOW MANY TREES OF EACH TYPE EACH FARM HAS">
      <SearchBar value={q} onChange={setQ} placeholder="Search plantings…" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppSelect label="Farm filter" placeholder="All farms" value={farmId || null} options={farmOpts} onChange={(id) => setFarmId(id == null ? '' : String(id))} />
        </View>
        <View style={{ flex: 1 }}>
          <AppSelect label="Planting (history)" placeholder="All plantings" value={plantingId || null} options={plantingOpts} onChange={(id) => setPlantingId(id == null ? '' : String(id))} />
        </View>
      </View>
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
          {r.notes ? <Text style={{ fontSize: 12.5, color: theme.muted }}>{r.notes}</Text> : null}
        </RowCard>
      ))}

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 6 }}>Record tree movement</Text>
        <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>
          {farmOpts.length === 0 ? 'Add a farm first. ' : ''}{typeOpts.length === 0 ? 'Add a tree type first.' : 'Pick a farm and a tree type, then add or remove.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton title="＋ Add" variant={action === 'add' ? 'primary' : 'secondary'} onPress={() => setAction('add')} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title="− Remove" variant={action === 'remove' ? 'danger' : 'secondary'} onPress={() => setAction('remove')} />
          </View>
        </View>
        <View style={{ height: 8 }} />
        <AppSelect label="Farm" placeholder="Select farm…" value={farmId || null} options={farmOpts} onChange={(id) => setFarmId(id == null ? '' : String(id))} allowClear={false} />
        <AppSelect label="Tree type" placeholder="Select tree type…" value={typeId || null} options={typeOpts} onChange={(id) => setTypeId(id == null ? '' : String(id))} allowClear={false} />
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
              if (!farmId || !typeId) throw new Error('Pick a farm and a tree type first.');
              await recordTreeMovement({ farm_id: Number(farmId), tree_type_id: Number(typeId), action, quantity: Number(count), effective_date: date, notes });
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
