"""Desktop (Electron) settings for AgroEcosystem.

Import base settings, then override for local single-user desktop use:
- DEBUG off, localhost only
- SQLite + SECRET_KEY + logs live in per-user data dir (env AGRO_DATA_DIR)
- WhiteNoise for admin/static files
- No autoreload / runserver — served by Waitress via run_desktop.py
"""
import os
import secrets
import sys
from pathlib import Path

from .settings import *  # noqa: F401,F403

if getattr(sys, "frozen", False):
    # PyInstaller one-dir: datas live beside the exe (dist/agro-server/),
    # or in sys._MEIPASS. exe dir works for both COLLECT layouts.
    BUNDLE_ROOT = Path(sys.executable).resolve().parent
    if not (BUNDLE_ROOT / "frontend" / "templates").exists() and hasattr(sys, "_MEIPASS"):
        BUNDLE_ROOT = Path(sys._MEIPASS)  # noqa: SLF001
    BASE_DIR = BUNDLE_ROOT
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
    BUNDLE_ROOT = BASE_DIR

# TEMPLATES DIRS was evaluated with the source BASE_DIR at import time —
# re-point it at the bundle so the frozen exe finds its templates.
TEMPLATES[0]["DIRS"] = [str(BUNDLE_ROOT / "frontend" / "templates")]  # noqa: F405

# --- Data dir: %APPDATA%/AgroEcosystem on Windows, ~/.agroecosystem elsewhere ---
if os.environ.get("AGRO_DATA_DIR"):
    DATA_DIR = Path(os.environ["AGRO_DATA_DIR"])
elif os.name == "nt":
    DATA_DIR = Path(os.environ.get("APPDATA", Path.home())) / "AgroEcosystem"
else:
    DATA_DIR = Path.home() / ".agroecosystem"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Security for localhost desktop ---
DEBUG = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

SECRET_KEY_FILE = DATA_DIR / "secret_key.txt"
env_key = os.environ.get("AGRO_SECRET_KEY")
if env_key:
    SECRET_KEY = env_key
elif SECRET_KEY_FILE.exists():
    SECRET_KEY = SECRET_KEY_FILE.read_text(encoding="utf-8").strip()
else:
    SECRET_KEY = secrets.token_urlsafe(50)
    SECRET_KEY_FILE.write_text(SECRET_KEY, encoding="utf-8")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "db.sqlite3",
    }
}

# --- Static files (mainly Django admin; app itself uses CDN + inline theme) ---
STATIC_URL = "static/"
STATIC_ROOT = BUNDLE_ROOT / "staticfiles"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
}
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *[m for m in MIDDLEWARE if m != "django.middleware.security.SecurityMiddleware"],  # noqa: F405
]

# Desktop runs at http://127.0.0.1:<port> — same-origin, but keep CSRF strict.
CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1:*",
    "http://localhost:*",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "file": {
            "class": "logging.FileHandler",
            "filename": str(DATA_DIR / "django.log"),
            "encoding": "utf-8",
        },
    },
    "root": {"handlers": ["file"], "level": "INFO"},
}
