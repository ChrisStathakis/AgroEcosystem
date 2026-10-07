import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createProduction, deleteProduction, listProductions, updateProduction } from '../db/repositories/productions';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import { listIncomes } from '../db/repositories/transactions';
import type { Farm, Income, NamedRow, ProductionUnit } from '../db/types';
import { Screen } from './Screen';
import { t, useLang } from '../lib/i18n';
import { exportProductionsAndShare } from '../lib/csv';
import { fmt, theme } from '../components/theme';
import { AppButton, AppInput, Badge, Card, EmptyState, FilterDropdown, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { Select } from '../components/Select';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

const UNITS: { id: ProductionUnit; label: string }[] = [
  { id: 'kg', label: 'Kg' },
  { id: 'tn', label: 'Tn' },
  { id: 'l', label: 'L' },
];
// Localized labels for the unit dropdown (web: Κιλά/Τόνοι/Λίτρα).
const unitLabel = (u: ProductionUnit) => t(`unit_${u}`);

const currentYear = new Date().getFullYear();

export function ProductionsScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filterFarmId, setFilterFarmId] = useState<number | null>(null);
  const [filterTypeId, setFilterTypeId] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState('');
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [filterUnit, setFilterUnit] = useState<'all' | ProductionUnit>('all');
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
  useLang();

  const refresh = useCallback(async () => {
    const rawYear = filterYear.trim();
    const y = rawYear ? Number(rawYear) : undefined;
    // An invalid year fails the filter (server: invalid form -> no records).
    const yearOk = !rawYear || (Number.isInteger(y) && (y as number) >= 2000 && (y as number) <= 2100);
    setRows(
      yearOk
        ? await listProductions({
          q: q || undefined,
          farm_id: filterFarmId ?? undefined,
          tree_type_id: filterTypeId ?? undefined,
          year: y,
          unit: filterUnit === 'all' ? undefined : filterUnit,
          linked: filterLinked,
        })
        : [],
    );
    try {
      setFarms(await listFarms());
      setTreeTypes(await listLookups('tree_types'));
      setIncomes(await listIncomes());
    } catch {
      // Option lists are best-effort.
    }
  }, [q, filterFarmId, filterTypeId, filterYear, filterUnit, filterLinked]);

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
      if (!farmId) throw new Error(t('msg_select_farm'));
      if (!treeTypeId) throw new Error(t('msg_select_type'));
      const payload = {
        farm_id: farmId, tree_type_id: treeTypeId, year: Number(year),
        quantity: Number(quantity), unit, notes, income_ids: incomeIds,
      };
      if (editingId) await updateProduction(editingId, payload);
      else await createProduction(payload);
      reset();
      refresh();
    } catch (e: any) {
      Alert.alert(t('msg_invalid'), e.message);
    }
  };

  const toggleIncome = (id: number) => {
    setIncomeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('productions')} subtitle={t('sub_production')}>
        <SearchBar value={q} onChange={setQ} placeholder={t('search')} />
        <FilterDropdown
          activeCount={
            (filterFarmId != null ? 1 : 0) + (filterTypeId != null ? 1 : 0) +
            (filterYear.trim() ? 1 : 0) + (filterLinked !== 'all' ? 1 : 0) + (filterUnit !== 'all' ? 1 : 0)
          }
          onClear={() => { setFilterFarmId(null); setFilterTypeId(null); setFilterYear(''); setFilterLinked('all'); setFilterUnit('all'); }}
        >
          <Select label={t('filter_farm')} placeholder={t('all_farms')} value={filterFarmId}
            options={farms.map((x) => ({ id: x.id, label: x.title }))} onChange={setFilterFarmId} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Select label={t('filter_tree_group')} placeholder={t('all')} value={filterTypeId}
                options={treeTypes.map((x) => ({ id: x.id, label: x.name }))} onChange={setFilterTypeId} />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label={t('filter_year')} placeholder={String(currentYear)} value={filterYear} onChangeText={setFilterYear} keyboardType="number-pad" />
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
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {(['all', 'kg', 'tn', 'l'] as const).map((v) => (
              <Pressable key={v} onPress={() => setFilterUnit(v)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: filterUnit === v ? theme.pine : theme.sage }}>
                <Text style={{ color: filterUnit === v ? '#fff' : theme.ink, fontWeight: '700', fontSize: 12.5 }}>
                  {v === 'all' ? t('all') : t(`unit_${v}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: 8 }} />
          <AppButton title={t('apply')} variant="secondary" icon="filter" onPress={refresh} />
        </FilterDropdown>

        <SectionTitle title={`${rows.length} ${t('records')}`}
          action={<AppButton title={t('btn_export')} variant="ghost" onPress={() => exportProductionsAndShare(rows).catch((e: Error) => Alert.alert(t('msg_export_failed'), e.message))} />} />
        {rows.length === 0 && <EmptyState icon="basket-outline" title={t('empty_no_production')} hint={t('empty_no_production_hint')} />}
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
              <View style={{ flex: 1 }}><AppButton title={t('edit')} variant="secondary" onPress={() => startEdit(r)} /></View>
              <View style={{ flex: 1 }}><AppButton title={t('del')} variant="ghost" onPress={() => deleteProduction(r.id).then(refresh).catch((e: Error) => Alert.alert(t('msg_error'), e.message))} /></View>
            </View>
          </RowCard>
        ))}

        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>
            {editingId ? t('btn_edit_production') : t('btn_add_production')}
          </Text>
          <Select label={t('form_farm')} placeholder={t('form_select_farm')} value={farmId}
            options={farms.map((x) => ({ id: x.id, label: x.title }))} onChange={setFarmId} allowClear={false} />
          <Select label={t('tree_types')} placeholder={t('form_select_one')} value={treeTypeId}
            options={treeTypes.map((x) => ({ id: x.id, label: x.name }))} onChange={setTreeTypeId} allowClear={false} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppInput label={t('form_year')} value={year} onChangeText={setYear} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label={t('form_quantity')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Select label={t('filter_unit')} value={unit as any} options={UNITS.map((u) => ({ id: u.id, label: unitLabel(u.id) })) as any}
                onChange={(v) => setUnit(((v as any) as ProductionUnit) ?? 'kg')} allowClear={false} />
            </View>
          </View>
          <AppInput label={t('form_notes')} placeholder={t('form_optional')} value={notes} onChangeText={setNotes} />
          <Text style={{ fontWeight: '800', marginTop: 8, marginBottom: 6, color: theme.ink }}>{t('incomes_linked')} ({t('unlinked')} ok)</Text>
          {incomes.map((inc) => {
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
          <AppButton title={editingId ? t('save') : t('create')} icon="checkmark-circle" onPress={submit} />
          {editingId ? <View style={{ height: 8 }} /> : null}
          {editingId ? <AppButton title={t('cancel')} variant="ghost" onPress={reset} /> : null}
        </Card>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
