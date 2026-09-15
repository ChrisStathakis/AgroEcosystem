# Agro cell_phone (Expo + TypeScript + SQLite, offline-first)

Port of `server/` (Django) to React Native. No backend calls.

## Run

```sh
npm install
npm run android # or ios / start
```

First launch creates `agro.db`, runs `src/db/schema.ts`, ensures
profile id=1, and inserts starter categories (`src/db/seed.ts`).

## Map from Django

| Django | Mobile |
|---|---|
| `frontend/views.home` | `src/screens/OverviewScreen.tsx` |
| `analytics/services` (summary, breakdown, farm profit, cumulative, P&L, cash-flow, tax) | `src/db/repositories/analytics.ts` |
| `frontend/views.analytics*` + `analytics_export` | `src/screens/AnalyticsScreen.tsx` (tabs + filters + CSV via `src/lib/csv.ts`) |
| `RESOURCES` lists/forms/deletes | `Farms/Trees/Tasks/Transactions/Contacts/Lookups/Settings` screens |
| `forms.py` validation | `src/lib/validation.ts` + repository guards |
| `record_export` CSV | `src/lib/csv.ts` (share sheet) |
| `frontend/backup.py` (v3 + replace/merge + destroy) | `src/db/backup.ts` + Settings backup section |
| `RESOURCES_EL` / EL labels / month labels | `src/lib/i18n.ts` (EN/EL toggle in Settings) |
| `User+Profile` auth | single local `profiles(id=1)` row |
| `Expense.is_archived` / `Income.is_archived` | `is_archived` columns (schema v4, migrated) + archive toggles; hidden from task dropdowns |

## Notes

- Money stored as REAL, checked `> 0`; sizes/counts validated like Django.
- Tree additions/removals are append-only inventory movements; zero-balance groups remain for history. Farm and other deletes emulate `on_delete=PROTECT` with friendly messages; tasks null out planting/expense like `SET_NULL`.
- Income is a global amount with optional per-farm allocation rows; partial allocations are reported with an explicit Unallocated remainder.
- Dates are `YYYY-MM-DD` strings for easy SQLite comparison.
