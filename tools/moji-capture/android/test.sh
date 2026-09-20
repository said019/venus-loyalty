#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build/tests
JDK=${MOJI_JDK:-/opt/homebrew/opt/openjdk}
"$JDK/bin/javac" --release 8 -Xlint:-options -d build/tests src/mx/venus/mojileds/Policy.java src/mx/venus/mojileds/WhitePulse.java tests/SafetyTest.java
"$JDK/bin/java" -cp build/tests mx.venus.mojileds.SafetyTest
"$JDK/bin/javac" --release 8 -Xlint:-options -d build/tests src/mx/venus/mojileds/CaptureSequence.java src/mx/venus/mojileds/CaptureStore.java tests/CaptureSequenceTest.java
"$JDK/bin/java" -cp build/tests mx.venus.mojileds.CaptureSequenceTest
