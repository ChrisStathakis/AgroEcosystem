// Persisted Dropbox credentials (file-based, like i18n lang persistence).
// No extra dependency: uses expo-file-system lazily so node smoke tests don't crash.
import { DROPBOX_APP_KEY, DROPBOX_APP_SECRET } from './dropboxConfig';

export interface DropboxSettings {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  account: string;
  lastSync: string;
}

const SETTINGS_FILE = 'agro-dropbox.json';

function settingsFile(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system');
    const dir = fs.Paths?.document ?? fs.Paths?.cache;
    if (!dir) return null;
    return new fs.File(dir, SETTINGS_FILE);
  } catch {
    return null;
  }
}

export function defaultDropboxSettings(): DropboxSettings {
  return { appKey: '', appSecret: '', refreshToken: '', account: '', lastSync: '' };
}

export function effectiveAppKey(s: DropboxSettings): string {
  return s.appKey.trim() || DROPBOX_APP_KEY;
}

export function effectiveAppSecret(s: DropboxSettings): string {
  return s.appSecret.trim() || DROPBOX_APP_SECRET;
}

export async function loadDropboxSettings(): Promise<DropboxSettings> {
  const base = defaultDropboxSettings();
  try {
    const file = settingsFile();
    if (!file?.exists) return base;
    const raw = await file.text();
    const parsed = JSON.parse(raw) as Partial<DropboxSettings>;
    return {
      appKey: typeof parsed.appKey === 'string' ? parsed.appKey : '',
      appSecret: typeof parsed.appSecret === 'string' ? parsed.appSecret : '',
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      account: typeof parsed.account === 'string' ? parsed.account : '',
      lastSync: typeof parsed.lastSync === 'string' ? parsed.lastSync : '',
    };
  } catch {
    return base;
  }
}

export async function saveDropboxSettings(s: DropboxSettings): Promise<void> {
  try {
    const file = settingsFile();
    if (!file) return;
    file.write(JSON.stringify(s));
  } catch {
    // best-effort
  }
}
