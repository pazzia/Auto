#!/usr/bin/env bash
# Подписать release-сборку из служебной ветки ci-apk-handoff ключом владельца — пока в репозитории нет
# секретов подписи (AUTO-44) и задача release в CI подписать её не может.
#
#   1. Actions → Build APK → Run workflow на нужной ветке (задача apk-handoff кладёт сборку в ci-apk-handoff).
#   2. bash tools/sign_handoff.sh /путь/autohub-release.jks /путь/файл-с-паролем [алиас] [папка для APK]
#
# Нужны git и Java 17+. apksigner берётся из той же ветки (его кладёт CI из Android build-tools).
# Ключ и пароль в репозиторий не кладутся.
set -euo pipefail
KS="${1:?путь к keystore}"; PASS="${2:?файл с паролем keystore}"; ALIAS="${3:-autohub}"; OUTDIR="${4:-.}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

git -C "$ROOT" fetch -q --depth=1 origin ci-apk-handoff
git -C "$ROOT" archive FETCH_HEAD | tar -x -C "$WORK"
( cd "$WORK" && sha256sum -c --quiet SHA256SUMS )
VER="$(grep -o "versionName='[^']*'" "$WORK/badging.txt" | cut -d"'" -f2)"
OUT="$OUTDIR/AutoHub-$VER.apk"

java -jar "$WORK/apksigner.jar" sign --ks "$KS" --ks-key-alias "$ALIAS" --ks-pass "file:$PASS" --key-pass "file:$PASS" --out "$OUT" "$WORK/app-release-unsigned.apk"
rm -f "$OUT.idsig"
java -jar "$WORK/apksigner.jar" verify --min-sdk-version 26 --print-certs "$OUT" | grep -E "certificate (DN|SHA-256)"
echo "Готово: $OUT (сборка $VER, коммит $(cat "$WORK/COMMIT"))"
