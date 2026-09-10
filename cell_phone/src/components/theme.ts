export const theme = {
  green: '#244b3b',
  bg: '#f4f1ea',
  card: '#ffffff',
  ink: '#1d2b26',
  muted: '#6b7a75',
  accent: '#c98a2e',
  danger: '#b3402e',
  border: '#e2ddd2',
  radius: 14,
};

export const fmt = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
