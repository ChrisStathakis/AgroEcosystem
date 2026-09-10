@echo off
REM Django local development starter for agro_app\server
REM Usage: start-django.bat [port]
REM Default: 127.0.0.1:8000
REM Uses system python only - no .venv activation

setlocal
cd /d "%~dp0"

set DJANGO_PORT=%1
if "%DJANGO_PORT%"=="" set DJANGO_PORT=8000

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: python not found on PATH.
  pause
  exit /b 1
)

echo Starting Django on http://127.0.0.1:%DJANGO_PORT%/
python manage.py runserver 127.0.0.1:%DJANGO_PORT%
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo Django exited with code %EXITCODE%.
  pause
)
endlocal
