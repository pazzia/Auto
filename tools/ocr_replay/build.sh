#!/bin/sh
# Собирает tools/ocr_replay/build/replay против Tesseract/Leptonica из исходников Tesseract4Android 4.9.0 (та же версия, что в APK).
# sh tools/ocr_replay/build.sh <prefix установки (lib/libtesseract.a, lib/libleptonica.so, include/)>
set -e
D=$(cd "$(dirname "$0")" && pwd); INST=$1
mkdir -p "$D/build/lib"
cp -P "$INST"/lib/libleptonica.so* "$D/build/lib/"
g++ -O2 -std=c++17 -I"$INST/include" "$D/replay.cpp" "$INST/lib/libtesseract.a" -L"$D/build/lib" -lleptonica -lpthread -o "$D/build/replay"
echo "ok: $D/build/replay"
