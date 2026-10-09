# AgroEcosystem Docs (offline user guide viewer)

Second Electron app: shows the Greek user guide (`docs-site/`, built with
MkDocs) in a window. No backend, no database.

## Dev

1. `cd docs-app && npm install`
2. `npm run dev` — serves `../docs-site` via `app://` protocol.

## Release

`npm run dist` — runs `mkdocs build --strict` first (`predist`), then
builds `dist/AgroEcosystem Docs Setup 1.0.0.exe` (NSIS).

## Notes

- Custom `app://` protocol (not `file://`) so the Material theme search
  worker works offline.
- Rebuild after every `docs/*.md` change (`predist` does it automatically).
- Distinct `appId` (`com.agroecosystem.docs`) so it installs side by side
  with the main app.
