// Offline smoke test: no native modules required.
// Checks that schema + key logic files exist and validation behaves.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mustExist = [
  'App.tsx', 'app.json', 'package.json', 'tsconfig.json',
  'src/components/Select.tsx',
  'src/db/schema.ts', 'src/db/client.ts', 'src/db/seed.ts', 'src/db/types.ts',
  'src/db/backup.ts',
  'src/db/repositories/analytics.ts', 'src/db/repositories/farms.ts',
  'src/db/repositories/trees.ts', 'src/db/repositories/tasks.ts',
  'src/db/repositories/transactions.ts', 'src/db/repositories/contacts.ts',
  'src/db/repositories/lookups.ts',
  'src/lib/validation.ts', 'src/lib/csv.ts', 'src/lib/i18n.ts',
  'src/navigation/AppNavigator.tsx',
  'assets/icon.png',
];
let failed = 0;
for (const f of mustExist) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error('missing: ' + f);
    failed++;
  }
}
const schema = fs.readFileSync(path.join(root, 'src/db/schema.ts'), 'utf8');
for (const t of ['farms', 'tree_plantings', 'farm_tasks', 'expenses', 'incomes', 'vendors', 'customers']) {
  if (!schema.includes(t)) {
    console.error('schema missing table: ' + t);
    failed++;
  }
}
for (const c of ['is_archived', 'income_farm_allocations', 'tree_inventory_movements']) {
  if (!schema.includes(c)) {
    console.error('schema missing feature: ' + c);
    failed++;
  }
}
// New feature guards: pickers, backup import, persisted language.
const checks = [
  ['src/components/Select.tsx', ['FlatList', 'Modal', 'onChange']],
  ['src/screens/TreesScreen.tsx', ['Select', 'setFarmId']],
  ['src/screens/TasksScreen.tsx', ['Select', 'listTaskExpenseOptions']],
  ['src/screens/TransactionsScreens.tsx', ['Select', 'AllocationDraft']],
  ['src/screens/AnalyticsScreen.tsx', ['Select', 'listFarms']],
  ['src/screens/SettingsScreen.tsx', ['getDocumentAsync', 'pickBackupFile', 'Preview current data']],
  ['src/lib/i18n.ts', ['loadLang', 'persistLang', 'agro-lang.json']],
  ['App.tsx', ['loadLang']],
  ['package.json', ['expo-document-picker']],
  ['app.json', ['"icon"', '"scheme"']],
];
for (const [f, needles] of checks) {
  const body = fs.readFileSync(path.join(root, f), 'utf8');
  for (const n of needles) {
    if (!body.includes(n)) {
      console.error(`feature missing in ${f}: ${n}`);
      failed++;
    }
  }
}
if (failed > 0) {
  console.error(`SMOKE FAIL (${failed})`);
  process.exit(1);
}
console.log('SMOKE OK: all expected files + tables present');
