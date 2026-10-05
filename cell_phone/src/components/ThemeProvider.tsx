import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import {
  colorsFor,
  getThemePreference,
  loadThemePreference,
  schemeFor,
  setThemePreference,
  subscribeTheme,
  syncThemeSingleton,
  type Scheme,
  type ThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: Scheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  scheme: 'light',
  setPreference: () => {},
});

/**
 * Keeps the legacy `theme` singleton in sync with the active palette and
 * exposes the Light/Dark/System preference to the Settings screen.
 * The palette itself is consumed through `useColors()` / `useTheme()`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [, force] = useState(0);
  const system = useColorScheme();

  useEffect(() => subscribeTheme(() => force((n) => n + 1)), []);
  // Preference is loaded during app boot; re-read once here as a safety net.
  useEffect(() => {
    loadThemePreference().catch(() => {});
  }, []);

  const preference = getThemePreference();
  const scheme = schemeFor(preference, system);
  const colors = colorsFor(preference, system);

  useEffect(() => {
    syncThemeSingleton(colors);
  }, [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, scheme, setPreference: setThemePreference }),
    [preference, scheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}
