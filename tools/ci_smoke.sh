#!/usr/bin/env bash
# Проверка запуска release-сборки на эмуляторе (CI): установка, холодный старт, тёмная тема, уход в фон и возврат.
# Падение приложения или ошибка JS («Uncaught» в консоли WebView) — ошибка сборки.
#   bash tools/ci_smoke.sh <префикс файлов результата> [apk]
set -u
OUT="$1"; APK="${2:-smoke-release.apk}"; PKG=ru.autohub.app
mkdir -p "$(dirname "$OUT")"
fail() { echo "::error title=smoke $(basename "$OUT")::$1"; exit 1; }

adb uninstall "$PKG.test" >/dev/null 2>&1 || true
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install "$APK" || fail "APK не установился"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity" | tee "$OUT-start.txt"
sleep 25
adb exec-out screencap -p > "$OUT-1-start.png"
adb shell cmd uimode night yes
sleep 5
adb shell input keyevent KEYCODE_HOME
sleep 3
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null
sleep 8
adb exec-out screencap -p > "$OUT-2-dark-resumed.png"
adb shell cmd uimode night no
sleep 3
adb exec-out screencap -p > "$OUT-3-light.png"
adb shell dumpsys activity activities | grep -E "ResumedActivity" | tee "$OUT-resumed.txt"
adb shell pidof "$PKG" | tee "$OUT-pid.txt"
adb shell dumpsys package com.google.android.webview com.android.webview 2>/dev/null | grep -m2 versionName | tee "$OUT-webview.txt"
adb logcat -d > "$OUT.logcat"
grep -E "FATAL EXCEPTION|CONSOLE\(" "$OUT.logcat" | head -40 > "$OUT-log.txt" || true

grep -q "Status: ok" "$OUT-start.txt" || fail "приложение не запустилось"
grep -q "$PKG/.MainActivity" "$OUT-resumed.txt" || fail "MainActivity не на экране после тёмной темы и возврата из фона"
[ -s "$OUT-pid.txt" ] || fail "процесс приложения не жив"
if grep -q "FATAL EXCEPTION" "$OUT.logcat"; then grep -A12 "FATAL EXCEPTION" "$OUT.logcat" | head -20; fail "приложение упало (FATAL EXCEPTION)"; fi
if grep -E "CONSOLE\(" "$OUT.logcat" | grep -q "Uncaught"; then grep -E "CONSOLE\(" "$OUT.logcat" | grep "Uncaught" | head -5; fail "ошибка JS в WebView"; fi
rm -f "$OUT.logcat"
echo "smoke $(basename "$OUT"): старт, тёмная тема, возврат из фона — без падений и ошибок JS"
