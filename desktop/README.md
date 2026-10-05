# AgroEcosystem Desktop (Django + Electron, Windows)
#
# ## Dev (no installer needed)
# 1. `cd server && pip install -r requirements.txt`
# 2. `cd ../desktop && npm install`
# 3. `npm run dev` — Electron spawns `python ../server/run_desktop.py`
#    (per-user DB in `%APPDATA%/AgroEcosystem/db.sqlite3`).
#
# ## Release
# 1. `cd server && build-backend.bat` → `server/dist/agro-server/agro-server.exe`
# 2. `cd ../desktop && npm run dist` → `desktop/dist/*.exe` (NSIS + portable)
#
# ## Notes
# - Desktop settings: `server/config/settings_desktop.py` (DEBUG off,
#   localhost only, WhiteNoise, per-user secret + SQLite).
# - Backend entry: `server/run_desktop.py` (migrate + Waitress, writes --port-file).
# - Electron: `desktop/main.js` (single instance, splash, spawn + poll backend,
#   kill on quit). No nodeIntegration in Django pages.
