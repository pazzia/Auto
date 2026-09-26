"""Повышает номер сборки в файле VERSION.

  python3 tools/bump_version.py          # 0.2 -> 0.3 (минорная, по умолчанию)
  python3 tools/bump_version.py major    # 0.9 -> 1.0 (только по решению владельца проекта)

После повышения пересоберите прототип: python3 tools/build_prototype.py
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "VERSION")

major, minor = (int(x) for x in open(PATH).read().strip().split("."))
if len(sys.argv) > 1 and sys.argv[1] == "major":
    major, minor = major + 1, 0
else:
    minor += 1
open(PATH, "w").write("%d.%d\n" % (major, minor))
print("Сборка %d.%d" % (major, minor))
