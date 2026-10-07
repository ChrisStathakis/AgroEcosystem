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
import { getLang, setLang, t, useLang } from '../lib/i18n';
import { AppButton, AppInput, Badge, Card, SectionTitle, SegmentedTabs } from '../components/ui';
import { getThemePreference, setThemePreference, useColors, type ThemePreference } from '../components/theme';

export function SettingsScreen() {
  const [name, setName] = useState('');
  const [lang, setLangState] = useState(getLang());
  const [themePref, setThemePref] = useState<ThemePreference>(getThemePreference());
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [pending, setPending] = useState<any | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [confirmName, setConfirmName] = useState('');
  const theme = useColors();
  useLang();

  const refresh = useCallback(async () => {
    const row = await getDb().getFirstAsync<{ display_name: string }>('SELECT display_name FROM profiles WHERE id = ?', [SINGLE_PROFILE_ID]);
    setName(row?.display_name ?? '');
    setCounts(await workspaceCounts());
    setLangState(getLang());
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const downloadBackup = async () => {
    try {
      const payload = await buildBackup();
      const file = new File(Paths.cache, `agro-backup-${new Date().toISOString().slice(0, 10)}.json`);
      file.write(JSON.stringify(payload, null, 2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      Alert.alert(t('msg_backup_ready'), file.uri);
    } catch (e: any) {
      Alert.alert(t('msg_backup_failed'), e.message);
    }
  };

  const previewCurrentData = async () => {
    const payload = await buildBackup();
    setPending(payload);
    setPendingName('current workspace data');
    setPreview(describePayload(payload));
  };

  const pickBackupFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const uri = asset.uri;
      let text: string;
      try {
        const file = new File(uri);
        text = await file.text();
      } catch {
        const res = await fetch(uri);
        text = await res.text();
      }
      if (text.length > 5 * 1024 * 1024) throw new Error(t('msg_file_too_large'));
      const payload = JSON.parse(text);
      const desc = describePayload(payload);
      setPending(payload);
      setPendingName(asset.name ?? 'backup.json');
      setPreview(desc);
      Alert.alert(t('msg_backup_loaded'), `${asset.name ?? 'backup.json'}: ${Object.values(desc).reduce((a, b) => a + b, 0)} ${t('msg_records_found')}`);
    } catch (e: any) {
      Alert.alert(t('msg_import_failed'), e.message ?? String(e));
    }
  };

  const confirmRestore = async () => {
    if (!pending) {
      Alert.alert(t('msg_no_backup'), t('msg_pick_backup_first'));
      return;
    }
    try {
      const result = await restoreBackup(pending, mode);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      Alert.alert(t('msg_restore_complete'), `${total} ${t('msg_records_found')}`);
      setPending(null);
      setPreview(null);
      setPendingName('');
      refresh();
    } catch (e: any) {
      Alert.alert(t('msg_restore_failed'), e.message);
    }
  };

  const confirmDestroy = async () => {
    if (!confirmName.trim()) {
      Alert.alert(t('msg_confirm'), t('msg_type_to_confirm'));
      return;
    }
    try {
      await destroyWorkspace();
      Alert.alert(t('msg_deleted'), t('msg_workspace_deleted'));
      setConfirmName('');
      refresh();
    } catch (e: any) {
      Alert.alert(t('msg_error'), e.message);
    }
  };

  return (
    <Screen title={t('settings')} subtitle={t('sub_workspace')}>
      <Card>
        <SectionTitle title={t('set_profile')} />
        <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 8 }}>{t('set_profile_hint')}</Text>
        <AppInput value={name} onChangeText={setName} placeholder={t('ph_farm_name')} icon="person-outline" />
        <AppButton
          title={t('save')}
          icon="checkmark-circle"
          onPress={async () => {
            try {
              await getDb().runAsync("UPDATE profiles SET display_name = ?, updated_at = datetime('now') WHERE id = ?", [name.trim(), SINGLE_PROFILE_ID]);
              Alert.alert(t('msg_saved'), t('msg_workspace_saved'));
            } catch (e: any) {
              Alert.alert(t('msg_error'), e.message);
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
        <SectionTitle title={t('appearance')} />
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>{t('appearance_hint')}</Text>
        <SegmentedTabs<ThemePreference>
          value={themePref}
          onChange={(p) => {
            setThemePreference(p);
            setThemePref(p);
          }}
          options={[
            { id: 'light', label: t('theme_light') },
            { id: 'dark', label: t('theme_dark') },
            { id: 'system', label: t('theme_system') },
          ]}
        />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionTitle title={t('set_backup')} action={<Badge label={mode === 'replace' ? t('mode_replace') : t('mode_merge')} tone="blue" />} />
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>{t('set_current_rows')}{counts ? JSON.stringify(counts) : '…'}</Text>
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>{t('set_backup_hint')}</Text>
        <AppButton title={t('btn_download_backup')} icon="cloud-download-outline" variant="secondary" onPress={downloadBackup} />
        <View style={{ height: 8 }} />
        <AppButton title={t('btn_pick_backup')} icon="folder-open-outline" variant="secondary" onPress={pickBackupFile} />
        <View style={{ height: 8 }} />
        <AppButton title={t('btn_preview_data')} icon="eye-outline" variant="secondary" onPress={previewCurrentData} />
        {preview ? <Text style={{ marginTop: 8, color: theme.inkSoft, fontSize: 12.5 }}>{t('set_pending')}{pendingName || 'backup'} — {JSON.stringify(preview)}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <AppButton title={`${t('set_mode')}${mode === 'replace' ? t('mode_replace') : t('mode_merge')}`} variant="secondary" onPress={() => setMode(mode === 'replace' ? 'merge' : 'replace')} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title={t('btn_restore')} icon="refresh" onPress={confirmRestore} />
          </View>
        </View>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>{t('set_replace_hint')}</Text>
      </Card>

      <Card style={{ marginTop: 12, backgroundColor: theme.dangerSoft, borderColor: theme.danger }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: theme.danger }}>{t('set_danger')}</Text>
        <AppInput value={confirmName} onChangeText={setConfirmName} placeholder={t('ph_confirm_delete')} icon="warning-outline" />
        <AppButton title={t('btn_delete_all')} variant="danger" icon="trash-outline" onPress={confirmDestroy} />
      </Card>
    </Screen>
  );
}
