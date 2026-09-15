import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db/client';
import { SINGLE_PROFILE_ID } from '../db/types';
import { buildBackup, describePayload, destroyWorkspace, restoreBackup, workspaceCounts } from '../db/backup';
import { Screen } from './Screen';
import { getLang, setLang, t } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, SectionTitle } from '../components/ui';
import { theme } from '../components/theme';

export function SettingsScreen() {
  const [name, setName] = useState('');
  const [lang, setLangState] = useState(getLang());
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [pending, setPending] = useState<any | null>(null);
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
    setPreview(describePayload(payload));
  };

  const confirmRestore = async () => {
    if (!pending) {
      Alert.alert('No backup', 'Build or load a backup first.');
      return;
    }
    try {
      const result = await restoreBackup(pending, mode);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      Alert.alert('Restore complete', `${total} records imported (${mode}).`);
      setPending(null);
      setPreview(null);
      refresh();
    } catch (e: any) {
      Alert.alert('Restore failed', e.message);
    }
  };

  const confirmDestroy = async () => {
    if (!confirmName.trim()) {
      Alert.alert('Confirm', 'Type workspace display name (or "DELETE") to confirm.');
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
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionTitle title="Backup" action={<Badge label={mode} tone="blue" />} />
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>Current rows: {counts ? JSON.stringify(counts) : '…'}</Text>
        <AppButton title="Download backup (JSON)" icon="cloud-download-outline" variant="secondary" onPress={downloadBackup} />
        <View style={{ height: 8 }} />
        <AppButton title="Preview current data" icon="eye-outline" variant="secondary" onPress={importDemoBackup} />
        {preview ? <Text style={{ marginTop: 8, color: theme.inkSoft, fontSize: 12.5 }}>Preview: {JSON.stringify(preview)}</Text> : null}
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
        <AppInput value={confirmName} onChangeText={setConfirmName} placeholder="Type to confirm deletion" icon="warning-outline" />
        <AppButton title="Delete all workspace data" variant="danger" icon="trash-outline" onPress={confirmDestroy} />
      </Card>
    </Screen>
  );
}
