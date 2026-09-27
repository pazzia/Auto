"""Добавляет раздел сборки в CHANGELOG.md и отмечает задачи в docs/backlog.md как сделанные.

python3 tools/release_note.py "AUTO-14,AUTO-29" "- пункт 1" "- пункт 2"
"""
import os, re, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ver = open(os.path.join(ROOT, "VERSION")).read().strip()
tasks = [t for t in sys.argv[1].split(",") if t]
lines = sys.argv[2:]
cl = os.path.join(ROOT, "CHANGELOG.md"); s = open(cl, encoding="utf-8").read()
i = s.index("## Сборка")
s = s[:i] + "## Сборка %s — %s\n\n%s\n\n" % (ver, "27 сентября 2026", "\n".join(lines)) + s[i:]
open(cl, "w", encoding="utf-8").write(s)
bl = os.path.join(ROOT, "docs", "backlog.md"); b = open(bl, encoding="utf-8").read()
for t in tasks:
    # строка задачи: переносим в раздел «сделано» со статусом
    m = re.search(r"^\| %s \|.*\| Бэклог \|$" % re.escape(t), b, re.M)
    if not m: continue
    row = m.group(0).replace("| Бэклог |", "| Сделано (сборка %s) |" % ver)
    b = b.replace(m.group(0) + "\n", "")
    j = b.index("\n## Бэклог")
    b = b[:j] + row + "\n" + b[j:]
open(bl, "w", encoding="utf-8").write(b)
print("ok", ver, tasks)
