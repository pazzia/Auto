"""Собирает веб-прототип в app/src/main/assets/www/ из экранов макета и кода в web/.

Запуск: python3 tools/build_prototype.py [папка с .dc.html, по умолчанию design]
Результат: index.html (все 25 экранов) + api.js, car.js, services.js, map/podmoskovye.svg.
Та же папка публикуется на GitHub Pages и упаковывается в APK.
"""
import re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "design")
if not os.path.isabs(SRC):
    SRC = os.path.join(ROOT, SRC) if not os.path.isdir(SRC) else SRC
WEB = os.path.join(ROOT, "web")
JS_FILES = ["api.js", "car.js", "services.js"]
OUT = os.path.join(ROOT, "app/src/main/assets/www")
NAMES = ["Garage", "AddCar", "Reminders", "History", "OneTapTO", "Main", "Results", "Offers",
         "Compare", "Cart", "Services", "ServiceBooking", "BookingDone",
         "Fines", "Tires", "Insurance", "SOS", "Subscription", "Wallet", "Budget",
         "RepairLive", "Warranty", "CarPassport", "Family", "Community"]
ACC = "#C2410C"

BINDS = [  # текст макета -> поле авто
    ("Kia Rio IV · 1.6 AT · 2019", "chip"),
    ("2019 · 1.6 MPI · АКПП · седан", "specs"),
    ("А 123 ВС 177", "plate"),
    ("XWE•••••1234", "vinMasked"),
    ("58 400 км", "mileage"),
]

def screen(name):
    if name == "AddCar":
        return open(os.path.join(WEB, "addcar.html"), encoding="utf-8").read()
    s = open(os.path.join(SRC, name + ".dc.html"), encoding="utf-8").read()
    body = s[s.index("</helmet>") + 9:s.index("</x-dc>")].strip()
    body = body.replace("{{accent}}", ACC)
    body = re.sub(r'href="(\w+)\.dc\.html"', r'href="#\1"', body)
    body = body.replace('href="#"', 'href="javascript:void(0)"')
    for i, (text, key) in enumerate(BINDS):
        body = body.replace(text, "@@%d@@" % i)
    body = body.replace("Kia Rio IV", '<span data-car="name">Kia Rio IV</span>')
    for i, (text, key) in enumerate(BINDS):
        body = body.replace("@@%d@@" % i, '<span data-car="%s">%s</span>' % (key, text))
    body = body.replace('<button style="align-self: flex-start; min-height: 36px;',
                        '<button data-action="mileage" style="align-self: flex-start; min-height: 36px;')
    assert "{{" not in body and "sc-if" not in body, name
    return '<section class="screen" id="s-%s" data-name="%s">\n%s\n</section>' % (name, name, body)

CSS = open(os.path.join(WEB, "app.css"), encoding="utf-8").read()
APP = open(os.path.join(WEB, "app.js"), encoding="utf-8").read()
MAP = open(os.path.join(WEB, "map", "podmoskovye.svg"), encoding="utf-8").read().strip()
SCRIPTS = "\n".join('<script src="%s"></script>' % f for f in JS_FILES)
html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F3F1EC">
<title>АвтоХаб</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
%s
</style>
</head>
<body>
%s
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<template id="map-podmoskovye">%s</template>
%s
<script>
%s
</script>
</body>
</html>
""" % (CSS, "\n".join(screen(n) for n in NAMES), MAP, SCRIPTS, APP)
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)
import shutil
for f in JS_FILES:
    shutil.copy(os.path.join(WEB, f), os.path.join(OUT, f))
os.makedirs(os.path.join(OUT, "map"), exist_ok=True)
shutil.copy(os.path.join(WEB, "map", "podmoskovye.svg"), os.path.join(OUT, "map", "podmoskovye.svg"))
print("ok", OUT, len(html), "символов")
