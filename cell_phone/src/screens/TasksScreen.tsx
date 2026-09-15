import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createTask, deleteTask, listTaskExpenseOptions, listTaskPlantingOptions, listTasks, updateTask } from '../db/repositories/tasks';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { FarmTask } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, Chip, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { theme } from '../components/theme';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export function TasksScreen() {
  const [rows, setRows] = useState<FarmTask[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [plantingId, setPlantingId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [expenseId, setExpenseId] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hint, setHint] = useState('');
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await listTasks({
      q,
      farm_id: farmId ? Number(farmId) : undefined,
      planting_id: plantingId ? Number(plantingId) : undefined,
      category_id: categoryId ? Number(categoryId) : undefined,
      start: start || undefined,
      end: end || undefined,
    }));
    try {
      const farms = await listFarms();
      const cats = await listLookups('task_categories');
      setHint(`farms: ${farms.map((f) => `${f.id}=${f.title}`).join(', ') || 'none'} | categories: ${cats.map((c) => `${c.id}=${c.name}`).join(', ') || 'none'}`);
      await listTaskExpenseOptions(farmId ? Number(farmId) : undefined);
      await listTaskPlantingOptions(farmId ? Number(farmId) : undefined);
    } catch {
      setHint('');
    }
  }, [q, farmId, plantingId, categoryId, start, end]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const resetForm = () => {
    setTitle(''); setDescription(''); setDate(todayISODate());
    setPlantingId(''); setExpenseId(''); setEditingId(null); setShowForm(false);
  };

  const submit = async () => {
    try {
      if (!farmId || !categoryId) throw new Error('Farm id and category id are required.');
      const payload = {
        farm_id: Number(farmId), planting_id: plantingId ? Number(plantingId) : null,
        category_id: Number(categoryId), expense_id: expenseId ? Number(expenseId) : null,
        title, description, date,
      };
      if (editingId) await updateTask(editingId, payload);
      else await createTask(payload);
      resetForm();
      refresh();
    } catch (e: any) {
      Alert.alert('Invalid', e.message);
    }
  };

  const startEdit = (item: FarmTask) => {
    setEditingId(item.id);
    setFarmId(String(item.farm_id)); setCategoryId(String(item.category_id));
    setPlantingId(item.planting_id ? String(item.planting_id) : '');
    setExpenseId(item.expense_id ? String(item.expense_id) : '');
    setTitle(item.title); setDescription(item.description ?? ''); setDate(item.date);
    setShowForm(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('tasks')} subtitle="HISTORY OF WORK DONE ON A FARM">
        <SearchBar value={q} onChange={setQ} placeholder="Search tasks…" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={farmId ? `Farm #${farmId}` : 'All farms'} active={!!farmId} onPress={() => setFarmId('')} />
          <Chip label={categoryId ? `Cat #${categoryId}` : 'All categories'} active={!!categoryId} onPress={() => setCategoryId('')} />
          <Chip label="Apply filters" onPress={refresh} tone={theme.sage} />
        </View>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput placeholder="Farm id" value={farmId} onChangeText={setFarmId} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><AppInput placeholder="Category id" value={categoryId} onChangeText={setCategoryId} keyboardType="number-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput placeholder="From YYYY-MM-DD" value={start} onChangeText={setStart} /></View>
            <View style={{ flex: 1 }}><AppInput placeholder="To YYYY-MM-DD" value={end} onChangeText={setEnd} /></View>
          </View>
          <AppButton title="Apply filters" variant="secondary" icon="filter" onPress={refresh} />
        </Card>

        <SectionTitle title={`${rows.length} tasks`} />
        {rows.length === 0 && <EmptyState icon="checkbox-outline" title="No tasks found" hint="Log pruning, spraying, harvest and more." />}
        {rows.map((item) => (
          <RowCard key={item.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge label={item.date} tone="neutral" />
              <Badge label={item.category_name ?? ''} tone="green" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink, marginTop: 6 }}>{item.title}</Text>
            <Text style={{ fontSize: 12.5, color: theme.muted }}>{item.farm_title}{item.planting_label ? ` · ${item.planting_label}` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><AppButton title="Edit" variant="secondary" onPress={() => startEdit(item)} /></View>
              <View style={{ flex: 1 }}><AppButton title="Delete" variant="ghost" onPress={() => deleteTask(item.id).then(refresh).catch((e: Error) => Alert.alert('Error', e.message))} /></View>
            </View>
          </RowCard>
        ))}

        {!showForm ? (
          <View style={{ marginTop: 12 }}><AppButton title="＋ New task" icon="add-circle" onPress={() => setShowForm(true)} /></View>
        ) : (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 10 }}>{editingId ? 'Edit task' : 'Add task'}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>{hint}</Text>
            <AppInput label="Title" placeholder="e.g. Pruning" value={title} onChangeText={setTitle} icon="create-outline" />
            <AppInput label="Description" placeholder="Optional" value={description} onChangeText={setDescription} />
            <AppInput label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} icon="calendar-outline" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><AppInput label="Planting id" value={plantingId} onChangeText={setPlantingId} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><AppInput label="Expense id" value={expenseId} onChangeText={setExpenseId} keyboardType="number-pad" /></View>
            </View>
            <AppButton title={editingId ? 'Save' : 'Create'} icon="checkmark-circle" onPress={submit} />
            <View style={{ height: 8 }} />
            <AppButton title="Cancel" variant="ghost" onPress={resetForm} />
          </Card>
        )}
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
