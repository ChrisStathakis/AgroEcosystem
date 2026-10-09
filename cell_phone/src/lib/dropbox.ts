// Manual Dropbox sync (no auto-sync, no extra dependency).
// Mirrors server/frontend/dropbox.py using plain fetch.
import { DROPBOX_FOLDER } from './dropboxConfig';

const TOKEN_URL = 'https://api.dropbox.com/oauth2/token';
const UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';
const DOWNLOAD_URL = 'https://content.dropboxapi.com/2/files/download';
const LIST_URL = 'https://api.dropboxapi.com/2/files/list_folder';
const ACCOUNT_URL = 'https://api.dropboxapi.com/2/users/get_current_account';

export class DropboxError extends Error {}

export interface DropboxFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

function isPlaceholder(v: string): boolean {
  const s = (v ?? '').trim();
  return !s || s.startsWith('PASTE-');
}

function toBase64(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let out = '';
  let i = 0;
  while (i < input.length) {
    const c1 = input.charCodeAt(i++);
    const c2 = i < input.length ? input.charCodeAt(i++) : NaN;
    const c3 = i < input.length ? input.charCodeAt(i++) : NaN;
    const b1 = c1 >> 2;
    const b2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : (c2 >> 4));
    const b3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : (c3 >> 6)));
    const b4 = isNaN(c2) || isNaN(c3) ? 64 : (c3 & 63);
    out += chars.charAt(b1) + chars.charAt(b2) + chars.charAt(b3) + chars.charAt(b4);
  }
  return out;
}

export function assertConfigured(appKey: string, appSecret: string, refreshToken: string): void {
  if (isPlaceholder(appKey) || isPlaceholder(appSecret)) {
    throw new DropboxError('Enter Dropbox App Key + Secret first.');
  }
  if (!refreshToken.trim()) {
    throw new DropboxError('Paste your Dropbox refresh token first (copy it from the desktop app after connecting).');
  }
}

async function failFromResponse(res: Response, fallback: string): Promise<never> {
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    detail = '';
  }
  throw new DropboxError(`${fallback} (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
}

export async function refreshAccessToken(appKey: string, appSecret: string, refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken.trim(),
  }).toString();
  const basic = toBase64(`${appKey.trim()}:${appSecret.trim()}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) await failFromResponse(res, 'Could not refresh Dropbox access');
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new DropboxError('Could not refresh Dropbox access.');
  return data.access_token;
}

export async function getAccountName(accessToken: string): Promise<string> {
  const res = await fetch(ACCOUNT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) return '';
  try {
    const info = (await res.json()) as { name?: { display_name?: string }; email?: string };
    const name = info?.name?.display_name ?? '';
    const email = info?.email ?? '';
    return email ? `${name} (${email})`.trim() : name;
  } catch {
    return '';
  }
}

export async function uploadBackup(args: {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  payload: unknown;
  filename?: string;
}): Promise<string> {
  assertConfigured(args.appKey, args.appSecret, args.refreshToken);
  const access = await refreshAccessToken(args.appKey, args.appSecret, args.refreshToken);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = args.filename?.trim() || `agro-backup-${stamp}.json`;
  const path = `${DROPBOX_FOLDER}/${filename}`;
  const body = JSON.stringify(args.payload, null, 2);
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: true }),
    },
    body,
  });
  if (!res.ok) await failFromResponse(res, 'Dropbox upload failed');
  return path;
}

export async function listBackups(args: { appKey: string; appSecret: string; refreshToken: string }): Promise<DropboxFile[]> {
  assertConfigured(args.appKey, args.appSecret, args.refreshToken);
  const access = await refreshAccessToken(args.appKey, args.appSecret, args.refreshToken);
  const res = await fetch(LIST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DROPBOX_FOLDER, recursive: false }),
  });
  if (!res.ok) {
    try {
      const text = await res.text();
      if (text.includes('not_found')) return [];
    } catch {
      // fall through
    }
    await failFromResponse(res, 'Dropbox list failed');
  }
  const data = (await res.json()) as { entries?: Array<{ '.tag'?: string; name?: string; path_lower?: string; size?: number; server_modified?: string }> };
  return (data.entries ?? [])
    .filter((e) => e?.['.tag'] === 'file' && (e.name ?? '').endsWith('.json'))
    .map((e) => ({ name: e.name ?? '', path: e.path_lower ?? '', size: e.size ?? 0, modified: e.server_modified ?? '' }))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

export async function downloadBackup(args: {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  path: string;
  maxBytes?: number;
}): Promise<unknown> {
  assertConfigured(args.appKey, args.appSecret, args.refreshToken);
  if (!args.path) throw new DropboxError('Pick a Dropbox file first.');
  const access = await refreshAccessToken(args.appKey, args.appSecret, args.refreshToken);
  const res = await fetch(DOWNLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Dropbox-API-Arg': JSON.stringify({ path: args.path }) },
  });
  if (!res.ok) await failFromResponse(res, 'Dropbox download failed');
  const text = await res.text();
  if (text.length > (args.maxBytes ?? 5 * 1024 * 1024)) {
    throw new DropboxError('This file is too large (5 MB limit).');
  }
  return JSON.parse(text);
}
