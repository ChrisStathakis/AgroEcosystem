import React, { useCallback, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createExpense, createIncome, deleteExpense, deleteIncome, listExpenses, listIncomes } from '../db/repositories/transactions';
import { exportAndShare } from '../lib/csv';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { fmt } from '../components/theme';

function useTxn(kind: 'expenses' | 'incomes') {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const refresh = useCallback(async () => {
    const f = { q, farm_id: farmId ? Number(farmId) : undefined };
    setRows(kind === 'expenses' ? await listExpenses(f) : await listIncomes(f));
  }, [q, farmId, kind]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return { rows, q, setQ, farmId, setFarmId, title, setTitle, amount, setAmount, categoryId, setCategoryId, refresh };
}

export function ExpensesScreen() {
  const s = useTxn('expenses');
  const total = s.rows.reduce((a, r) => a + Number(r.amount), 0);
  return (
    <Screen title="Expenses" subtitle="EVERY INVESTMENT IN YOUR FARM">
      <TextInput placeholder="Search…" value={s.q} onChangeText={s.setQ} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Farm id (optional)" value={s.farmId} onChangeText={s.setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button title="Apply" onPress={s.refresh} />
      <Text style={{ marginVertical: 8 }}>Total: {fmt(total)}</Text>
      {s.rows.map((r) => (
        <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>−{fmt(r.amount)} · {r.title} · {r.farm_title} · {r.date}</Text>
          <Button title="Delete" onPress={() => deleteExpense(r.id).then(s.refresh).catch((e: Error) => Alert.alert('Blocked', e.message))} />
        </View>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Add expense</Text>
      <TextInput placeholder="Title" value={s.title} onChangeText={s.setTitle} style={{ borderWidth: 1, padding: 8, marginVertical: 4 }} />
      <TextInput placeholder="Amount" value={s.amount} onChangeText={s.setAmount} keyboardType="decimal-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Farm id" value={s.farmId} onChangeText={s.setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Category id" value={s.categoryId} onChangeText={s.setCategoryId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button
        title="Create"
        onPress={async () => {
          try {
            await createExpense({ farm_id: Number(s.farmId), category_id: Number(s.categoryId), title: s.title, amount: Number(s.amount), date: todayISODate(), document_type: 'receipt', include_in_tax: false });
            s.setTitle('');
            s.setAmount('');
            s.refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
      <View style={{ height: 8 }} />
      <Button title="Export CSV" onPress={() => exportAndShare('expenses', s.rows).catch((e: Error) => Alert.alert('Export failed', e.message))} />
    </Screen>
  );
}

export function IncomesScreen() {
  const s = useTxn('incomes');
  const total = s.rows.reduce((a, r) => a + Number(r.amount), 0);
  return (
    <Screen title="Income" subtitle="WHAT YOUR HARD WORK BRINGS IN">
      <TextInput placeholder="Search…" value={s.q} onChangeText={s.setQ} style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Farm id (optional)" value={s.farmId} onChangeText={s.setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button title="Apply" onPress={s.refresh} />
      <Text style={{ marginVertical: 8 }}>Total: {fmt(total)}</Text>
      {s.rows.map((r) => (
        <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1 }}>
          <Text>+{fmt(r.amount)} · {r.title} · {r.farm_title} · {r.date}</Text>
          <Button title="Delete" onPress={() => deleteIncome(r.id).then(s.refresh).catch((e: Error) => Alert.alert('Error', e.message))} />
        </View>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 16 }}>Add income</Text>
      <TextInput placeholder="Title" value={s.title} onChangeText={s.setTitle} style={{ borderWidth: 1, padding: 8, marginVertical: 4 }} />
      <TextInput placeholder="Amount" value={s.amount} onChangeText={s.setAmount} keyboardType="decimal-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Farm id" value={s.farmId} onChangeText={s.setFarmId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <TextInput placeholder="Category id" value={s.categoryId} onChangeText={s.setCategoryId} keyboardType="number-pad" style={{ borderWidth: 1, padding: 8, marginBottom: 4 }} />
      <Button
        title="Create"
        onPress={async () => {
          try {
            await createIncome({ farm_id: Number(s.farmId), category_id: Number(s.categoryId), title: s.title, amount: Number(s.amount), date: todayISODate(), document_type: 'receipt', include_in_tax: true });
            s.setTitle('');
            s.setAmount('');
            s.refresh();
          } catch (e: any) {
            Alert.alert('Invalid', e.message);
          }
        }}
      />
      <View style={{ height: 8 }} />
      <Button title="Export CSV" onPress={() => exportAndShare('incomes', s.rows).catch((e: Error) => Alert.alert('Export failed', e.message))} />
    </Screen>
  );
}
