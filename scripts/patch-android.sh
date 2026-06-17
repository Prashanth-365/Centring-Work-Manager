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

echo "patch-android: done."
