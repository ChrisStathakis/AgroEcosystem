import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createTask, deleteTask, listTaskExpenseOptions, listTaskPlantingOptions, listTasks, updateTask } from '../db/repositories/tasks';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { Farm, FarmTask, NamedRow } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, Chip, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { Select } from '../components/Select';
import { theme } from '../components/theme';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export function TasksScreen() {
  const [rows, setRows] = useState<FarmTask[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState<number | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [expenseId, setExpenseId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [categories, setCategories] = useState<NamedRow[]>([]);
  const [plantingOptions, setPlantingOptions] = useState<Array<{ id: number; type_name: string; farm_title: string }>>([]);
  const [expenseOptions, setExpenseOptions] = useState<Array<{ id: number; title: string; date: string; amount: number }>>([]);

  const refresh = useCallback(async () => {
    setRows(await listTasks({
      q,
      farm_id: farmId ?? undefined,
      planting_id: plantingId ?? undefined,
      category_id: categoryId ?? undefined,
      start: start || undefined,
      end: end || undefined,
    }));
    try {
      setFarms(await listFarms());
      setCategories(await listLookups('task_categories'));
      setExpenseOptions(await listTaskExpenseOptions(farmId ?? undefined, expenseId ?? undefined));
      setPlantingOptions(await listTaskPlantingOptions(farmId ?? undefined, plantingId ?? undefined));
    } catch {
      // Options are best-effort; list itself already succeeded.
    }
  }, [q, farmId, plantingId, categoryId, start, end, expenseId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const resetForm = () => {
    setTitle(''); setDescription(''); setDate(todayISODate());
    setPlantingId(null); setExpenseId(null); setEditingId(null); setShowForm(false);
  };

  const submit = async () => {
    try {
      if (!farmId || !categoryId) throw new Error('Select a farm and a category.');
      const payload = {
        farm_id: farmId, planting_id: plantingId,
        category_id: categoryId, expense_id: expenseId,
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
    setFarmId(item.farm_id); setCategoryId(item.category_id);
    setPlantingId(item.planting_id ?? null);
    setExpenseId(item.expense_id ?? null);
    setTitle(item.title); setDescription(item.description ?? ''); setDate(item.date);
    setShowForm(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('tasks')} subtitle="HISTORY OF WORK DONE ON A FARM">
        <SearchBar value={q} onChange={setQ} placeholder="Search tasks…" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={farmId ? `Farm #${farmId}` : 'All farms'} active={!!farmId} onPress={() => setFarmId(null)} />
          <Chip label={categoryId ? `Cat #${categoryId}` : 'All categories'} active={!!categoryId} onPress={() => setCategoryId(null)} />
          <Chip label="Apply filters" onPress={refresh} tone={theme.sage} />
        </View>
        <Card>
          <Select
            label="Farm filter"
            placeholder="All farms"
            value={farmId}
            options={farms.map((f) => ({ id: f.id, label: f.title }))}
            onChange={setFarmId}
          />
          <Select
            label="Category filter"
            placeholder="All categories"
            value={categoryId}
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            onChange={setCategoryId}
          />
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
            <Select
              label="Farm"
              placeholder="Select farm…"
              value={farmId}
              options={farms.map((f) => ({ id: f.id, label: f.title }))}
              onChange={setFarmId}
              allowClear={false}
            />
            <Select
              label="Category"
              placeholder="Select category…"
              value={categoryId}
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              onChange={setCategoryId}
              allowClear={false}
            />
            <AppInput label="Title" placeholder="e.g. Pruning" value={title} onChangeText={setTitle} icon="create-outline" />
            <AppInput label="Description" placeholder="Optional" value={description} onChangeText={setDescription} />
            <AppInput label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} icon="calendar-outline" />
            <Select
              label="Tree group (optional)"
              placeholder="No tree group"
              value={plantingId}
              options={plantingOptions.map((p) => ({ id: p.id, label: `${p.type_name} @ ${p.farm_title}` }))}
              onChange={setPlantingId}
            />
            <Select
              label="Linked expense (optional)"
              placeholder="No linked expense"
              value={expenseId}
              options={expenseOptions.map((e) => ({ id: e.id, label: e.title, sub: `${e.date} · ${e.amount}` }))}
              onChange={setExpenseId}
            />
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
