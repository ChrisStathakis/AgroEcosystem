@echo off
REM Build the Django backend exe for Electron.
REM Run from agro_app\server on Windows with Python + PyInstaller installed.
setlocal
cd /d "%~dp0"
python -m pip install -r requirements.txt
python manage.py collectstatic --noinput --settings=config.settings_desktop
pyinstaller agro-server.spec --noconfirm
echo Built: dist\agro-server\agro-server.exe
endlocal
