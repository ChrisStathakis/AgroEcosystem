import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createProduction, deleteProduction, listProductions, updateProduction } from '../db/repositories/productions';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import { listIncomes } from '../db/repositories/transactions';
import type { Farm, Income, NamedRow, ProductionUnit } from '../db/types';
import { Screen } from './Screen';
import { t } from '../lib/i18n';
import { exportProductionsAndShare } from '../lib/csv';
import { fmt, theme } from '../components/theme';
import { AppButton, AppInput, Badge, Card, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { Select } from '../components/Select';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

const UNITS: { id: ProductionUnit; label: string }[] = [
  { id: 'kg', label: 'Kg' },
  { id: 'tn', label: 'Tn' },
  { id: 'l', label: 'L' },
];

const currentYear = new Date().getFullYear();

export function ProductionsScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filterFarmId, setFilterFarmId] = useState<number | null>(null);
  const [filterTypeId, setFilterTypeId] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState('');
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [farmId, setFarmId] = useState<number | null>(null);
  const [treeTypeId, setTreeTypeId] = useState<number | null>(null);
  const [year, setYear] = useState(String(currentYear));
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<ProductionUnit>('kg');
  const [notes, setNotes] = useState('');
  const [incomeIds, setIncomeIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [treeTypes, setTreeTypes] = useState<NamedRow[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);

  const refresh = useCallback(async () => {
    setRows(
      await listProductions({
        q: q || undefined,
        farm_id: filterFarmId ?? undefined,
        tree_type_id: filterTypeId ?? undefined,
        year: filterYear ? Number(filterYear) : undefined,
        linked: filterLinked,
      }),
    );
    try {
      setFarms(await listFarms());
      setTreeTypes(await listLookups('tree_types'));
      setIncomes(await listIncomes());
    } catch {
      // Option lists are best-effort.
    }
  }, [q, filterFarmId, filterTypeId, filterYear, filterLinked]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const reset = () => {
    setFarmId(null); setTreeTypeId(null); setYear(String(currentYear));
    setQuantity(''); setUnit('kg'); setNotes(''); setIncomeIds([]); setEditingId(null);
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setFarmId(r.farm_id); setTreeTypeId(r.tree_type_id);
    setYear(String(r.year)); setQuantity(String(r.quantity)); setUnit(r.unit);
    setNotes(r.notes ?? '');
    listProductions({}).then(() => {});
    import('../db/repositories/productions').then(async (m) => {
      const links = await m.listProductionIncomeLinks(r.id);
      setIncomeIds(links.map((l) => l.income_id));
    }).catch(() => setIncomeIds([]));
  };

  const submit = async () => {
    try {
      if (!farmId) throw new Error('Select a farm.');
      if (!treeTypeId) throw new Error('Select a tree type.');
      const payload = {
        farm_id: farmId, tree_type_id: treeTypeId, year: Number(year),
        quantity: Number(quantity), unit, notes, income_ids: incomeIds,
      };
      if (editingId) await updateProduction(editingId, payload);
      else await createProduction(payload);
      reset();
      refresh();
    } catch (e: any) {
      Alert.alert('Invalid', e.message);
    }
  };

  const toggleIncome = (id: number) => {
    setIncomeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('productions')} subtitle="HARVEST PER YEAR AND FARM">
        <Card>
          <SearchBar value={q} onChange={setQ} placeholder={t('search')} />
          <Select label={t('farm')} placeholder={t('all_farms')} value={filterFarmId}
            options={farms.map((x) => ({ id: x.id, label: x.title }))} onChange={setFilterFarmId} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Select label={t('tree_types')} placeholder={t('all')} value={filterTypeId}
                options={treeTypes.map((x) => ({ id: x.id, label: x.name }))} onChange={setFilterTypeId} />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label={t('year')} placeholder={String(currentYear)} value={filterYear} onChangeText={setFilterYear} keyboardType="number-pad" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['all', 'linked', 'unlinked'] as const).map((v) => (
              <Pressable key={v} onPress={() => setFilterLinked(v)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: filterLinked === v ? theme.pine : theme.sage }}>
                <Text style={{ color: filterLinked === v ? '#fff' : theme.ink, fontWeight: '700', fontSize: 12.5 }}>
                  {v === 'all' ? t('all') : v === 'linked' ? t('linked_only') : t('unlinked')}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: 8 }} />
          <AppButton title={t('apply')} variant="secondary" icon="filter" onPress={refresh} />
        </Card>

        <SectionTitle title={`${rows.length} records`}
          action={<AppButton title="Export" variant="ghost" onPress={() => exportProductionsAndShare(rows).catch((e: Error) => Alert.alert('Export failed', e.message))} />} />
        {rows.length === 0 && <EmptyState icon="basket-outline" title="No production yet" hint="Record harvest per year, farm and tree type." />}
        {rows.map((r) => (
          <RowCard key={r.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.ink }}>
                  {r.year} · {r.farm_title} · {r.tree_type_name}
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.muted }}>
                  {fmt(r.quantity)} {r.unit}{r.income_summary ? ` · ${r.income_summary}` : ` · ${t('unlinked')}`}
                </Text>
              </View>
              <Badge label={`${fmt(r.quantity)} ${r.unit}`} tone="green" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><AppButton title="Edit" variant="secondary" onPress={() => startEdit(r)} /></View>
              <View style={{ flex: 1 }}><AppButton title="Delete" variant="ghost" onPress={() => deleteProduction(r.id).then(refresh).catch((e: Error) => Alert.alert('Error', e.message))} /></View>
            </View>
          </RowCard>
        ))}

        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>
            {editingId ? 'Edit production' : 'Add production'}
          </Text>
          <Select label={t('farm')} placeholder="Select farm…" value={farmId}
            options={farms.map((x) => ({ id: x.id, label: x.title }))} onChange={setFarmId} allowClear={false} />
          <Select label={t('tree_types')} placeholder="Select…" value={treeTypeId}
            options={treeTypes.map((x) => ({ id: x.id, label: x.name }))} onChange={setTreeTypeId} allowClear={false} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppInput label={t('year')} value={year} onChangeText={setYear} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label={t('quantity')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Select label={t('unit')} value={unit} options={UNITS as any}
                onChange={(v) => setUnit((v as ProductionUnit) ?? 'kg')} allowClear={false} />
            </View>
          </View>
          <AppInput label="Notes" placeholder="Optional" value={notes} onChangeText={setNotes} />
          <Text style={{ fontWeight: '800', marginTop: 8, marginBottom: 6, color: theme.ink }}>{t('incomes_linked')} ({t('unlinked')} ok)</Text>
          {incomes.slice(0, 30).map((inc) => {
            const active = incomeIds.includes(inc.id);
            return (
              <Pressable key={inc.id} onPress={() => toggleIncome(inc.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: theme.border,
                  backgroundColor: active ? theme.pine : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ color: theme.ink, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                  {inc.title} · {fmt(inc.amount)} · {inc.date}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ height: 8 }} />
          <AppButton title={editingId ? 'Save' : 'Create'} icon="checkmark-circle" onPress={submit} />
          {editingId ? <View style={{ height: 8 }} /> : null}
          {editingId ? <AppButton title="Cancel" variant="ghost" onPress={reset} /> : null}
        </Card>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
