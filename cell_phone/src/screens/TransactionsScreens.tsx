import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  computeAutoSplit, createExpense, createIncome, deleteExpense, deleteIncome, listExpenses, listIncomes,
  listIncomeAllocations, setExpenseArchived, setIncomeArchived, updateExpense, updateIncome,
} from '../db/repositories/transactions';
import { listFarms } from '../db/repositories/farms';
import { listLookups } from '../db/repositories/lookups';
import { listCustomers, listVendors } from '../db/repositories/contacts';
import { exportAndShare } from '../lib/csv';
import { Screen } from './Screen';
import { todayISODate } from '../db/types';
import { fmt, useColors } from '../components/theme';
import { t, useLang } from '../lib/i18n';
import { AppButton, AppInput, AppSelect, Badge, Card, Chip, EmptyState, FilterDropdown, RowCard, SearchBar, SectionTitle, type SelectOption } from '../components/ui';
import { FloatingTabBar } from '../navigation/FloatingTabBar';

/** One draft row of the income farm-allocation editor in TxnForm. */
type AllocationDraft = { farm_id: string; amount: string };

function useTxn(kind: 'expenses' | 'incomes') {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [farmId, setFarmId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [doc, setDoc] = useState<'invoice' | 'receipt' | ''>('');
  const [tax, setTax] = useState<'all' | 'taxed' | 'untaxed'>('all');
  const [paid, setPaid] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [showArchived, setShowArchived] = useState<'all' | 'active' | 'archived'>('all');
  // Filter-only pickers (kept separate from the form's category/contact fields).
  const [filterCatId, setFilterCatId] = useState('');
  const [filterContactId, setFilterContactId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contactId, setContactId] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [description, setDescription] = useState('');
  const [includeTax, setIncludeTax] = useState(kind === 'incomes');
  const [isPaid, setIsPaid] = useState(true);
  const [isArchived, setIsArchived] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [farmOpts, setFarmOpts] = useState<SelectOption[]>([]);
  const [catOpts, setCatOpts] = useState<SelectOption[]>([]);
  const [contactOpts, setContactOpts] = useState<SelectOption[]>([]);

  const refresh = useCallback(async () => {
    const f: any = {
      q,
      farm_id: farmId ? Number(farmId) : undefined,
      category_id: filterCatId ? Number(filterCatId) : undefined,
      contact_id: filterContactId ? Number(filterContactId) : undefined,
      start: start || undefined,
      end: end || undefined,
      document_type: doc || undefined,
      tax,
      paid,
    };
    if (showArchived === 'active') f.is_archived = false;
    if (showArchived === 'archived') f.is_archived = true;
    // Reversed range matches nothing (server: invalid range -> empty records).
    if (start && end && start > end) setRows([]);
    else setRows(kind === 'expenses' ? await listExpenses(f) : await listIncomes(f));
    try {
      const farms = await listFarms();
      const cats = await listLookups(kind === 'expenses' ? 'expense_categories' : 'income_categories');
      const contacts = kind === 'expenses' ? await listVendors() : await listCustomers();
      setFarmOpts(farms.map((x) => ({ id: x.id, label: x.title, sub: `#${x.id}` })));
      setCatOpts(cats.map((x) => ({ id: x.id, label: x.name })));
      setContactOpts(contacts.map((x: any) => ({ id: x.id, label: x.name })));
    } catch {
      // keep previous options
    }
  }, [q, farmId, filterCatId, filterContactId, start, end, doc, tax, paid, showArchived, kind]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return {
    rows, q, setQ, farmId, setFarmId, start, setStart, end, setEnd, doc, setDoc, tax, setTax,
    paid, setPaid, showArchived, setShowArchived, filterCatId, setFilterCatId, filterContactId, setFilterContactId,
    title, setTitle, amount, setAmount, categoryId, setCategoryId,
    contactId, setContactId, date, setDate, description, setDescription, includeTax, setIncludeTax,
    isPaid, setIsPaid, isArchived, setIsArchived, editingId, setEditingId, farmOpts, catOpts, contactOpts, refresh,
  };
}

function FilterCard({ s, kind }: { s: ReturnType<typeof useTxn>; kind: 'expenses' | 'incomes' }) {
  const theme = useColors();
  useLang();
  const activeCount =
    (s.farmId ? 1 : 0) + (s.filterCatId ? 1 : 0) + (s.filterContactId ? 1 : 0) +
    (s.start ? 1 : 0) + (s.end ? 1 : 0) + (s.doc ? 1 : 0) +
    (s.tax !== 'all' ? 1 : 0) + (s.paid !== 'all' ? 1 : 0) + (s.showArchived !== 'all' ? 1 : 0);
  const clearAll = () => {
    s.setFarmId(''); s.setFilterCatId(''); s.setFilterContactId('');
    s.setStart(''); s.setEnd(''); s.setDoc(''); s.setTax('all'); s.setPaid('all'); s.setShowArchived('all');
  };
  return (
    <View>
      <SearchBar value={s.q} onChange={s.setQ} placeholder={t('search')} />
      <FilterDropdown activeCount={activeCount} onClear={clearAll}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={s.doc === '' ? t('all_docs') : s.doc === 'invoice' ? t('invoice') : t('receipt')} onPress={() => s.setDoc(s.doc === '' ? 'invoice' : s.doc === 'invoice' ? 'receipt' : '')} tone={theme.sage} />
          <Chip label={`${t('filter_tax')}: ${s.tax === 'all' ? t('all') : s.tax === 'taxed' ? t('taxed_only') : t('untaxed_only')}`} onPress={() => s.setTax(s.tax === 'all' ? 'taxed' : s.tax === 'taxed' ? 'untaxed' : 'all')} tone={theme.sage} />
          {kind === 'expenses' && (
            <Chip
              label={s.paid === 'all' ? t('all') : s.paid === 'paid' ? t('paid_only') : t('unpaid_only')}
              onPress={() => s.setPaid(s.paid === 'all' ? 'paid' : s.paid === 'paid' ? 'unpaid' : 'all')}
              tone={theme.sage}
            />
          )}
          <Chip
            label={s.showArchived === 'all' ? t('all') : s.showArchived === 'active' ? t('active') : t('archived')}
            onPress={() => s.setShowArchived(s.showArchived === 'all' ? 'active' : s.showArchived === 'active' ? 'archived' : 'all')}
            tone={theme.sage}
          />
        </View>
        <AppSelect label={t('form_farm')} placeholder={t('all_farms')} value={s.farmId || null} options={s.farmOpts} onChange={(id) => s.setFarmId(id == null ? '' : String(id))} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppSelect
              label={t('form_category')}
              placeholder={t('form_all_cats')}
              value={s.filterCatId || null}
              options={s.catOpts}
              onChange={(id) => s.setFilterCatId(id == null ? '' : String(id))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppSelect
              label={kind === 'expenses' ? t('filter_vendor') : t('filter_customer')}
              placeholder={kind === 'expenses' ? t('form_all_vendors') : t('form_all_customers')}
              value={s.filterContactId || null}
              options={s.contactOpts}
              onChange={(id) => s.setFilterContactId(id == null ? '' : String(id))}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><AppInput label={t('ph_from')} placeholder={t('ph_from')} value={s.start} onChangeText={s.setStart} /></View>
          <View style={{ flex: 1 }}><AppInput label={t('ph_to')} placeholder={t('ph_to')} value={s.end} onChangeText={s.setEnd} /></View>
        </View>
        <AppButton title={t('apply')} variant="secondary" icon="filter" onPress={s.refresh} />
      </FilterDropdown>
    </View>
  );
}

function TxnForm({ s, kind, allocations, setAllocations, splitBasis, setSplitBasis, splitTreeTypeId, setSplitTreeTypeId, treeTypeOpts }: {
  s: ReturnType<typeof useTxn>; kind: 'expenses' | 'incomes';
  allocations: AllocationDraft[]; setAllocations: (v: AllocationDraft[]) => void;
  splitBasis?: string; setSplitBasis?: (v: 'trees' | 'tree_type' | 'area' | 'equal') => void;
  splitTreeTypeId?: string; setSplitTreeTypeId?: (v: string) => void;
  treeTypeOpts?: SelectOption[];
}) {
  const theme = useColors();
  useLang();
  return (
    <View>
      <AppInput label={t('form_title')} value={s.title} onChangeText={s.setTitle} icon="create-outline" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><AppInput label={t('form_amount')} value={s.amount} onChangeText={s.setAmount} keyboardType="decimal-pad" icon="cash-outline" /></View>
        <View style={{ flex: 1 }}><AppInput label={t('form_date')} value={s.date} onChangeText={s.setDate} icon="calendar-outline" /></View>
      </View>
      {kind === 'expenses' && (
        <AppSelect label={t('form_farm')} placeholder={t('farm_split_placeholder')} value={s.farmId || null} options={s.farmOpts} onChange={(id) => s.setFarmId(id == null ? '' : String(id))} />
      )}
      {kind === 'expenses' && !s.farmId && setSplitBasis && (
        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 8, marginBottom: 8, backgroundColor: theme.surface }}>
          <Text style={{ fontWeight: '800', marginBottom: 4, color: theme.ink }}>
            {t('split_basis_label')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {([
              ['trees', t('split_trees')],
              ['tree_type', t('split_tree_type')],
              ['area', t('split_area')],
              ['equal', t('split_equal')],
            ] as const).map(([v, label]) => (
              <Pressable key={v} onPress={() => setSplitBasis(v)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: splitBasis === v ? theme.pine : theme.sage }}>
                <Text style={{ color: splitBasis === v ? '#fff' : theme.ink, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {splitBasis === 'tree_type' && (
            <AppSelect
              label={t('split_tree_label')}
              placeholder={t('form_select_one')}
              value={splitTreeTypeId || null}
              options={treeTypeOpts ?? []}
              onChange={(id) => setSplitTreeTypeId && setSplitTreeTypeId(id == null ? '' : String(id))}
              allowClear={false}
            />
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppSelect label={t('form_category')} placeholder={t('form_select_category')} value={s.categoryId || null} options={s.catOpts} onChange={(id) => s.setCategoryId(id == null ? '' : String(id))} allowClear={false} />
        </View>
        <View style={{ flex: 1 }}>
          <AppSelect
            label={kind === 'expenses' ? t('form_vendor_opt') : t('form_customer_opt')}
            placeholder={t('form_none')}
            value={s.contactId || null}
            options={s.contactOpts}
            onChange={(id) => s.setContactId(id == null ? '' : String(id))}
          />
        </View>
      </View>
      <AppInput label={t('form_description')} placeholder={t('form_optional')} value={s.description} onChangeText={s.setDescription} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Chip label={s.doc === '' || s.doc === 'receipt' ? t('form_receipt') : t('form_invoice')} onPress={() => s.setDoc(s.doc === 'invoice' ? 'receipt' : 'invoice')} tone={theme.sage} />
        <Chip label={s.includeTax ? t('form_tax_yes') : t('form_tax_no')} onPress={() => s.setIncludeTax(!s.includeTax)} tone={theme.sage} />
        {kind === 'expenses' && (
          <Chip label={s.isPaid ? `${t('paid')} ✓` : t('unpaid')} onPress={() => s.setIsPaid(!s.isPaid)} tone={s.isPaid ? theme.sage : theme.danger} />
        )}
        <Chip label={s.isArchived ? `${t('archived')} ✓` : t('archived')} onPress={() => s.setIsArchived(!s.isArchived)} tone={theme.sage} />
      </View>
      {kind === 'incomes' && (
        <View>
          <Text style={{ fontWeight: '800', marginTop: 8, color: theme.ink }}>{t('form_farm_alloc')}</Text>
          <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 4 }}>{t('form_farm_alloc_hint')}</Text>
          {allocations.map((allocation, index) => (
            <View key={index} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 8, marginVertical: 6, backgroundColor: theme.surface }}>
              <AppSelect
                label={t('form_farm')}
                placeholder={t('form_select_farm')}
                value={allocation.farm_id || null}
                options={s.farmOpts}
                onChange={(id) => setAllocations(allocations.map((row, i) => i === index ? { ...row, farm_id: id == null ? '' : String(id) } : row))}
                allowClear={false}
              />
              <AppInput placeholder={t('form_allocated_amount')} value={allocation.amount} onChangeText={(value) => setAllocations(allocations.map((row, i) => i === index ? { ...row, amount: value } : row))} keyboardType="decimal-pad" />
              <AppButton title={t('del')} variant="ghost" onPress={() => setAllocations(allocations.filter((_, i) => i !== index))} />
            </View>
          ))}
          <AppButton title={t('btn_add_allocation')} variant="secondary" icon="add" onPress={() => setAllocations([...allocations, { farm_id: '', amount: '' }])} />
        </View>
      )}
    </View>
  );
}

function TxnRow({ r, kind, onEdit, onArchive, onDelete }: { r: any; kind: 'expenses' | 'incomes'; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const isOut = kind === 'expenses';
  const theme = useColors();
  useLang();
  return (
    <RowCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isOut ? theme.dangerSoft : theme.successSoft }}>
          <Ionicons name={isOut ? 'arrow-up' : 'arrow-down'} size={17} color={isOut ? theme.danger : theme.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.ink }}>{r.title}</Text>
          <Text style={{ fontSize: 12.5, color: theme.muted }}>
            {kind === 'expenses' ? (r.farm_title ?? t('all_farms_split')) : r.farm_summary || t('unallocated')} · {r.date}
          </Text>
          <Text style={{ fontSize: 12, color: theme.muted }}>{r.category_name}{r.contact_name ? ` · ${r.contact_name}` : ''}</Text>
        </View>
        <Text style={{ fontWeight: '800', color: isOut ? theme.danger : theme.success }}>{isOut ? '−' : '+'}{fmt(r.amount)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
        {r.is_archived ? <Badge label={t('archived')} tone="neutral" /> : null}
        {kind === 'expenses' && !r.is_paid ? <Badge label={t('unpaid')} tone="amber" /> : null}
        {kind === 'expenses' && r.farm_id == null ? <Badge label={t('shared')} tone="blue" /> : null}
        {r.document_type ? <Badge label={r.document_type === 'invoice' ? t('invoice') : t('receipt')} tone="blue" /> : null}
        {(r.unallocated_amount ?? 0) > 0.000001 && <Badge label={`${t('unalloc_short')} ${fmt(r.unallocated_amount)}`} tone="amber" />}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1 }}><AppButton title={t('edit')} variant="secondary" onPress={onEdit} /></View>
        <View style={{ flex: 1 }}><AppButton title={r.is_archived ? t('btn_unarchive') : t('btn_archive')} variant="ghost" onPress={onArchive} /></View>
        <View style={{ flex: 1 }}><AppButton title={t('del')} variant="ghost" onPress={onDelete} /></View>
      </View>
    </RowCard>
  );
}

export function ExpensesScreen() {
  const s = useTxn('expenses');
  const total = s.rows.reduce((a, r) => a + Number(r.amount), 0);
  const unpaid = s.rows.reduce((a, r) => (r.is_paid ? a : a + Number(r.amount)), 0);
  const theme = useColors();
  useLang();
  const [splitBasis, setSplitBasis] = useState<'trees' | 'tree_type' | 'area' | 'equal'>('trees');
  const [splitTreeTypeId, setSplitTreeTypeId] = useState('');
  const [treeTypeOpts, setTreeTypeOpts] = useState<SelectOption[]>([]);

  useFocusEffect(useCallback(() => {
    listLookups('tree_types').then((rows) => setTreeTypeOpts(rows.map((x) => ({ id: x.id, label: x.name })))).catch(() => {});
  }, []));

  const resetForm = () => {
    s.setTitle(''); s.setAmount(''); s.setDescription(''); s.setContactId('');
    s.setCategoryId(''); s.setDate(todayISODate()); s.setIncludeTax(false); s.setIsPaid(true);
    s.setIsArchived(false); s.setEditingId(null); s.setFarmId('');
    setSplitBasis('trees'); setSplitTreeTypeId('');
  };

  const submit = async () => {
    try {
      if (!s.categoryId) throw new Error(t('msg_pick_cat'));
      if (!s.farmId && splitBasis === 'tree_type' && !splitTreeTypeId) throw new Error(t('msg_pick_split'));
      const payload = {
        farm_id: s.farmId ? Number(s.farmId) : null, category_id: Number(s.categoryId), contact_id: s.contactId ? Number(s.contactId) : null,
        title: s.title, description: s.description, amount: Number(s.amount), date: s.date,
        document_type: (s.doc || 'receipt') as 'invoice' | 'receipt',
        include_in_tax: s.includeTax, is_paid: s.isPaid, is_archived: s.isArchived,
        split_basis: splitBasis, split_tree_type_id: splitTreeTypeId ? Number(splitTreeTypeId) : null,
      };
      if (s.editingId) await updateExpense(s.editingId, payload);
      else await createExpense(payload);
      resetForm();
      s.refresh();
    } catch (e: any) {
      Alert.alert(t('msg_invalid'), e.message);
    }
  };

  const startEdit = (r: any) => {
    s.setEditingId(r.id);
    s.setTitle(r.title); s.setAmount(String(r.amount)); s.setDate(r.date);
    s.setFarmId(r.farm_id == null ? '' : String(r.farm_id)); s.setCategoryId(String(r.category_id));
    s.setContactId(r.vendor_id ? String(r.vendor_id) : '');
    s.setDescription(r.description ?? ''); s.setDoc(r.document_type);
    s.setIncludeTax(!!r.include_in_tax); s.setIsPaid(!!r.is_paid); s.setIsArchived(!!r.is_archived);
    setSplitBasis(r.split_basis ?? 'trees'); setSplitTreeTypeId(r.split_tree_type_id ? String(r.split_tree_type_id) : '');
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('expenses')} subtitle={t('sub_expenses')}>
        <FilterCard s={s} kind="expenses" />
        <SectionTitle
          title={`${t('total')} ${fmt(total)}`}
          action={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unpaid > 0 ? <Badge label={`${t('unpaid')} ${fmt(unpaid)}`} tone="amber" /> : null}
              <AppButton title={t('btn_export')} variant="ghost" onPress={() => exportAndShare('expenses', s.rows).catch((e: Error) => Alert.alert(t('msg_export_failed'), e.message))} />
            </View>
          }
        />
        {s.rows.length === 0 && <EmptyState icon="trending-down-outline" title={t('empty_no_expenses')} hint={t('empty_no_expenses_hint')} />}
        {s.rows.map((r) => (
          <TxnRow
            key={r.id} r={r} kind="expenses"
            onEdit={() => startEdit(r)}
            onArchive={() => setExpenseArchived(r.id, !r.is_archived).then(s.refresh).catch((e: Error) => Alert.alert(t('msg_error'), e.message))}
            onDelete={() => deleteExpense(r.id).then(s.refresh).catch((e: Error) => Alert.alert(t('msg_blocked'), e.message))}
          />
        ))}
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>{s.editingId ? t('btn_edit_expense') : t('btn_add_expense_form')}</Text>
          <TxnForm s={s} kind="expenses" allocations={[]} setAllocations={() => {}} splitBasis={splitBasis} setSplitBasis={setSplitBasis} splitTreeTypeId={splitTreeTypeId} setSplitTreeTypeId={setSplitTreeTypeId} treeTypeOpts={treeTypeOpts} />
          <AppButton title={s.editingId ? t('save') : t('create')} icon="checkmark-circle" onPress={submit} />
          {s.editingId ? <View style={{ height: 8 }} /> : null}
          {s.editingId ? <AppButton title={t('cancel')} variant="ghost" onPress={resetForm} /> : null}
        </Card>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}

export function IncomesScreen() {
  const s = useTxn('incomes');
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [autoBasis, setAutoBasis] = useState<'trees' | 'tree_type' | 'area' | 'equal'>('trees');
  const [autoTreeTypeId, setAutoTreeTypeId] = useState('');
  const [treeTypeOpts, setTreeTypeOpts] = useState<SelectOption[]>([]);
  const total = s.rows.reduce((a, r) => a + Number(r.amount), 0);
  const theme = useColors();
  useLang();

  useFocusEffect(useCallback(() => {
    listLookups('tree_types').then((rows) => setTreeTypeOpts(rows.map((x) => ({ id: x.id, label: x.name })))).catch(() => {});
  }, []));

  const autoSplit = async () => {
    try {
      const shares = await computeAutoSplit(autoBasis, autoTreeTypeId ? Number(autoTreeTypeId) : null, Number(s.amount));
      setAllocations(shares.map((x) => ({ farm_id: String(x.farm_id), amount: String(x.amount) })));
    } catch (e: any) {
      Alert.alert(t('msg_invalid'), e.message);
    }
  };

  const resetForm = () => {
    s.setTitle(''); s.setAmount(''); s.setDescription(''); s.setContactId('');
    s.setCategoryId(''); s.setDate(todayISODate()); s.setIncludeTax(true); s.setIsArchived(false); s.setEditingId(null);
    setAllocations([]); setAutoBasis('trees'); setAutoTreeTypeId('');
  };

  const submit = async () => {
    try {
      if (!s.categoryId) throw new Error(t('msg_pick_cat'));
      const payload = {
        category_id: Number(s.categoryId), contact_id: s.contactId ? Number(s.contactId) : null,
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
      Alert.alert(t('msg_invalid'), e.message);
    }
  };

  const startEdit = async (r: any) => {
    s.setEditingId(r.id);
    s.setTitle(r.title); s.setAmount(String(r.amount)); s.setDate(r.date);
    s.setCategoryId(String(r.category_id)); s.setContactId(r.customer_id ? String(r.customer_id) : '');
    s.setDescription(r.description ?? ''); s.setDoc(r.document_type);
    s.setIncludeTax(!!r.include_in_tax); s.setIsArchived(!!r.is_archived);
    try {
      const rows = await listIncomeAllocations(r.id);
      setAllocations(rows.map((a) => ({ farm_id: String(a.farm_id), amount: String(a.amount) })));
    } catch {
      setAllocations([]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={t('incomes')} subtitle={t('sub_incomes')}>
        <FilterCard s={s} kind="incomes" />
        <SectionTitle title={`${t('total')} ${fmt(total)}`} action={<AppButton title={t('btn_export')} variant="ghost" onPress={() => exportAndShare('incomes', s.rows).catch((e: Error) => Alert.alert(t('msg_export_failed'), e.message))} />} />
        {s.rows.length === 0 && <EmptyState icon="trending-up-outline" title={t('empty_no_income')} hint={t('empty_no_income_hint')} />}
        {s.rows.map((r) => (
          <TxnRow
            key={r.id} r={r} kind="incomes"
            onEdit={() => startEdit(r)}
            onArchive={() => setIncomeArchived(r.id, !r.is_archived).then(s.refresh).catch((e: Error) => Alert.alert(t('msg_error'), e.message))}
            onDelete={() => deleteIncome(r.id).then(s.refresh).catch((e: Error) => Alert.alert(t('msg_error'), e.message))}
          />
        ))}
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 8 }}>{s.editingId ? t('btn_edit_income') : t('btn_add_income')}</Text>
          <TxnForm s={s} kind="incomes" allocations={allocations} setAllocations={setAllocations} />
          <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 8, marginBottom: 8, backgroundColor: theme.surface }}>
            <Text style={{ fontWeight: '800', marginBottom: 4, color: theme.ink }}>
              {t('alloc_auto')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {([
                ['trees', t('split_trees')],
                ['tree_type', t('split_tree_type')],
                ['area', t('split_area')],
                ['equal', t('split_equal')],
              ] as const).map(([v, label]) => (
                <Pressable key={v} onPress={() => setAutoBasis(v)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: autoBasis === v ? theme.pine : theme.sage }}>
                  <Text style={{ color: autoBasis === v ? '#fff' : theme.ink, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {autoBasis === 'tree_type' && (
              <AppSelect
                label={t('split_tree_label')}
                placeholder={t('form_select_one')}
                value={autoTreeTypeId || null}
                options={treeTypeOpts}
                onChange={(id) => setAutoTreeTypeId(id == null ? '' : String(id))}
                allowClear={false}
              />
            )}
            <AppButton title={t('btn_fill_allocations')} variant="secondary" icon="calculator" onPress={autoSplit} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
            <Text style={{ fontWeight: '700', color: theme.ink }}>{t('form_tax')}</Text>
            <Switch value={s.includeTax} onValueChange={s.setIncludeTax} trackColor={{ true: theme.pine }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '700', color: theme.ink }}>{t('archived')}</Text>
            <Switch value={s.isArchived} onValueChange={s.setIsArchived} trackColor={{ true: theme.pine }} />
          </View>
          <AppButton title={s.editingId ? t('save') : t('create')} icon="checkmark-circle" onPress={submit} />
          {s.editingId ? <View style={{ height: 8 }} /> : null}
          {s.editingId ? <AppButton title={t('cancel')} variant="ghost" onPress={resetForm} /> : null}
        </Card>
      </Screen>
      <FloatingTabBar />
    </View>
  );
}
