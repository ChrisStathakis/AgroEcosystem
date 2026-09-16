import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  createExpense, createIncome, deleteExpense, deleteIncome, listExpenses, listIncomes,
  listIncomeAllocations, setExpenseArchived, setIncomeArchived, updateExpense, updateIncome,
} from '../db/repositories/transactions';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import { listCustomers, listVendors } from '../db/repositories/contacts';
import { exportAndShare } from '../lib/csv';
import { Screen } from './Screen';
import { todayISODate, type Customer, type Farm, type NamedRow, type Vendor } from '../db/types';
import { fmt, theme } from '../components/theme';
import { isGreek, t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, Chip, EmptyState, RowCard, SearchBar, SectionTitle } from '../components/ui';
import { Select } from '../components/Select';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

export interface AllocationDraft {
  farm_id: number | null;
  amount: string;
}

function useTxn(kind: 'expenses' | 'incomes') {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [doc, setDoc] = useState<'invoice' | 'receipt' | ''>('');
  const [tax, setTax] = useState<'all' | 'taxed' | 'untaxed'>('all');
  const [showArchived, setShowArchived] = useState<'all' | 'active' | 'archived'>('all');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [contactId, setContactId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISODate());
  const [description, setDescription] = useState('');
  const [includeTax, setIncludeTax] = useState(kind === 'incomes');
  const [isArchived, setIsArchived] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [categories, setCategories] = useState<NamedRow[]>([]);
  const [contacts, setContacts] = useState<Array<Vendor | Customer>>([]);

  const refresh = useCallback(async () => {
    const f: any = {
      q,
      farm_id: farmId ?? undefined,
      start: start || undefined,
      end: end || undefined,
      document_type: doc || undefined,
      tax,
    };
    if (showArchived === 'active') f.is_archived = false;
    if (showArchived === 'archived') f.is_archived = true;
    setRows(kind === 'expenses' ? await listExpenses(f) : await listIncomes(f));
    try {
      setFarms(await listFarms());
      setCategories(await listLookups(kind === 'expenses' ? 'expense_categories' : 'income_categories'));
      setContacts(kind === 'expenses' ? await listVendors() : await listCustomers());
    } catch {
      // Option lists are best-effort.
    }
  }, [q, farmId, start, end, doc, tax, showArchived, kind]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return {
    rows, q, setQ, farmId, setFarmId, start, setStart, end, setEnd, doc, setDoc, tax, setTax,
    showArchived, setShowArchived, title, setTitle, amount, setAmount, categoryId, setCategoryId,
    contactId, setContactId, date, setDate, description, setDescription, includeTax, setIncludeTax,
    isArchived, setIsArchived, editingId, setEditingId, farms, categories, contacts, refresh,
  };
}

function FilterCard({ s }: { s: ReturnType<typeof useTxn> }) {
  return (
    <Card>
      <SearchBar value={s.q} onChange={s.setQ} placeholder={t('search')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label={s.doc === '' ? 'All docs' : s.doc} onPress={() => s.setDoc(s.doc === '' ? 'invoice' : s.doc === 'invoice' ? 'receipt' : '')} tone={theme.sage} />
        <Chip label={`Tax: ${s.tax}`} onPress={() => s.setTax(s.tax === 'all' ? 'taxed' : s.tax === 'taxed' ? 'untaxed' : 'all')} tone={theme.sage} />
        <Chip
          label={s.showArchived === 'all' ? (isGreek() ? 'Όλα' : 'All') : s.showArchived === 'active' ? 'Active' : t('archived')}
          onPress={() => s.setShowArchived(s.showArchived === 'all' ? 'active' : s.showArchived === 'active' ? 'archived' : 'all')}
          tone={theme.sage}
        />
      </View>
      <Select
        label="Farm filter"
        placeholder="All farms"
        value={s.farmId}
        options={s.farms.map((x) => ({ id: x.id, label: x.title }))}
        onChange={s.setFarmId}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><AppInput placeholder="From YYYY-MM-DD" value={s.start} onChangeText={s.setStart} /></View>
        <View style={{ flex: 1 }}><AppInput placeholder="To YYYY-MM-DD" value={s.end} onChangeText={s.setEnd} /></View>
      </View>
      <AppButton title="Apply" variant="secondary" icon="filter" onPress={s.refresh} />
    </Card>
  );
}

function TxnForm({ s, kind, allocations, setAllocations }: {
  s: ReturnType<typeof useTxn>; kind: 'expenses' | 'incomes';
  allocations: AllocationDraft[]; setAllocations: (v: AllocationDraft[]) => void;
}) {
  return (
    <View>
      <AppInput label="Title" value={s.title} onChangeText={s.setTitle} icon="create-outline" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><AppInput label="Amount" value={s.amount} onChangeText={s.setAmount} keyboardType="decimal-pad" icon="cash-outline" /></View>
        <View style={{ flex: 1 }}><AppInput label="Date" value={s.date} onChangeText={s.setDate} icon="calendar-outline" /></View>
      </View>
      {kind === 'expenses' && (
        <Select
          label="Farm"
          placeholder="Select farm…"
          value={s.farmId}
          options={s.farms.map((x) => ({ id: x.id, label: x.title }))}
          onChange={s.setFarmId}
          allowClear={false}
        />
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Select
            label="Category"
            placeholder="Select…"
            value={s.categoryId}
            options={s.categories.map((x) => ({ id: x.id, label: x.name }))}
            onChange={s.setCategoryId}
            allowClear={false}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Select
            label={kind === 'expenses' ? 'Vendor (optional)' : 'Customer (optional)'}
            placeholder="None"
            value={s.contactId}
            options={s.contacts.map((x: any) => ({ id: x.id, label: x.name }))}
            onChange={s.setContactId}
          />
        </View>
      </View>
      <AppInput label="Description" placeholder="Optional" value={s.description} onChangeText={s.setDescription} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Chip label={s.doc === '' || s.doc === 'receipt' ? '🧾 Receipt' : '🧾 Invoice'} onPress={() => s.setDoc(s.doc === 'invoice' ? 'receipt' : 'invoice')} tone={theme.sage} />
        <Chip label={s.includeTax ? 'Tax ✓' : 'Tax ✕'} onPress={() => s.setIncludeTax(!s.includeTax)} tone={theme.sage} />
        <Chip label={s.isArchived ? `${t('archived')} ✓` : t('archived')} onPress={() => s.setIsArchived(!s.isArchived)} tone={theme.sage} />
      </View>
      {kind === 'incomes' && (
        <View>
          <Text style={{ fontWeight: '800', marginTop: 8, color: theme.ink }}>Farm allocations (optional)</Text>
          {allocations.map((allocation, index) => <View key={index} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 8, marginVertical: 6, backgroundColor: '#FAFAF6' }}>
            <Select
              label="Farm"
              placeholder="Select farm…"
              value={allocation.farm_id}
              options={s.farms.map((x) => ({ id: x.id, label: x.title }))}
              onChange={(value) => setAllocations(allocations.map((row, i) => i === index ? { ...row, farm_id: value } : row))}
              allowClear={false}
            />
            <AppInput placeholder="Allocated amount" value={allocation.amount} onChangeText={(value) => setAllocations(allocations.map((row, i) => i === index ? { ...row, amount: value } : row))} keyboardType="decimal-pad" />
            <AppButton title="Remove" variant="ghost" onPress={() => setAllocations(allocations.filter((_, i) => i !== index))} />
          </View>)}
          <AppButton title="Add allocation" variant="secondary" icon="add" onPress={() => setAllocations([...allocations, { farm_id: null, amount: '' }])} />
        </View>
      )}
    </View>
  );
}

function TxnRow({ r, kind, onEdit, onArchive, onDelete }: { r: any; kind: 'expenses' | 'incomes'; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const isOut = kind === 'expenses';
  return (
    <RowCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isOut ? theme.dangerSoft : theme.successSoft }}>
          <Ionicons name={isOut ? 'arrow-up' : 'arrow-down'} size={17} color={isOut ? theme.danger : theme.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.ink }}>{r.title}</Text>
          <Text style={{ fontSize: 12.5, color: theme.muted }}>{kind === 'expenses' ? r.farm_title : r.farm_summary || t('unallocated')} · {r.date}</Text>
        </View>
        <Text style={{ fontWeight: '800', color: isOut ? theme.danger : theme.success }}>{isOut ? '−' : '+'}{fmt(r.amount)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
        {r.is_archived ? <Badge label={t('archived')} tone="neutral" /> : null}
        {r.document_type ? <Badge label={r.document_type} tone="blue" /> : null}
        {(r.unallocated_amount ?? 0) > 0.000001 && <Badge label={`Unalloc ${fmt(r.unallocated_amount)}`} tone="amber" />}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1 }}><AppButton title="Edit" variant="secondary" onPress={onEdit} /></View>
        <View style={{ flex: 1 }}><AppButton title={r.is_archived ? 'Unarchive' : 'Archive'} variant="ghost" onPress={onArchive} /></View>
        <View style={{ flex: 1 }}><AppButton title="Delete" variant="ghost" onPress={onDelete} /></View>
      </View>
    </RowCard>
  );
}

export function ExpensesScreen() {
  const s = useTxn('expenses');
  const total = s.rows.reduce((a, r) => a + Number(r.amount), 0);

  const resetForm = () => {
    s.setTitle(''); s.setAmount(''); s.setDescription(''); s.setContactId(null);
    s.setCategoryId(null); s.setDate(todayISODate()); s.setIncludeTax(false); s.setIsArchived(false); s.setEditingId(null);
  };

  const submit = async () => {
    try {
      if (!s.farmId) throw new Error('Select a farm.');
      if (!s.categoryId) throw new Error('Select a category.');
      const payload = {
        farm_id: s.farmId, category_id: s.categoryId, contact_id: s.contactId,
        title: s.title, description: s.description, amount: Number(s.amount), date: s.date,
        document_type: (s.doc || 'receipt') as 'invoice' | 'receipt',
        include_in_tax: s.includeTax, is_archived: s.isArchived,
      };
      if (s.editingId) await updateExpense(s.editingId, payload);
      else await createExpense(payload);
      resetForm();
      s.refresh();
    } catch (e: any) {
      Alert.alert('Invalid', e.message);
    }
  };

  const startEdit = (r: any) => {
    s.setEditingId(r.id);
    s.setTitle(r.title); s.setAmount(String(r.amount)); s.setDate(r.date);
    s.setFarmId(r.farm_id); s.setCategoryId(r.category_id);
    s.setContactId(r.vendor_id ?? null);
    s.setDescription(r.description ?? ''); s.setDoc(r.document_type);
    s.setIncludeTax(!!r.include_in_tax); s.setIsArchived(!!r.is_archived);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('expenses')} subtitle="EVERY INVESTMENT IN YOUR FARM">
        <FilterCard s={s} />
        <SectionTitle title={`Total ${fmt(total)}`} action={<AppButton title="Export" variant="ghost" onPress={() => exportAndShare('expenses', s.rows).catch((e: Error) => Alert.alert('Export failed', e.message))} />} />
        {s.rows.length === 0 && <EmptyState icon="trending-down-outline" title="No expenses" hint="Record seeds, fuel, labor and more." />}
        {s.rows.map((r) => (
          <TxnRow
            key={r.id} r={r} kind="expenses"
            onEdit={() => startEdit(r)}
            onArchive={() => setExpenseArchived(r.id, !r.is_archived).then(s.refresh).catch((e: Error) => Alert.alert('Error', e.message))}
            onDelete={() => deleteExpense(r.id).then(s.refresh).catch((e: Error) => Alert.alert('Blocked', e.message))}
          />
        ))}
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>{s.editingId ? 'Edit expense' : 'Add expense'}</Text>
          <TxnForm s={s} kind="expenses" allocations={[]} setAllocations={() => {}} />
          <AppButton title={s.editingId ? 'Save' : 'Create'} icon="checkmark-circle" onPress={submit} />
          {s.editingId ? <View style={{ height: 8 }} /> : null}
          {s.editingId ? <AppButton title="Cancel" variant="ghost" onPress={resetForm} /> : null}
        </Card>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}

export function IncomesScreen() {
  const s = useTxn('incomes');
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const total = s.rows.reduce((a, r) => a + Number(r.amount), 0);

  const resetForm = () => {
    s.setTitle(''); s.setAmount(''); s.setDescription(''); s.setContactId(null);
    s.setCategoryId(null); s.setDate(todayISODate()); s.setIncludeTax(true); s.setIsArchived(false); s.setEditingId(null);
    setAllocations([]);
  };

  const submit = async () => {
    try {
      if (!s.categoryId) throw new Error('Select a category.');
      const payload = {
        category_id: s.categoryId, contact_id: s.contactId,
        title: s.title, description: s.description, amount: Number(s.amount), date: s.date,
        document_type: (s.doc || 'receipt') as 'invoice' | 'receipt',
        include_in_tax: s.includeTax, is_archived: s.isArchived,
        allocations: allocations.filter((a) => a.farm_id && a.amount).map((a) => ({ farm_id: Number(a.farm_id), amount: Number(a.amount) })),
      };
      if (s.editingId) await updateIncome(s.editingId, payload);
      else await createIncome(payload);
      resetForm();
      s.refresh();
    } catch (e: any) {
      Alert.alert('Invalid', e.message);
    }
  };

  const startEdit = async (r: any) => {
    s.setEditingId(r.id);
    s.setTitle(r.title); s.setAmount(String(r.amount)); s.setDate(r.date);
    s.setCategoryId(r.category_id); s.setContactId(r.customer_id ?? null);
    s.setDescription(r.description ?? ''); s.setDoc(r.document_type);
    s.setIncludeTax(!!r.include_in_tax); s.setIsArchived(!!r.is_archived);
    try {
      const rows = await listIncomeAllocations(r.id);
      setAllocations(rows.map((a) => ({ farm_id: a.farm_id, amount: String(a.amount) })));
    } catch {
      setAllocations([]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('incomes')} subtitle="WHAT YOUR HARD WORK BRINGS IN">
        <FilterCard s={s} />
        <SectionTitle title={`Total ${fmt(total)}`} action={<AppButton title="Export" variant="ghost" onPress={() => exportAndShare('incomes', s.rows).catch((e: Error) => Alert.alert('Export failed', e.message))} />} />
        {s.rows.length === 0 && <EmptyState icon="trending-up-outline" title="No income yet" hint="Record your first sale." />}
        {s.rows.map((r) => (
          <TxnRow
            key={r.id} r={r} kind="incomes"
            onEdit={() => startEdit(r)}
            onArchive={() => setIncomeArchived(r.id, !r.is_archived).then(s.refresh).catch((e: Error) => Alert.alert('Error', e.message))}
            onDelete={() => deleteIncome(r.id).then(s.refresh).catch((e: Error) => Alert.alert('Error', e.message))}
          />
        ))}
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>{s.editingId ? 'Edit income' : 'Add income'}</Text>
          <TxnForm s={s} kind="incomes" allocations={allocations} setAllocations={setAllocations} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
            <Text style={{ fontWeight: '700', color: theme.ink }}>Tax</Text>
            <Switch value={s.includeTax} onValueChange={s.setIncludeTax} trackColor={{ true: theme.pine }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '700', color: theme.ink }}>{t('archived')}</Text>
            <Switch value={s.isArchived} onValueChange={s.setIsArchived} trackColor={{ true: theme.pine }} />
          </View>
          <AppButton title={s.editingId ? 'Save' : 'Create'} icon="checkmark-circle" onPress={submit} />
          {s.editingId ? <View style={{ height: 8 }} /> : null}
          {s.editingId ? <AppButton title="Cancel" variant="ghost" onPress={resetForm} /> : null}
        </Card>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
