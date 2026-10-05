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
# - Stable origin: backend prefers port 8517 (falls back to a free port when
#   busy), so localStorage survives restarts — that's what keeps the light/dark
#   theme choice of the Django UI (`agro-theme`).
# - Theme without flash: `desktop/preload.js` reports the page's resolved
#   theme over IPC; `main.js` sets the window background + nativeTheme and only
#   then shows the window (fallback show after 3s).
