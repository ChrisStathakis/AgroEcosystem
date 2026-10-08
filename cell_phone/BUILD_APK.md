# Local APK build (no EAS/cloud)

## Prerequisites (one-time, local)

1. Install **JDK 17** (`java -version` must work).
2. Install **Android Studio** + SDK Platform + Build-Tools.
3. Set `ANDROID_HOME`, e.g.:
   `setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"`
4. First build also needs network for `npm install` + Gradle deps.

## Build

```bat
cd cell_phone
build-apk.bat
```

Output: `android\app\build\outputs\apk\release\app-release.apk`
(v1.3.0, versionCode 4 — includes production schema v6 + analytics colors).

> Note: `release` currently uses the debug keystore (see
> `android/app/build.gradle` signingConfigs). Good for sideload testing.
> For Play Store distribution, generate your own keystore and wire it
> into `gradle.properties` (passwords stay on your PC, never in git).

## On-device checklist

1. `adb install -r app-release.apk` (or copy to phone and tap).
2. Create farm + tree type + production row (kg/tn/l) + link an income.
3. Analytics: income green, expenses red, net conditional.
4. Settings backup: version 4 file contains `productions`/`production_links`;
   restoring a v3 backup must succeed with productions count 0.
