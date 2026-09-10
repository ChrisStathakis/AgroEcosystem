import React, { useCallback, useState } from 'react';
import { Alert, Button, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createFarm, deleteFarm, listFarms } from '../db/repositories/farms';
import type { Farm } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';

export function FarmsScreen() {
  const [rows, setRows] = useState<Farm[]>([]);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [size, setSize] = useState('');
  const [active, setActive] = useState(true);

  const refresh = useCallback(async () => setRows(await listFarms(q)), [q]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen title="Your farms">
      <TextInput placeholder="Search farms…" value={q} onChangeText={setQ} style={{ borderWidth: 1, padding: 8, marginBottom: 8 }} />
      <Button title="Search" onPress={refresh} />
      {rows.map((f) => (
        <View key={f.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>{f.title} · {f.size} ha · {f.active ? 'active' : 'inactive'} · trees: {f.tree_total ?? 0}</Text>
          <Button title="Delete" onPress={() => deleteFarm(f.id).then(refresh).catch((e: Error) => Alert.alert('Blocked', e.message))} />
        </View>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Add farm</Text>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={{ borderWidth: 1, padding: 8, marginVertical: 4 }} />
      <TextInput placeholder="Size (ha)" value={size} onChangeText={setSize} keyboardType="decimal-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text>Active</Text>
        <Switch value={active} onValueChange={setActive} />
      </View>
      <Button
        title="Create"
        onPress={async () => {
          try {
            await createFarm({ title, size: Number(size), active });
            setTitle('');
            setSize('');
            refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
      <Text style={{ marginTop: 8, color: '#666' }}>Prerequisite: create farms before trees, tasks and transactions. {todayISODate()}</Text>
    </Screen>
  );
}
