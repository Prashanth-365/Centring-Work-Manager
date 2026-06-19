#!/usr/bin/env bash
# Idempotent tweaks to the freshly-generated android/ project.
# The android/ folder is NOT committed — it is created by `npx cap add android`
# in CI. Run this script right after that, before `npx cap sync android`.
set -euo pipefail

ANDROID_DIR="android"
if [ ! -d "$ANDROID_DIR" ]; then
  echo "patch-android: '$ANDROID_DIR' not found — run 'npx cap add android' first." >&2
  exit 1
fi

VARS="$ANDROID_DIR/variables.gradle"
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"

# 1. SDK versions compatible with JDK 17 / AGP 8 (idempotent: rewrites the numbers).
if [ -f "$VARS" ]; then
  sed -i -E "s/minSdkVersion = [0-9]+/minSdkVersion = 23/" "$VARS"
  sed -i -E "s/compileSdkVersion = [0-9]+/compileSdkVersion = 34/" "$VARS"
  sed -i -E "s/targetSdkVersion = [0-9]+/targetSdkVersion = 34/" "$VARS"
  echo "patch-android: ensured SDK versions (min 23 / compile 34 / target 34)."
else
  echo "patch-android: WARNING variables.gradle not found, skipping SDK patch." >&2
fi

# 2. Ensure INTERNET permission exists (idempotent — Capacitor usually adds it).
if [ -f "$MANIFEST" ]; then
  if ! grep -q 'android.permission.INTERNET' "$MANIFEST"; then
    sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET" />\n\n    <application#' "$MANIFEST"
    echo "patch-android: added INTERNET permission."
  else
    echo "patch-android: INTERNET permission already present."
  fi
else
  echo "patch-android: WARNING AndroidManifest.xml not found, skipping permission patch." >&2
fi

# 3. Register the OAuth deep-link intent-filter on MainActivity so the Chrome
#    Custom-Tab sign-in can hand the token back via
#    `app.centering.manager://oauth-success` (see src/lib/drive.ts). The app
#    manifest has a single <activity> (MainActivity); idempotent via the grep.
if [ -f "$MANIFEST" ]; then
  if ! grep -q 'android:scheme="app.centering.manager"' "$MANIFEST"; then
    sed -i 's#</activity>#    <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="app.centering.manager" android:host="oauth-success" />\n            </intent-filter>\n        </activity>#' "$MANIFEST"
    echo "patch-android: added OAuth deep-link intent-filter."
  else
    echo "patch-android: OAuth deep-link intent-filter already present."
  fi
else
  echo "patch-android: WARNING AndroidManifest.xml not found, skipping deep-link patch." >&2
fi

# 4. Consistent signing + version. android/ is regenerated every CI run, so we
#    append (once) an extra `android {}` block to the app module's build.gradle:
#      - versionCode / versionName from CI env (auto-incrementing, readable), so
#        Android never blocks an update as a "downgrade".
#      - a release signingConfig from a decoded keystore + env-supplied creds,
#        applied to BOTH debug and release builds so every APK carries the SAME
#        signature and installs in-place over the previous version.
#    When no keystore was decoded (secret unset), only the version is set and the
#    build falls back to the default debug key.
APP_GRADLE="$ANDROID_DIR/app/build.gradle"
KEYSTORE="$ANDROID_DIR/app/release.keystore"
if [ -f "$APP_GRADLE" ]; then
  if grep -q 'cwm-signing' "$APP_GRADLE"; then
    echo "patch-android: version/signing block already present."
  else
    {
      echo ''
      echo '// cwm-signing — injected by scripts/patch-android.sh (android/ is regenerated each build)'
      echo 'android {'
      echo '    defaultConfig {'
      echo '        versionCode (System.getenv("CWM_VERSION_CODE") ?: "1").toInteger()'
      echo '        versionName (System.getenv("CWM_VERSION_NAME") ?: "0.1.2")'
      echo '    }'
      if [ -f "$KEYSTORE" ]; then
        echo '    signingConfigs {'
        echo '        release {'
        echo '            storeFile file("release.keystore")'
        echo '            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")'
        echo '            keyAlias System.getenv("ANDROID_KEY_ALIAS")'
        echo '            keyPassword System.getenv("ANDROID_KEY_PASSWORD")'
        echo '        }'
        echo '    }'
        echo '    buildTypes {'
        echo '        debug { signingConfig signingConfigs.release }'
        echo '        release { signingConfig signingConfigs.release }'
        echo '    }'
      fi
      echo '}'
    } >> "$APP_GRADLE"
    if [ -f "$KEYSTORE" ]; then
      echo "patch-android: injected versionCode/Name + release signingConfig (debug + release)."
    else
      echo "patch-android: injected versionCode/Name (no keystore — default debug signing)."
    fi
  fi
else
  echo "patch-android: WARNING app/build.gradle not found, skipping version/signing patch." >&2
fi

echo "patch-android: done."
