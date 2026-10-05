#!/usr/bin/env python
"""Desktop entrypoint: migrate + collectstatic + serve via Waitress.

Used by Electron (dev: `python run_desktop.py`, prod: PyInstaller exe).
Writes the chosen port to --port-file so Electron can load it.

Usage:
    python run_desktop.py [--port 8000] [--port-file FILE] [--host 127.0.0.1]
"""
import argparse
import os
import socket
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    # Frozen: bootloader already sets sys.path; ensure bundle root is present.
    _bundle = str(Path(sys.executable).resolve().parent)
    if _bundle not in sys.path:
        sys.path.insert(0, _bundle)
else:
    sys.path.insert(0, str(BASE_DIR))

# Static imports so PyInstaller's analysis bundles the local Django packages
# (DJANGO_SETTINGS_MODULE is only a string, otherwise invisible to it).
# NOTE: models/views must be imported AFTER django.setup() (see main()),
# otherwise Django raises ImproperlyConfigured at interpreter startup.
import config.settings_desktop  # noqa: F401
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings_desktop")


def find_free_port(host="127.0.0.1"):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--port-file", default=None)
    args = parser.parse_args()

    import django
    from django.core.management import call_command

    django.setup()

    # Deferred: importing models/views before setup() raises
    # ImproperlyConfigured. Listed here so PyInstaller bundles them.
    import analytics.services  # noqa: F401
    import config.urls  # noqa: F401
    import config.wsgi  # noqa: F401
    import expenses.models  # noqa: F401
    import farm.models  # noqa: F401
    import frontend.backup  # noqa: F401
    import frontend.forms  # noqa: F401
    import frontend.urls  # noqa: F401
    import frontend.views  # noqa: F401
    import incomes.models  # noqa: F401
    import profiles.models  # noqa: F401

    # Ensure per-user DB is migrated on every launch (fresh install + upgrades).
    call_command("migrate", "--noinput", verbosity=0)
    try:
        call_command("collectstatic", "--noinput", verbosity=0)
    except Exception as exc:  # static is admin-only; never block startup
        print(f"[agro] collectstatic skipped: {exc}", flush=True)

    host = args.host
    port = args.port or find_free_port(host)

    if args.port_file:
        Path(args.port_file).write_text(str(port), encoding="utf-8")

    print(f"[agro] serving on http://{host}:{port}/", flush=True)

    from waitress import serve
    from django.core.wsgi import get_wsgi_application

    serve(get_wsgi_application(), host=host, port=port, threads=8)


if __name__ == "__main__":
    main()
