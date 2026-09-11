import React, { useCallback, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listPlantings, listTreeMovements, recordTreeMovement } from '../db/repositories/trees';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { TreeInventoryMovement, TreePlanting } from '../db/types';
import { todayISODate } from '../db/types';
import { Screen } from './Screen';

export function TreesScreen() {
  const [rows, setRows] = useState<TreePlanting[]>([]);
  const [history, setHistory] = useState<TreeInventoryMovement[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [count, setCount] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [date, setDate] = useState(todayISODate());
  const [notes, setNotes] = useState('');
  const [hint, setHint] = useState('');

  const refresh = useCallback(async () => {
    setRows(await listPlantings(farmId ? Number(farmId) : undefined, q));
    setHistory(await listTreeMovements());
    const farms = await listFarms();
    const types = await listLookups('tree_types');
    setHint(`farms: ${farms.map((f) => `${f.id}=${f.title}`).join(', ') || 'none — add a farm first'} | types: ${types.map((t) => `${t.id}=${t.name}`).join(', ') || 'none — add a tree type first'}`);
  }, [q, farmId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen title="Trees" subtitle="HOW MANY TREES OF EACH TYPE EACH FARM HAS">
      <TextInput placeholder="Search…" value={q} onChangeText={setQ} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Farm id (optional filter)" value={farmId} onChangeText={setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button title="Apply filters" onPress={refresh} />
      {rows.map((r) => (
        <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>{r.farm_title} — {r.tree_type_name} ({r.count})</Text>
          <Text style={{ color: '#666' }}>History is retained below.</Text>
        </View>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Record tree movement</Text>
      <Text style={{ color: '#666' }}>{hint}</Text>
      <TextInput placeholder="Farm id" value={farmId} onChangeText={setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginVertical: 4 }} />
      <TextInput placeholder="Tree type id" value={typeId} onChangeText={setTypeId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        <Button title="Add" onPress={() => setAction('add')} color={action === 'add' ? '#244b3b' : '#888'} />
        <Button title="Remove" onPress={() => setAction('remove')} color={action === 'remove' ? '#9b3d32' : '#888'} />
      </View>
      <TextInput placeholder="Quantity" value={count} onChangeText={setCount} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Notes (optional)" value={notes} onChangeText={setNotes} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button
        title="Create"
        onPress={async () => {
          try {
            await recordTreeMovement({ farm_id: Number(farmId), tree_type_id: Number(typeId), action, quantity: Number(count), effective_date: date, notes });
            setCount('');
            setNotes('');
            refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Movement history</Text>
      {history.map((m) => <Text key={m.id} style={{ paddingVertical: 4, borderBottomWidth: 1 }}>{m.effective_date} · {m.action === 'add' ? '+' : '-'}{m.quantity} · balance: {m.balance_after} · {m.farm_title} — {m.tree_type_name}{m.notes ? ` · ${m.notes}` : ''}</Text>)}
    </Screen>
  );
}
