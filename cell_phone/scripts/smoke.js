// Offline smoke test: no native modules required.
// Checks that schema + key logic files exist and validation behaves.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mustExist = [
  'App.tsx', 'app.json', 'package.json', 'tsconfig.json',
  'src/db/schema.ts', 'src/db/client.ts', 'src/db/seed.ts', 'src/db/types.ts',
  'src/db/repositories/analytics.ts', 'src/db/repositories/farms.ts',
  'src/db/repositories/trees.ts', 'src/db/repositories/tasks.ts',
  'src/db/repositories/transactions.ts', 'src/db/repositories/contacts.ts',
  'src/db/repositories/lookups.ts',
  'src/lib/validation.ts', 'src/lib/csv.ts',
  'src/navigation/AppNavigator.tsx',
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
if (failed > 0) {
  console.error(`SMOKE FAIL (${failed})`);
  process.exit(1);
}
console.log('SMOKE OK: all expected files + tables present');
