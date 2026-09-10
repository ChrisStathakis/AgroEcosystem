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
| `analytics/services.financial_summary` | `src/db/repositories/analytics.ts` |
| `frontend/views.analytics` | `src/screens/AnalyticsScreen.tsx` |
| `RESOURCES` lists/forms/deletes | `Farms/Trees/Tasks/Transactions/Contacts/Lookups/Settings` screens |
| `forms.py` validation | `src/lib/validation.ts` + repository guards |
| `record_export` CSV | `src/lib/csv.ts` (share sheet) |
| `User+Profile` auth | single local `profiles(id=1)` row |

## Notes

- Money stored as REAL, checked `> 0`; sizes/counts validated like Django.
- Deletes emulate `on_delete=PROTECT` with friendly messages; tasks null out planting/expense like `SET_NULL`.
- Dates are `YYYY-MM-DD` strings for easy SQLite comparison.
