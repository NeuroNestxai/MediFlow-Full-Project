#!/usr/bin/env bash
# Type-checks the Android app sources without an Android SDK (see build.gradle.kts for what this does and doesn't prove).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p libs
if [ ! -f libs/android-all.jar ]; then
  curl -fsSL -o libs/android-all.jar https://repo1.maven.org/maven2/org/robolectric/android-all/15-robolectric-12650502/android-all-15-robolectric-12650502.jar
fi
if [ ! -f libs/osmdroid-classes.jar ]; then
  curl -fsSL -o libs/osmdroid.aar https://repo1.maven.org/maven2/org/osmdroid/osmdroid-android/6.1.20/osmdroid-android-6.1.20.aar
  (cd libs && unzip -q -o osmdroid.aar classes.jar && mv classes.jar osmdroid-classes.jar && rm osmdroid.aar)
fi
python3 genr.py gen
../../gradlew -p . compileKotlin --console=plain "$@"
