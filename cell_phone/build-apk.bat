@echo off
REM Local release APK build (no cloud). Requires JDK 17 + Android SDK.
REM Output: android\app\build\outputs\apk\release\app-release.apk
setlocal
cd /d "%~dp0"

where java >nul 2>nul
if errorlevel 1 (
  echo ERROR: JDK not found. Install JDK 17 and Android Studio, then retry.
  echo See BUILD_APK.md for the exact setup.
  exit /b 1
)
if "%ANDROID_HOME%"=="" if "%ANDROID_SDK_ROOT%"=="" (
  echo ERROR: ANDROID_HOME is not set. Set it to your SDK path, e.g.
  echo   setx ANDROID_HOME "%%LOCALAPPDATA%%\Android\Sdk"
  exit /b 1
)
if not exist node_modules (
  echo Installing JS dependencies...
  call npm install || exit /b 1
)

cd android
call gradlew.bat :app:assembleRelease || exit /b 1
cd ..
echo.
echo APK ready: android\app\build\outputs\apk\release\app-release.apk
endlocal
