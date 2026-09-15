import { Platform } from 'react-native';

export const theme = {
  // Fresh agro-modern palette
  green: '#1E4D3A',
  pine: '#1E4D3A',
  moss: '#2E6B4F',
  lime: '#A8C686',
  sage: '#E8EFE7',
  bg: '#F6F7F2',
  card: '#FFFFFF',
  ink: '#17231E',
  inkSoft: '#33443C',
  muted: '#6B7A75',
  faint: '#9AA8A2',
  accent: '#D9A441',
  accentSoft: '#F7E8C8',
  danger: '#B3402E',
  dangerSoft: '#F9E2DC',
  success: '#2E7D4F',
  successSoft: '#DDF0E3',
  info: '#2F6FED',
  infoSoft: '#DEE9FF',
  border: '#E4E8DE',
  borderStrong: '#D2D8C9',
  radius: 20,
  radiusSm: 14,
  radiusPill: 999,
  shadow: Platform.select({
    ios: { shadowColor: '#1E4D3A', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 3 },
    default: {},
  }) as object,
  shadowSm: Platform.select({
    ios: { shadowColor: '#1E4D3A', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
    default: {},
  }) as object,
};

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
