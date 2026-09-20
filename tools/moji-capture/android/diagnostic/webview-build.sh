#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
OLD=${MOJI_PREVIOUS_BUILD:-/Users/saidromero/.codex/visualizations/2026/07/15/019f6768-ba2e-78f3-ad4b-aad8860b197b/moji-leds-apk}
JDK=${MOJI_JDK:-/opt/homebrew/opt/openjdk}
TOOLS="$OLD/toolchain/build-tools/android-15"
ANDROID="$OLD/toolchain/platform/android-8.1.0/android.jar"
OUT=build/webview-diagnostic
GPIO=diagnostic/GpioWhitePort.java
if [ "${MOJI_TEST_REAL_WHITE:-0}" = 1 ]; then
 GPIO=src/mx/venus/mojileds/GpioWhitePort.java
 printf '%s\n' 'REAL WHITE GPIO BUILD: requires present operator and empty equipment.'
fi
mkdir -p "$OUT/classes" "$OUT/dex"
"$TOOLS/aapt2" link -o "$OUT/resources.apk" --manifest diagnostic/WebViewManifest.xml -I "$ANDROID"
"$JDK/bin/javac" --release 8 -Xlint:-options -cp "$ANDROID" -d "$OUT/classes" "$GPIO" src/mx/venus/mojileds/MainActivity.java src/mx/venus/mojileds/Policy.java src/mx/venus/mojileds/WhitePulse.java src/mx/venus/mojileds/NativeWhiteCapture.java src/mx/venus/mojileds/NativeStillCamera.java
"$JDK/bin/jar" cf "$OUT/classes.jar" -C "$OUT/classes" .
"$JDK/bin/java" -cp "$TOOLS/lib/d8.jar" com.android.tools.r8.D8 --min-api 26 --lib "$ANDROID" --output "$OUT/dex" "$OUT/classes.jar"
cp "$OUT/resources.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)
"$TOOLS/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$JDK/bin/java" -jar "$TOOLS/lib/apksigner.jar" sign --ks "$OLD/build/test-signing.jks" --ks-key-alias venus-moji-test --ks-pass pass:android --key-pass pass:android --out "$OUT/probe.apk" "$OUT/aligned.apk"
"$JDK/bin/java" -jar "$TOOLS/lib/apksigner.jar" verify --min-sdk-version 26 "$OUT/probe.apk"
