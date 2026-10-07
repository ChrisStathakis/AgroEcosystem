import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createTask, deleteTask, listTaskExpenseOptions, listTaskPlantingOptions, listTasks, updateTask } from '../db/repositories/tasks';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import type { FarmTask } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { t, useLang } from '../lib/i18n';
import { AppButton, AppInput, AppSelect, Badge, Card, EmptyState, FilterDropdown, RowCard, SearchBar, SectionTitle, type SelectOption } from '../components/ui';
import { useColors } from '../components/theme';
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
  const [showForm, setShowForm] = useState(false);
  const [farmOpts, setFarmOpts] = useState<SelectOption[]>([]);
  const [catOpts, setCatOpts] = useState<SelectOption[]>([]);
  const [plantingOpts, setPlantingOpts] = useState<SelectOption[]>([]);
  const [expenseOpts, setExpenseOpts] = useState<SelectOption[]>([]);
  const theme = useColors();
  useLang();

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
      setFarmOpts(farms.map((f) => ({ id: f.id, label: f.title, sub: `#${f.id}` })));
      setCatOpts(cats.map((c) => ({ id: c.id, label: c.name })));
      // Keep the currently linked planting/expense selectable while editing,
      // even for zero-count groups or archived expenses (server TaskForm).
      const plantingNum = plantingId.trim() ? Number(plantingId) : NaN;
      const expenseNum = expenseId.trim() ? Number(expenseId) : NaN;
      const plantings = await listTaskPlantingOptions(
        farmId ? Number(farmId) : undefined, Number.isFinite(plantingNum) ? plantingNum : undefined);
      setPlantingOpts(plantings.map((p) => ({ id: p.id, label: `#${p.id} · ${p.type_name} @ ${p.farm_title}` })));
      const expenses = await listTaskExpenseOptions(
        farmId ? Number(farmId) : undefined, Number.isFinite(expenseNum) ? expenseNum : undefined);
      setExpenseOpts(expenses.map((e) => ({ id: e.id, label: `#${e.id} · ${e.title} (${e.amount})`, sub: e.date })));
    } catch {
      // keep previous options
    }
  }, [q, farmId, plantingId, categoryId, start, end, expenseId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const resetForm = () => {
    setTitle(''); setDescription(''); setDate(todayISODate());
    setPlantingId(''); setExpenseId(''); setEditingId(null); setShowForm(false);
  };

  const submit = async () => {
    try {
      if (!farmId || !categoryId) throw new Error(t('msg_farm_cat_required'));
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
      Alert.alert(t('msg_invalid'), e.message);
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
      <Screen title={t('tasks')} subtitle={t('sub_tasks')}>
        <SearchBar value={q} onChange={setQ} placeholder={t('ph_search_tasks')} />
        <FilterDropdown
          activeCount={(farmId ? 1 : 0) + (categoryId ? 1 : 0) + (plantingId ? 1 : 0) + (start ? 1 : 0) + (end ? 1 : 0)}
          onClear={() => { setFarmId(''); setCategoryId(''); setPlantingId(''); setStart(''); setEnd(''); }}
        >
          <AppSelect label={t('form_farm')} placeholder={t('all_farms')} value={farmId || null} options={farmOpts} onChange={(id) => setFarmId(id == null ? '' : String(id))} />
          <AppSelect label={t('form_category')} placeholder={t('form_all_cats')} value={categoryId || null} options={catOpts} onChange={(id) => setCategoryId(id == null ? '' : String(id))} />
          <AppSelect label={t('filter_tree_group')} placeholder={t('form_all_tree_groups')} value={plantingId || null} options={plantingOpts} onChange={(id) => setPlantingId(id == null ? '' : String(id))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><AppInput label={t('ph_from')} placeholder={t('ph_from')} value={start} onChangeText={setStart} /></View>
            <View style={{ flex: 1 }}><AppInput label={t('ph_to')} placeholder={t('ph_to')} value={end} onChangeText={setEnd} /></View>
          </View>
          <AppButton title={t('apply_filters')} variant="secondary" icon="filter" onPress={refresh} />
        </FilterDropdown>

        <SectionTitle title={`${rows.length} ${t('tasks_n')}`} />
        {rows.length === 0 && <EmptyState icon="checkbox-outline" title={t('empty_no_tasks_found')} hint={t('empty_no_tasks_hint')} />}
        {rows.map((item) => (
          <RowCard key={item.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge label={item.date} tone="neutral" />
              <Badge label={item.category_name ?? ''} tone="green" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink, marginTop: 6 }}>{item.title}</Text>
            <Text style={{ fontSize: 12.5, color: theme.muted }}>{item.farm_title}{item.planting_label ? ` · ${item.planting_label}` : ''}</Text>
            {item.description ? <Text style={{ fontSize: 12.5, color: theme.muted }} numberOfLines={2}>{item.description}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><AppButton title={t('edit')} variant="secondary" onPress={() => startEdit(item)} /></View>
              <View style={{ flex: 1 }}><AppButton title={t('del')} variant="ghost" onPress={() => deleteTask(item.id).then(refresh).catch((e: Error) => Alert.alert(t('msg_error'), e.message))} /></View>
            </View>
          </RowCard>
        ))}

        {!showForm ? (
          <View style={{ marginTop: 12 }}><AppButton title={t('btn_new_task')} icon="add-circle" onPress={() => setShowForm(true)} /></View>
        ) : (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 10 }}>{editingId ? t('btn_edit_task') : t('btn_add_task')}</Text>
            <AppSelect label={t('form_farm')} placeholder={t('form_select_farm')} value={farmId || null} options={farmOpts} onChange={(id) => setFarmId(id == null ? '' : String(id))} allowClear={false} />
            <AppSelect label={t('form_category')} placeholder={t('form_select_category')} value={categoryId || null} options={catOpts} onChange={(id) => setCategoryId(id == null ? '' : String(id))} allowClear={false} />
            <AppSelect label={t('form_tree_group_opt')} placeholder={t('form_whole_farm')} value={plantingId || null} options={plantingOpts} onChange={(id) => setPlantingId(id == null ? '' : String(id))} />
            <AppSelect label={t('form_linked_expense')} placeholder={t('form_no_expense')} value={expenseId || null} options={expenseOpts} onChange={(id) => setExpenseId(id == null ? '' : String(id))} />
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>{t('form_task_link_hint')}</Text>
            <AppInput label={t('form_title')} placeholder={t('ph_pruning')} value={title} onChangeText={setTitle} icon="create-outline" />
            <AppInput label={t('form_description')} placeholder={t('form_optional')} value={description} onChangeText={setDescription} />
            <AppInput label={t('form_date')} placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} icon="calendar-outline" />
            <AppButton title={editingId ? t('save') : t('create')} icon="checkmark-circle" onPress={submit} />
            <View style={{ height: 8 }} />
            <AppButton title={t('cancel')} variant="ghost" onPress={resetForm} />
          </Card>
        )}
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
