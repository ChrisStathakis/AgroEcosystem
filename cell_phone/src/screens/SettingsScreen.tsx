import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db/client';
import { SINGLE_PROFILE_ID } from '../db/types';
import { buildBackup, describePayload, destroyWorkspace, restoreBackup, workspaceCounts } from '../db/backup';
import { Screen } from './Screen';
import { getLang, setLang, t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, SectionTitle } from '../components/ui';
import { theme } from '../components/theme';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function SettingsScreen() {
  const [name, setName] = useState('');
  const [lang, setLangState] = useState(getLang());
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [pending, setPending] = useState<any | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [confirmName, setConfirmName] = useState('');

  const refresh = useCallback(async () => {
    const row = await getDb().getFirstAsync<{ display_name: string }>('SELECT display_name FROM profiles WHERE id = ?', [SINGLE_PROFILE_ID]);
    setName(row?.display_name ?? '');
    setCounts(await workspaceCounts());
    setLangState(getLang());
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const downloadBackup = async () => {
    const payload = await buildBackup();
    const file = new File(Paths.cache, `agro-backup-${new Date().toISOString().slice(0, 10)}.json`);
    file.write(JSON.stringify(payload, null, 2));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
    Alert.alert('Backup ready', file.uri);
  };

  const importDemoBackup = async () => {
    const payload = await buildBackup();
    setPending(payload);
    setPendingName('current workspace data');
    setPreview(describePayload(payload));
  };

  const pickBackupFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      if (asset.size != null && asset.size > MAX_BACKUP_BYTES) {
        Alert.alert('File too large', 'Backup files must be 5MB or smaller (same limit as the website).');
        return;
      }
      const file = new File(asset.uri);
      const text = await file.text();
      if (text.length > MAX_BACKUP_BYTES) {
        Alert.alert('File too large', 'Backup files must be 5MB or smaller (same limit as the website).');
        return;
      }
      const payload = JSON.parse(text);
      setPending(payload);
      setPendingName(asset.name ?? 'backup file');
      setPreview(describePayload(payload));
    } catch (e: any) {
      Alert.alert('Cannot read backup', e?.message ?? String(e));
    }
  };

  const confirmRestore = async () => {
    if (!pending) {
      Alert.alert('No backup', 'Pick a backup file or preview current data first.');
      return;
    }
    try {
      const result = await restoreBackup(pending, mode);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      Alert.alert('Restore complete', `${total} records imported (${mode}).`);
      setPending(null);
      setPendingName(null);
      setPreview(null);
      refresh();
    } catch (e: any) {
      Alert.alert('Restore failed', e.message);
    }
  };

  const expectedDestroyName = name.trim() ? name.trim() : 'DELETE';
  const confirmDestroy = async () => {
    // Mirrors server backup_destroy: require typing the exact workspace name (or DELETE when unnamed).
    if (confirmName.trim() !== expectedDestroyName) {
      Alert.alert('Confirm', `Type "${expectedDestroyName}" exactly to confirm deletion.`);
      return;
    }
    try {
      await destroyWorkspace();
      Alert.alert('Deleted', 'Workspace data has been deleted.');
      setConfirmName('');
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const renderCounts = (data: Record<string, number> | null) => {
    if (!data) return '…';
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  };

  return (
    <Screen title={t('settings')} subtitle="YOUR WORKSPACE">
      <Card>
        <SectionTitle title="Profile" />
        <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 8 }}>Display name for this offline workspace.</Text>
        <AppInput value={name} onChangeText={setName} placeholder="e.g. My farm" icon="person-outline" />
        <AppButton
          title="Save"
          icon="checkmark-circle"
          onPress={async () => {
            try {
              await getDb().runAsync("UPDATE profiles SET display_name = ?, updated_at = datetime('now') WHERE id = ?", [name.trim(), SINGLE_PROFILE_ID]);
              Alert.alert('Saved', 'Your workspace name has been updated.');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          }}
        />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionTitle title="Language / Γλώσσα" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton title="English" variant={lang === 'en' ? 'primary' : 'secondary'} onPress={() => { setLang('en'); setLangState('en'); }} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title="Ελληνικά" variant={lang === 'el' ? 'primary' : 'secondary'} onPress={() => { setLang('el'); setLangState('el'); }} />
          </View>
        </View>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>Your choice is saved on this device and restored on restart.</Text>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionTitle title="Backup" action={<Badge label={mode} tone="blue" />} />
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>Current rows:{'\n'}{renderCounts(counts)}</Text>
        <AppButton title="Download backup (JSON)" icon="cloud-download-outline" variant="secondary" onPress={downloadBackup} />
        <View style={{ height: 8 }} />
        <AppButton title="Pick backup file (.json)" icon="folder-open-outline" variant="secondary" onPress={pickBackupFile} />
        <View style={{ height: 8 }} />
        <AppButton title="Preview current data" icon="eye-outline" variant="secondary" onPress={importDemoBackup} />
        {preview ? <Text style={{ marginTop: 8, color: theme.inkSoft, fontSize: 12.5 }}>Preview{pendingName ? ` (${pendingName})` : ''}:{'\n'}{renderCounts(preview)}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <AppButton title={`Mode: ${mode}`} variant="secondary" onPress={() => setMode(mode === 'replace' ? 'merge' : 'replace')} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title="Restore" icon="refresh" onPress={confirmRestore} />
          </View>
        </View>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>Replace wipes workspace first; merge keeps existing rows.</Text>
      </Card>

      <Card style={{ marginTop: 12, backgroundColor: '#FFF5F3', borderColor: '#F0C9C0' }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: theme.danger }}>Danger zone</Text>
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>Type "{expectedDestroyName}" exactly to delete every row in this workspace. This cannot be undone.</Text>
        <AppInput value={confirmName} onChangeText={setConfirmName} placeholder={expectedDestroyName} icon="warning-outline" />
        <AppButton title="Delete all workspace data" variant="danger" icon="trash-outline" onPress={confirmDestroy} />
      </Card>
    </Screen>
  );
}
