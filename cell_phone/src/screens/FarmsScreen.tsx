import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createFarm, deleteFarm, listFarms, updateFarm } from '../db/repositories/farms';
import type { Farm } from '../db/types';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { t, useLang } from '../lib/i18n';
import { AppButton, AppInput, AvatarDot, Badge, Card, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { useColors } from '../components/theme';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export function FarmsScreen() {
  const [rows, setRows] = useState<Farm[]>([]);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [size, setSize] = useState('');
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const theme = useColors();
  useLang();

  const refresh = useCallback(async () => setRows(await listFarms(q)), [q]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const startEdit = (f: Farm) => {
    setEditingId(f.id);
    setTitle(f.title);
    setSize(String(f.size));
    setActive(!!f.active);
    setShowForm(true);
  };
  const reset = () => {
    setTitle(''); setSize(''); setActive(true); setEditingId(null); setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('farms')} subtitle={t('sub_farms')}>
        <SearchBar value={q} onChange={setQ} placeholder={t('ph_search_farms')} />
        <AppButton title={t('btn_search')} variant="secondary" icon="search" onPress={refresh} />

        <SectionTitle title={`${rows.length} ${t('farms_n')}`} action={<Badge label={todayISODate()} tone="neutral" />} />
        {rows.length === 0 && <EmptyState icon="leaf-outline" title={t('empty_no_farms')} hint={t('empty_no_farms_hint')} />}
        {rows.map((f) => (
          <RowCard key={f.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <AvatarDot name={f.title} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink }}>{f.title}</Text>
                <Text style={{ fontSize: 12.5, color: theme.muted }}>{f.size} {t('farms_unit')} · 🌳 {f.tree_total ?? 0} {t('trees_unit')}</Text>
              </View>
              <Badge label={f.active ? t('active') : t('farms_off')} tone={f.active ? 'green' : 'neutral'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <AppButton title={t('edit')} variant="secondary" onPress={() => startEdit(f)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title={t('del')} variant="ghost" onPress={() => deleteFarm(f.id).then(refresh).catch((e: Error) => Alert.alert(t('msg_blocked'), e.message))} />
              </View>
            </View>
          </RowCard>
        ))}

        {!showForm ? (
          <View style={{ marginTop: 12 }}>
            <AppButton title={t('btn_new_farm')} icon="add-circle" onPress={() => setShowForm(true)} />
          </View>
        ) : (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 10 }}>{editingId ? t('btn_edit_farm') : t('btn_add_farm')}</Text>
            <AppInput label={t('form_title')} placeholder={t('ph_olive')} value={title} onChangeText={setTitle} icon="leaf-outline" />
            <AppInput label={t('form_size')} placeholder="2.5" value={size} onChangeText={setSize} keyboardType="decimal-pad" icon="expand-outline" />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
              <Text style={{ fontWeight: '700', color: theme.ink }}>{t('active')}</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.pine }} />
            </View>
            <AppButton
              title={editingId ? t('save') : t('create')}
              icon="checkmark-circle"
              onPress={async () => {
                try {
                  if (editingId) await updateFarm(editingId, { title, size: Number(size), active });
                  else await createFarm({ title, size: Number(size), active });
                  reset();
                  refresh();
                } catch (e: any) {
                  Alert.alert(t('msg_invalid'), e.message);
                }
              }}
            />
            <View style={{ height: 8 }} />
            <AppButton title={t('cancel')} variant="ghost" onPress={reset} />
          </Card>
        )}
        <Text style={{ marginTop: 12, color: theme.muted, fontSize: 12.5 }}>{t('farms_prereq')}</Text>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
