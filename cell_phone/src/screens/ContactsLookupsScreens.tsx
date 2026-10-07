import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createContact, deleteContact, listCustomers, listVendors, updateContact } from '../db/repositories/contacts';
import { createLookup, deleteLookup, listLookups, updateLookup, type LookupTable } from '../db/repositories/lookups';
import { Screen } from './Screen';
import { t, useLang } from '../lib/i18n';
import { AppButton, AppInput, AvatarDot, Card, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { useColors } from '../components/theme';

export function ContactsScreen({ route }: any) {
  const kind = (route?.params?.kind ?? 'vendors') as 'vendors' | 'customers';
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const theme = useColors();
  useLang();
  const refresh = useCallback(async () => {
    setRows(kind === 'vendors' ? await listVendors(q) : await listCustomers(q));
  }, [q, kind]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const reset = () => {
    setName(''); setPhone(''); setEmail(''); setAddress(''); setNotes(''); setEditingId(null);
  };

  const submit = async () => {
    try {
      if (editingId) await updateContact(kind, editingId, { name, phone, email, address, notes });
      else await createContact(kind, { name, phone, email, address, notes });
      reset();
      refresh();
    } catch (e: any) {
      Alert.alert(t('msg_invalid'), e.message);
    }
  };

  return (
    <Screen title={kind === 'vendors' ? t('vendors') : t('customers')} subtitle={kind === 'vendors' ? t('sub_vendors') : t('sub_customers')}>
      <SearchBar value={q} onChange={setQ} placeholder={t('search')} />
      <AppButton title={t('btn_search')} variant="secondary" icon="search" onPress={refresh} />
      <SectionTitle title={`${rows.length} ${t('contacts')}`} />
      {rows.length === 0 && <EmptyState icon="people-outline" title={t('empty_no_contacts')} hint={t('empty_no_contacts_hint')} />}
      {rows.map((r) => (
        <RowCard key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AvatarDot name={r.name} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink }}>{r.name}</Text>
              <Text style={{ fontSize: 12.5, color: theme.muted }}>{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}</Text>
              {r.address ? <Text style={{ fontSize: 12.5, color: theme.muted }}>{r.address}</Text> : null}
              {r.notes ? <Text style={{ fontSize: 12.5, color: theme.muted, fontStyle: 'italic' }} numberOfLines={2}>{r.notes}</Text> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                title={t('edit')}
                variant="secondary"
                onPress={() => {
                  setEditingId(r.id);
                  setName(r.name); setPhone(r.phone ?? ''); setEmail(r.email ?? '');
                  setAddress(r.address ?? ''); setNotes(r.notes ?? '');
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title={t('del')} variant="ghost" onPress={() => deleteContact(kind, r.id).then(refresh).catch((e: Error) => Alert.alert(t('msg_blocked'), e.message))} />
            </View>
          </View>
        </RowCard>
      ))}
      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>{editingId ? t('btn_edit_contact') : t('btn_new_contact')}</Text>
        <AppInput label={t('name')} value={name} onChangeText={setName} icon="person-outline" />
        <AppInput label={t('phone')} placeholder={t('form_optional')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" />
        <AppInput label={t('email')} placeholder={t('form_optional')} value={email} onChangeText={setEmail} keyboardType="email-address" icon="mail-outline" />
        <AppInput label={t('address')} placeholder={t('form_optional')} value={address} onChangeText={setAddress} icon="location-outline" />
        <AppInput label={t('notes')} placeholder={t('form_optional')} value={notes} onChangeText={setNotes} icon="document-text-outline" />
        <AppButton title={editingId ? t('save') : t('create')} icon="checkmark-circle" onPress={submit} />
        {editingId ? <View style={{ height: 8 }} /> : null}
        {editingId ? <AppButton title={t('cancel')} variant="ghost" onPress={reset} /> : null}
      </Card>
    </Screen>
  );
}

const LOOKUP_TITLES: Record<LookupTable, string> = {
  expense_categories: 'expense_categories',
  income_categories: 'income_categories',
  tree_types: 'tree_types',
  task_categories: 'task_categories',
};

export function LookupsScreen({ route }: any) {
  const table = (route?.params?.table ?? 'expense_categories') as LookupTable;
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const theme = useColors();
  useLang();
  const refresh = useCallback(async () => setRows(await listLookups(table)), [table]);
  useFocusEffect(useCallback(() => { refresh(); setEditingId(null); setName(''); }, [refresh]));
  return (
    <Screen title={t(LOOKUP_TITLES[table])} subtitle={t('sub_lists')}>
      {rows.length === 0 && <EmptyState icon="pricetags-outline" title={t('empty_no_entries')} hint={t('empty_no_entries_hint')} />}
      {rows.map((r) => (
        <RowCard key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AvatarDot name={r.name} size={34} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.ink }}>{r.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                title={t('edit')}
                variant="secondary"
                onPress={() => {
                  setEditingId(r.id);
                  setName(r.name);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title={t('del')} variant="ghost" onPress={() => deleteLookup(table, r.id).then(refresh).catch((e: Error) => Alert.alert(t('msg_blocked'), e.message))} />
            </View>
          </View>
        </RowCard>
      ))}
      <Card style={{ marginTop: 12 }}>
        <AppInput label={t('form_name')} value={name} onChangeText={setName} icon="pricetag-outline" />
        <AppButton
          title={editingId ? t('save') : t('create')}
          icon="checkmark-circle"
          onPress={async () => {
            try {
              if (editingId) await updateLookup(table, editingId, name);
              else await createLookup(table, name);
              setName('');
              setEditingId(null);
              refresh();
            } catch (e: any) {
              Alert.alert(t('msg_invalid'), e.message);
            }
          }}
        />
        {editingId ? <View style={{ height: 8 }} /> : null}
        {editingId ? <AppButton title={t('cancel')} variant="ghost" onPress={() => { setEditingId(null); setName(''); }} /> : null}
      </Card>
    </Screen>
  );
}
