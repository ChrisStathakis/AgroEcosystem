# PyInstaller spec for the Django desktop backend.
# Build: cd server && pyinstaller agro-server.spec
# Output: server/dist/agro-server/agro-server.exe (referenced by desktop/electron-builder.yml)
# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

hidden = []
hidden += collect_submodules("waitress")
hidden += collect_submodules("whitenoise")
hidden += collect_submodules("config")
for _pkg in ("profiles", "farm", "expenses", "incomes", "analytics", "frontend"):
    hidden += collect_submodules(_pkg)
hidden += ["django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
           "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles"]

datas = []
datas += collect_data_files("django")
datas += [("frontend/templates", "frontend/templates")]
import os as _os
for _src, _dst in [("locale", "locale"), ("staticfiles", "staticfiles")]:
    if _os.path.isdir(_src):
        datas += [(_src, _dst)]

a = Analysis(
    ["run_desktop.py"],
    pathex=[SPECPATH],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="agro-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="agro-server",
)
