import React, { useCallback, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createTask, deleteTask, listTasks } from '../db/repositories/tasks';
import type { FarmTask } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';

export function TasksScreen() {
  const [rows, setRows] = useState<FarmTask[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');

  const refresh = useCallback(async () => {
    setRows(await listTasks({ q, farm_id: farmId ? Number(farmId) : undefined, category_id: categoryId ? Number(categoryId) : undefined }));
  }, [q, farmId, categoryId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen title="Tasks" subtitle="HISTORY OF WORK DONE ON A FARM">
      <TextInput placeholder="Search tasks…" value={q} onChangeText={setQ} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Farm id (optional)" value={farmId} onChangeText={setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Category id (optional)" value={categoryId} onChangeText={setCategoryId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button title="Apply filters" onPress={refresh} />
      {rows.map((t) => (
        <View key={t.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>{t.title} ({t.date}) · {t.farm_title} · {t.category_name}{t.planting_label ? ` · ${t.planting_label}` : ''}</Text>
          <Button title="Delete" onPress={() => deleteTask(t.id).then(refresh).catch((e: Error) => Alert.alert('Error', e.message))} />
        </View>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Add task</Text>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={{ borderWidth: 1, padding: 8, marginVertical: 4 }} />
      <Button
        title="Create (today)"
        onPress={async () => {
          try {
            if (!farmId || !categoryId) throw new Error('Farm id and category id are required.');
            await createTask({ farm_id: Number(farmId), category_id: Number(categoryId), title, date: todayISODate() });
            setTitle('');
            refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
    </Screen>
  );
}
