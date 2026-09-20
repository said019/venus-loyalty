#!/bin/sh
set -eu
cd "$(dirname "$0")"
OLD=${MOJI_PREVIOUS_BUILD:-/Users/saidromero/.codex/visualizations/2026/07/15/019f6768-ba2e-78f3-ad4b-aad8860b197b/moji-leds-apk}
JDK=${MOJI_JDK:-/opt/homebrew/opt/openjdk}
TOOLS="$OLD/toolchain/build-tools/android-15"
ANDROID="$OLD/toolchain/platform/android-8.1.0/android.jar"
KEY=${MOJI_SIGNING_KEY:-$OLD/build/test-signing.jks}
test -f "$KEY"
test "$(shasum "$OLD/toolchain/build-tools.zip" | cut -d ' ' -f 1)" = 93ab8ce91230e067b5add4bfa79919c52b27f072
test "$(shasum "$OLD/toolchain/platform.zip" | cut -d ' ' -f 1)" = 35f747e7e70b2d16e0e4246876be28d15ea1c353
sh test.sh
node tests/native-safety.mjs
mkdir -p build/classes build/dex build/generated dist
"$TOOLS/aapt2" compile --dir res -o build/brand.zip
"$TOOLS/aapt2" link -o build/resources.apk --manifest AndroidManifest.xml -I "$ANDROID" -R build/brand.zip --java build/generated
"$JDK/bin/javac" --release 8 -Xlint:-options -encoding UTF-8 -cp "$ANDROID" -d build/classes src/mx/venus/mojileds/*.java
"$JDK/bin/jar" cf build/classes.jar -C build/classes .
"$JDK/bin/java" -cp "$TOOLS/lib/d8.jar" com.android.tools.r8.D8 --min-api 26 --lib "$ANDROID" --output build/dex build/classes.jar
cp build/resources.apk build/unsigned.apk
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$TOOLS/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
"$JDK/bin/java" -jar "$TOOLS/lib/apksigner.jar" sign --ks "$KEY" --ks-key-alias venus-moji-test --ks-pass pass:android --key-pass pass:android --v1-signing-enabled true --v2-signing-enabled true --out dist/venus-moji-capture-0.8.2.apk build/aligned.apk
"$JDK/bin/java" -jar "$TOOLS/lib/apksigner.jar" verify --verbose --print-certs --min-sdk-version 26 dist/venus-moji-capture-0.8.2.apk
"$TOOLS/zipalign" -c -p 4 dist/venus-moji-capture-0.8.2.apk
"$TOOLS/aapt2" dump badging dist/venus-moji-capture-0.8.2.apk
shasum -a 256 dist/venus-moji-capture-0.8.2.apk
