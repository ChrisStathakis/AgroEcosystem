import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db/client';
import { SINGLE_PROFILE_ID } from '../db/types';
import { buildBackup, describePayload, destroyWorkspace, restoreBackup, workspaceCounts } from '../db/backup';
import { downloadBackup as dbxDownloadApi, listBackups as dbxListApi, uploadBackup as dbxUploadApi, type DropboxFile } from '../lib/dropbox';
import { DROPBOX_APP_KEY, DROPBOX_APP_SECRET } from '../lib/dropboxConfig';
import { effectiveAppKey, effectiveAppSecret, loadDropboxSettings, saveDropboxSettings } from '../lib/dropboxStore';
import { createHomePeriod, deleteHomePeriod, listHomePeriods, updateHomePeriod } from '../db/repositories/homePeriods';
import { MAX_HOME_PERIODS, type HomePeriod } from '../db/types';
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
  // Dropbox manual sync state (user presses upload/download).
  const [dbxKey, setDbxKey] = useState('');
  const [dbxSecret, setDbxSecret] = useState('');
  const [dbxRefresh, setDbxRefresh] = useState('');
  const [dbxAccount, setDbxAccount] = useState('');
  const [dbxLastSync, setDbxLastSync] = useState('');
  const [dbxFiles, setDbxFiles] = useState<DropboxFile[]>([]);
  const [dbxPath, setDbxPath] = useState('');
  const [dbxBusy, setDbxBusy] = useState(false);
  // Home-page periods CRUD (max 6).
  const [periods, setPeriods] = useState<HomePeriod[]>([]);
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [periodName, setPeriodName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const theme = useColors();
  useLang();

  const refresh = useCallback(async () => {
    const row = await getDb().getFirstAsync<{ display_name: string }>('SELECT display_name FROM profiles WHERE id = ?', [SINGLE_PROFILE_ID]);
    setName(row?.display_name ?? '');
    setCounts(await workspaceCounts());
    setLangState(getLang());
    try {
      const s = await loadDropboxSettings();
      setDbxKey(s.appKey);
      setDbxSecret(s.appSecret);
      setDbxRefresh(s.refreshToken);
      setDbxAccount(s.account);
      setDbxLastSync(s.lastSync);
    } catch {
      // best-effort
    }
    try {
      setPeriods(await listHomePeriods());
    } catch {
      setPeriods([]);
    }
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

  const persistDbx = async (patch: { appKey?: string; appSecret?: string; refreshToken?: string; account?: string; lastSync?: string } = {}) => {
    const next = {
      appKey: patch.appKey ?? dbxKey,
      appSecret: patch.appSecret ?? dbxSecret,
      refreshToken: patch.refreshToken ?? dbxRefresh,
      account: patch.account ?? dbxAccount,
      lastSync: patch.lastSync ?? dbxLastSync,
    };
    await saveDropboxSettings(next);
  };

  const saveDbxSettings = async () => {
    try {
      await persistDbx({});
      Alert.alert(t('msg_saved'), t('msg_dbx_saved'));
    } catch (e: any) {
      Alert.alert(t('msg_error'), e?.message ?? String(e));
    }
  };

  const dbxCreds = () => {
    const s = { appKey: dbxKey, appSecret: dbxSecret, refreshToken: dbxRefresh, account: '', lastSync: '' };
    return { appKey: effectiveAppKey(s), appSecret: effectiveAppSecret(s), refreshToken: dbxRefresh };
  };

  const handleDbxUpload = async () => {
    setDbxBusy(true);
    try {
      await persistDbx({});
      const c = dbxCreds();
      const payload = await buildBackup();
      const path = await dbxUploadApi({ ...c, payload });
      const stamp = new Date().toISOString();
      setDbxLastSync(stamp);
      await persistDbx({ lastSync: stamp });
      Alert.alert(t('msg_backup_ready'), `${t('msg_dbx_uploaded')} (${path})`);
    } catch (e: any) {
      Alert.alert(t('msg_dbx_failed'), e?.message ?? String(e));
    } finally {
      setDbxBusy(false);
    }
  };

  const handleDbxList = async () => {
    setDbxBusy(true);
    try {
      const c = dbxCreds();
      const files = await dbxListApi(c);
      setDbxFiles(files);
      if (files.length === 0) Alert.alert(t('msg_no_backup'), t('msg_dbx_no_files'));
      else if (!dbxPath && files[0]) setDbxPath(files[0].path);
    } catch (e: any) {
      Alert.alert(t('msg_dbx_failed'), e?.message ?? String(e));
    } finally {
      setDbxBusy(false);
    }
  };

  const resetPeriodForm = () => {
    setEditingPeriodId(null);
    setPeriodName('');
    setPeriodStart('');
    setPeriodEnd('');
  };

  const savePeriod = async () => {
    try {
      const sm = Number(periodStart);
      const em = Number(periodEnd);
      if (editingPeriodId == null) {
        if (periods.length >= MAX_HOME_PERIODS) {
          Alert.alert(t('msg_invalid'), t('msg_periods_full'));
          return;
        }
        await createHomePeriod(periodName, sm, em);
      } else {
        await updateHomePeriod(editingPeriodId, periodName, sm, em);
      }
      resetPeriodForm();
      setPeriods(await listHomePeriods());
      Alert.alert(t('msg_saved'), t('msg_period_saved'));
    } catch (e: any) {
      Alert.alert(t('msg_period_failed'), e?.message ?? String(e));
    }
  };

  const removePeriod = async (id: number) => {
    try {
      await deleteHomePeriod(id);
      if (editingPeriodId === id) resetPeriodForm();
      setPeriods(await listHomePeriods());
      Alert.alert(t('msg_deleted'), t('msg_period_deleted'));
    } catch (e: any) {
      Alert.alert(t('msg_period_failed'), e?.message ?? String(e));
    }
  };

  const handleDbxDownload = async (path?: string) => {
    const target = (path ?? dbxPath).trim();
    if (!target) {
      Alert.alert(t('msg_no_backup'), t('msg_pick_backup_first'));
      return;
    }
    setDbxBusy(true);
    try {
      const c = dbxCreds();
      const payload = await dbxDownloadApi({ ...c, path: target });
      const desc = describePayload(payload);
      setPending(payload);
      setPendingName(target);
      setPreview(desc);
      Alert.alert(t('msg_backup_loaded'), t('msg_dbx_downloaded'));
    } catch (e: any) {
      Alert.alert(t('msg_dbx_failed'), e?.message ?? String(e));
    } finally {
      setDbxBusy(false);
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

      <Card style={{ marginTop: 12 }}>
        <SectionTitle title={t('set_dropbox')} />
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>{t('set_dropbox_hint')}</Text>
        {(dbxAccount || dbxLastSync) ? (
          <Text style={{ color: theme.inkSoft, fontSize: 12.5, marginBottom: 8 }}>
            {dbxAccount ? `${dbxAccount} · ` : ''}{dbxLastSync ? dbxLastSync.slice(0, 16).replace('T', ' ') : ''}
          </Text>
        ) : null}
        <AppInput value={dbxKey} onChangeText={setDbxKey} placeholder={DROPBOX_APP_KEY} icon="key-outline" />
        <AppInput value={dbxSecret} onChangeText={setDbxSecret} placeholder={DROPBOX_APP_SECRET} icon="lock-closed-outline" secureTextEntry />
        <AppInput value={dbxRefresh} onChangeText={setDbxRefresh} placeholder={t('dbx_refresh')} icon="refresh-circle-outline" secureTextEntry autoCapitalize="none" />
        <AppButton title={t('btn_dbx_save')} icon="checkmark-circle-outline" variant="secondary" onPress={saveDbxSettings} />
        <View style={{ height: 8 }} />
        <AppButton title={t('btn_dbx_upload')} icon="cloud-upload-outline" variant="secondary" onPress={handleDbxUpload} disabled={dbxBusy} loading={dbxBusy} />
        <View style={{ height: 8 }} />
        <AppButton title={t('btn_dbx_list')} icon="list-outline" variant="secondary" onPress={handleDbxList} disabled={dbxBusy} />
        {dbxFiles.length > 0 ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            {dbxFiles.slice(0, 5).map((f) => (
              <View key={f.path}>
                <AppButton
                  title={`${f.name}`}
                  icon="cloud-download-outline"
                  variant={dbxPath === f.path ? 'primary' : 'secondary'}
                  onPress={() => { setDbxPath(f.path); handleDbxDownload(f.path); }}
                />
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ height: 8 }} />
        <AppInput value={dbxPath} onChangeText={setDbxPath} placeholder={t('ph_dbx_file')} icon="document-outline" autoCapitalize="none" />
        <AppButton title={t('btn_dbx_download')} icon="cloud-download-outline" onPress={() => handleDbxDownload()} disabled={dbxBusy} />
        <View style={{ height: 8 }} />
        <AppButton
          title={t('btn_dbx_disconnect')}
          icon="log-out-outline"
          variant="secondary"
          onPress={async () => {
            setDbxRefresh('');
            setDbxAccount('');
            await persistDbx({ refreshToken: '', account: '' });
          }}
        />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionTitle title={t('set_periods')} action={<Badge label={`${periods.length}/${MAX_HOME_PERIODS}`} tone="blue" />} />
        <Text style={{ color: theme.muted, fontSize: 12.5, marginBottom: 8 }}>{t('set_periods_hint')}</Text>
        {periods.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text style={{ flex: 1, color: theme.ink, fontWeight: '700', fontSize: 14 }}>
              {p.name} · {p.start_month}–{p.end_month}
            </Text>
            <View style={{ width: 110 }}>
              <AppButton
                title={t('btn_period_edit')}
                variant="secondary"
                onPress={() => {
                  setEditingPeriodId(p.id);
                  setPeriodName(p.name);
                  setPeriodStart(String(p.start_month));
                  setPeriodEnd(String(p.end_month));
                }}
              />
            </View>
            <View style={{ width: 110 }}>
              <AppButton title={t('btn_period_delete')} variant="secondary" icon="trash-outline" onPress={() => removePeriod(p.id)} />
            </View>
          </View>
        ))}
        <AppInput value={periodName} onChangeText={setPeriodName} placeholder={t('period_name')} icon="calendar-outline" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppInput value={periodStart} onChangeText={setPeriodStart} placeholder={t('period_start_month')} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <AppInput value={periodEnd} onChangeText={setPeriodEnd} placeholder={t('period_end_month')} keyboardType="number-pad" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton
              title={editingPeriodId == null ? t('btn_period_add') : t('btn_period_save')}
              icon="checkmark-circle"
              onPress={savePeriod}
              disabled={editingPeriodId == null && periods.length >= MAX_HOME_PERIODS}
            />
          </View>
          {editingPeriodId != null ? (
            <View style={{ flex: 1 }}>
              <AppButton title={t('cancel')} variant="secondary" onPress={resetPeriodForm} />
            </View>
          ) : null}
        </View>
      </Card>

      <Card style={{ marginTop: 12, backgroundColor: theme.dangerSoft, borderColor: theme.danger }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: theme.danger }}>{t('set_danger')}</Text>
        <AppInput value={confirmName} onChangeText={setConfirmName} placeholder={t('ph_confirm_delete')} icon="warning-outline" />
        <AppButton title={t('btn_delete_all')} variant="danger" icon="trash-outline" onPress={confirmDestroy} />
      </Card>
    </Screen>
  );
}
