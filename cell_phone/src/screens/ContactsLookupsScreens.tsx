import React, { useCallback, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createContact, deleteContact, listCustomers, listVendors } from '../db/repositories/contacts';
import { createLookup, deleteLookup, listLookups, type LookupTable } from '../db/repositories/lookups';
import { Screen } from './Screen';

export function ContactsScreen({ route }: any) {
  const kind = (route?.params?.kind ?? 'vendors') as 'vendors' | 'customers';
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const refresh = useCallback(async () => {
    setRows(kind === 'vendors' ? await listVendors(q) : await listCustomers(q));
  }, [q, kind]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return (
    <Screen title={kind === 'vendors' ? 'Vendors' : 'Customers'}>
      <TextInput placeholder="Search…" value={q} onChangeText={setQ} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button title="Search" onPress={refresh} />
      {rows.map((r) => (
        <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>{r.name}{r.phone ? ` · ${r.phone}` : ''}</Text>
          <Button title="Delete" onPress={() => deleteContact(kind, r.id).then(refresh).catch((e: Error) => Alert.alert('Blocked', e.message))} />
        </View>
      ))}
      <TextInput placeholder="New name" value={name} onChangeText={setName} style={{ borderWidth: 1, padding: 8, marginVertical: 8 }} />
      <Button
        title="Create"
        onPress={async () => {
          try {
            await createContact(kind, { name });
            setName('');
            refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
    </Screen>
  );
}

const LOOKUP_TITLES: Record<LookupTable, string> = {
  expense_categories: 'Expense categories',
  income_categories: 'Income categories',
  tree_types: 'Tree types',
  task_categories: 'Task categories',
};

export function LookupsScreen({ route }: any) {
  const table = (route?.params?.table ?? 'expense_categories') as LookupTable;
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const refresh = useCallback(async () => setRows(await listLookups(table)), [table]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return (
    <Screen title={LOOKUP_TITLES[table]}>
      {rows.map((r) => (
        <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>{r.name}</Text>
          <Button title="Delete" onPress={() => deleteLookup(table, r.id).then(refresh).catch((e: Error) => Alert.alert('Blocked', e.message))} />
        </View>
      ))}
      <TextInput placeholder="New name" value={name} onChangeText={setName} style={{ borderWidth: 1, padding: 8, marginVertical: 8 }} />
      <Button
        title="Create"
        onPress={async () => {
          try {
            await createLookup(table, name);
            setName('');
            refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
    </Screen>
  );
}
