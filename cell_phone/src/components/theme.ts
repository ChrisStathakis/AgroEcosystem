import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

/**
 * Dual palette (light + dark) + Light/Dark/System preference store.
 *
 * The dark palette is the port of server/frontend/templates/frontend/partials/theme.html
 * `[data-bs-theme="dark"]` tokens: bg #121a16, card #1a2420, ink #e8ede6,
 * line #2c3a33, gold accent #d3b978.
 *
 * Components subscribe with `useColors()` (or `useTheme()` for the preference);
 * inside a component you can shadow the imported `theme` binding:
 *
 *   const theme = useColors();   // re-renders on theme change, same field names
 *
 * Module-level StyleSheet objects must be built inside a hook (see ui.tsx
 * `useXStyles()` helpers) — otherwise their colors freeze at the light palette.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';
export interface Colors {
  // Brand
  green: string;
  pine: string;
  moss: string;
  lime: string;
  sage: string;
  // Surfaces
  bg: string;
  card: string;
  /** Inputs, chips, list rows — white in light, raised panel in dark. */
  surface: string;
  /** Muted track (segmented tabs, skeleton bars). */
  surfaceAlt: string;
  // Text
  ink: string;
  inkSoft: string;
  muted: string;
  faint: string;
  // Accents / status
  accent: string;
  accentSoft: string;
  /** Text color on accentSoft backgrounds (badges, pills). */
  accentText: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
  neutralSoft: string;
  // Lines
  border: string;
  borderStrong: string;
  /** Screen header wash (Screen.tsx hero gradient). */
  heroA: string;
  heroB: string;
}

export const lightColors: Colors = {
  green: '#1E4D3A',
  pine: '#1E4D3A',
  moss: '#2E6B4F',
  lime: '#A8C686',
  sage: '#E8EFE7',
  bg: '#F6F7F2',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDE4',
  ink: '#17231E',
  inkSoft: '#33443C',
  muted: '#6B7A75',
  faint: '#9AA8A2',
  accent: '#D9A441',
  accentSoft: '#F7E8C8',
  accentText: '#8A5E12',
  danger: '#B3402E',
  dangerSoft: '#F9E2DC',
  success: '#2E7D4F',
  successSoft: '#DDF0E3',
  info: '#2F6FED',
  infoSoft: '#DEE9FF',
  neutralSoft: '#EFF1EA',
  border: '#E4E8DE',
  borderStrong: '#D2D8C9',
  heroA: '#DDE9D9',
  heroB: '#F6F7F2',
};

export const darkColors: Colors = {
  green: '#8FB896',
  pine: '#2E4A3A',
  moss: '#3A5C48',
  lime: '#A8C686',
  sage: '#222E29',
  bg: '#121A16',
  card: '#1A2420',
  surface: '#222E29',
  surfaceAlt: '#161E1A',
  ink: '#E8EDE6',
  inkSoft: '#DFE9DC',
  muted: '#A9B6A8',
  faint: '#8B968A',
  accent: '#D3B978',
  accentSoft: '#3D2F1D',
  accentText: '#E3B96A',
  danger: '#E0705A',
  dangerSoft: '#3D2A22',
  success: '#9FD0A8',
  successSoft: '#24382C',
  info: '#8FB4FF',
  infoSoft: '#1D2B45',
  neutralSoft: '#26332C',
  border: '#2C3A33',
  borderStrong: '#35463D',
  heroA: '#1B2621',
  heroB: '#121A16',
};

// Scheme-independent tokens (kept out of the palettes so `useMemo` deps stay tiny).
const base = {
  radius: 20,
  radiusSm: 14,
  radiusPill: 999,
  shadow: Platform.select({
    ios: { shadowColor: '#0B1710', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 3 },
    default: {},
  }) as object,
  shadowSm: Platform.select({
    ios: { shadowColor: '#0B1710', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
    default: {},
  }) as object,
};

export type Theme = Colors & typeof base;

/**
 * Legacy singleton, mirrored from the active palette on every change so any
 * module-level reader keeps working. Inside components, shadow it with
 * `const theme = useColors();` to get reactive values.
 */
export const theme: Theme = { ...lightColors, ...base };

/** Stable per-scheme theme objects (palette + non-color tokens) for useMemo deps. */
const THEMES: Record<Scheme, Theme> = {
  light: { ...lightColors, ...base },
  dark: { ...darkColors, ...base },
};

// ---------------------------------------------------------------------------
// Preference store (persisted to agro-theme.json, same pattern as i18n.ts)
// ---------------------------------------------------------------------------

const THEME_FILE = 'agro-theme.json';
const listeners = new Set<() => void>();
let preference: ThemePreference = 'system';
let loaded = false;

function themeFile() {
  // Lazy-require expo-file-system so unit/smoke (node) environments don't crash.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('expo-file-system');
  const dir = fs.Paths?.document ?? fs.Paths?.cache;
  if (!dir) return null;
  return new fs.File(dir, THEME_FILE);
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(p: ThemePreference): void {
  preference = p;
  for (const fn of listeners) fn();
  persistPreference(p).catch(() => {});
}

async function persistPreference(p: ThemePreference): Promise<void> {
  try {
    const file = themeFile();
    if (!file) return;
    file.write(JSON.stringify({ preference: p }));
  } catch {
    // Persistence is best-effort; the in-memory value still applies.
  }
}

export async function loadThemePreference(): Promise<ThemePreference> {
  if (loaded) return preference;
  try {
    const file = themeFile();
    if (file?.exists) {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as { preference?: ThemePreference };
      if (parsed.preference === 'light' || parsed.preference === 'dark' || parsed.preference === 'system') {
        preference = parsed.preference;
      }
    }
  } catch {
    // Keep default 'system' on any read/parse error.
  }
  loaded = true;
  for (const fn of listeners) fn();
  return preference;
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Resolve a preference against the OS setting. */
export function colorsFor(pref: ThemePreference, system: string | null | undefined): Theme {
  return THEMES[schemeFor(pref, system)];
}

/** Resolve just the effective scheme (used by ThemeProvider for status bar). */
export function schemeFor(pref: ThemePreference, system: string | null | undefined): Scheme {
  if (pref !== 'system') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

/** Mirror the active palette onto the legacy singleton. */
export function syncThemeSingleton(colors: Colors): void {
  Object.assign(theme, colors);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Re-renders the calling component whenever the stored preference changes. */
export function useTheme(): ThemePreference {
  const [, force] = useState(0);
  useEffect(() => subscribeTheme(() => force((n) => n + 1)), []);
  return preference;
}

/**
 * Reactive palette — the returned object is `lightColors` or `darkColors`
 * (stable identities), so `useMemo(() => StyleSheet…, [colors])` works.
 */
export function useColors(): Theme {
  const pref = useTheme();
  const system = useColorScheme();
  return colorsFor(pref, system);
}

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 32 } as const;

export const type = {
  eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: '700' as const },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '800' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  mono: { fontSize: 12, fontWeight: '600' as const },
};

export const fmt = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtCompact = (n: number) =>
  Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n));
