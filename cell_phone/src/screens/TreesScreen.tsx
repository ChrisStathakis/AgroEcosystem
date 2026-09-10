import React, { useCallback, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listPlantings, createPlanting, deletePlanting } from '../db/repositories/trees';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { TreePlanting } from '../db/types';
import { Screen } from './Screen';

export function TreesScreen() {
  const [rows, setRows] = useState<TreePlanting[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [count, setCount] = useState('');
  const [hint, setHint] = useState('');

  const refresh = useCallback(async () => {
    setRows(await listPlantings(farmId ? Number(farmId) : undefined, q));
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
          <Button title="Delete" onPress={() => deletePlanting(r.id).then(refresh).catch((e: Error) => Alert.alert('Error', e.message))} />
        </View>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Add tree group</Text>
      <Text style={{ color: '#666' }}>{hint}</Text>
      <TextInput placeholder="Farm id" value={farmId} onChangeText={setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginVertical: 4 }} />
      <TextInput placeholder="Tree type id" value={typeId} onChangeText={setTypeId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Count" value={count} onChangeText={setCount} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button
        title="Create"
        onPress={async () => {
          try {
            await createPlanting({ farm_id: Number(farmId), tree_type_id: Number(typeId), count: Number(count) });
            setCount('');
            refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
    </Screen>
  );
}
