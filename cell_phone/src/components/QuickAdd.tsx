import React, { useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';
import { createFarm } from '../db/repositories/farms';
import { createLookup, type LookupTable } from '../db/repositories/lookups';
import { createContact } from '../db/repositories/contacts';
import { AppButton, AppInput, Card } from './ui';
import { t } from '../lib/i18n';
import { theme } from './theme';

export type QuickAddKind =
  | { type: 'farm' }
  | { type: 'lookup'; table: LookupTable; label: string }
  | { type: 'contact'; kind: 'vendors' | 'customers'; label: string };

/**
 * Inline quick-add modal (mirrors server quick_create popup).
 * Creates the record and returns {id,label} so the caller can autofill its dropdown.
 */
export function QuickAdd({
  visible,
  kind,
  onClose,
  onCreated,
}: {
  visible: boolean;
  kind: QuickAddKind | null;
  onClose: () => void;
  onCreated: (id: number, label: string) => void;
}) {
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);

  if (!kind) return null;
  const title =
    kind.type === 'farm' ? 'Add farm' : kind.type === 'lookup' ? `Add ${kind.label}` : `Add ${kind.label}`;

  const reset = () => {
    setName('');
    setSize('');
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (kind.type === 'farm') {
        const id = await createFarm({ title: name, size: Number(size), active: true });
        onCreated(id, name.trim());
      } else if (kind.type === 'lookup') {
        const id = await createLookup(kind.table, name);
        onCreated(id, name.trim());
      } else {
        const id = await createContact(kind.kind, { name });
        onCreated(id, name.trim());
      }
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert('Cannot create', e.message);
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' }}>
        <Card style={{ margin: 12, padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 10 }}>{title}</Text>
          <AppInput
            label={kind.type === 'farm' ? 'Title' : 'Name'}
            placeholder={kind.type === 'farm' ? 'e.g. Olive grove' : 'Name'}
            value={name}
            onChangeText={setName}
          />
          {kind.type === 'farm' && (
            <AppInput label="Size (ha)" placeholder="2.5" value={size} onChangeText={setSize} keyboardType="decimal-pad" />
          )}
          <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10 }}>
            {kind.type === 'contact' ? 'Details like phone/email can be added later in Vendors/Customers.' : t('quick_add_hint')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppButton title="Cancel" variant="ghost" onPress={() => { reset(); onClose(); }} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title={busy ? '…' : 'Create'} icon="checkmark-circle" onPress={submit} />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}
