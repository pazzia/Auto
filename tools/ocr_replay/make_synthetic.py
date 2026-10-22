"""Синтетический заказ-наряд с вымышленными данными (та же структура, что у типового наряда автосервиса)
и варианты «как с телефона»: мелкий снимок, сжатие, наклон с тенью, перспектива.
Нужен для публичной проверки на эмуляторе: реальные документы пользователей в репозиторий не кладём.

python3 tools/ocr_replay/make_synthetic.py <каталог>  → synth-*.jpg/png и synthetic-golden.json
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
for cand in (FONT, BOLD):
    if not os.path.exists(cand): sys.exit("нужен шрифт DejaVu: " + cand)
S = 2  # рисуем в 2× и уменьшаем — как фото
W, H = 1240 * S, 1754 * S
im = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(im)
f = lambda size, bold=False: ImageFont.truetype(BOLD if bold else FONT, size * S)
def t(x, y, s, size=17, bold=False, anchor="la"): d.text((x * S, y * S), s, fill=(25, 25, 25), font=f(size, bold), anchor=anchor)
def hl(y, x0=60, x1=1180): d.line((x0 * S, y * S, x1 * S, y * S), fill=(60, 60, 60), width=2 * S)
def vl(x, y0, y1): d.line((x * S, y0 * S, x * S, y1 * S), fill=(60, 60, 60), width=2 * S)

t(420, 70, "ЗАКАЗ-НАРЯД № 58214", 26, True)
t(1080, 60, "Sever Motors", 15, True)
t(60, 140, "Дата, время приема 14.03.2024 09:15     Дата выполнения работ 15.03.2024 17:40", 16)
t(1000, 140, "Техобслуживание", 16)
t(60, 190, "Поставщик", 16, True)
t(260, 190, "ИНН: 7701000001, ООО «Автотехцентр Север», р/сч: 111111 в ООО Банк, БИК: 55555", 15)
t(260, 215, "125000, Москва, ул. Примерная 1, тел: +74950000000", 15)
t(60, 255, "Владелец/Заказчик", 16, True); t(260, 255, "Петров П. П., тел. +70000000000", 15)
t(60, 300, "Автомобиль", 16, True)
t(260, 290, "LADA VESTA, Гос №:а000аа000, 2019 г.в., VIN:", 15); t(1040, 290, "Пробег", 15, True)
t(260, 315, "XTAGFK330KY123456", 15); t(1040, 315, "87450", 15)
t(330, 370, "Выполнены работы, использованы запчасти и материалы:", 18, True)
# Работы: Кол-во, Сумма
y = 410; hl(y - 8); t(70, y, "Список работ", 16, True); t(900, y, "Кол-во", 16, True); t(1080, y, "Сумма", 16, True); hl(y + 26)
works = [("Замена масла в двигателе", 1, 900), ("Замена воздушного фильтра", 1, 350), ("Диагностика подвески", 1, 1200)]
for i, (n, q, s) in enumerate(works):
    yy = y + 40 + i * 30; t(70, yy, n, 16); t(960, yy, str(q), 16, anchor="ra"); t(1170, yy, f"{s:,.2f}".replace(",", " ").replace(".", ","), 16, anchor="ra")
yy = y + 40 + len(works) * 30; t(980, yy, "Итого:", 16, True); t(1170, yy, "2 450,00", 16, True, "ra"); vl(880, y - 8, yy - 6); vl(1000, y - 8, yy - 6)
# Запчасти: Кол, Цена, Сумма
y = yy + 50; hl(y - 8); t(70, y, "Запчасти и материалы", 16, True); t(840, y, "Кол", 16, True); t(940, y, "Цена", 16, True); t(1080, y, "Сумма", 16, True); hl(y + 26)
parts = [("Масло моторное 5W-40", 4, 650), ("Фильтр масляный", 1, 420), ("Фильтр воздушный", 1, 780)]
for i, (n, q, p) in enumerate(parts):
    yy = y + 40 + i * 30; m = lambda v: f"{v:,.2f}".replace(",", " ").replace(".", ",")
    t(70, yy, n, 16); t(870, yy, str(q), 16, anchor="ra"); t(1010, yy, m(p), 16, anchor="ra"); t(1170, yy, m(q * p), 16, anchor="ra")
yy = y + 40 + len(parts) * 30; t(980, yy, "Итого:", 16, True); t(1170, yy, "3 800,00", 16, True, "ra"); vl(820, y - 8, yy - 6); vl(900, y - 8, yy - 6); vl(1030, y - 8, yy - 6)
yy += 50; t(60, yy, "Стоимость без скидки:", 16); t(400, yy, "6 250,00", 16); t(560, yy, "Скидка:", 16); t(700, yy, "0,00", 16); t(980, yy, "Итого:", 18, True); t(1170, yy, "6 250,00", 18, True, "ra")
yy += 40; t(60, yy, "Сумма прописью: Шесть тысяч двести пятьдесят рублей 00 копеек", 15)
yy += 50; t(520, yy, "Рекомендации", 18, True)
yy += 35; hl(yy - 8); t(70, yy, "Наименование", 15, True); t(860, yy, "Товары", 15, True); t(960, yy, "Работы", 15, True); t(1090, yy, "Итого", 15, True); hl(yy + 24)
yy += 35; t(70, yy, "Замена тормозных колодок передних (износ 80%)", 15); t(900, yy, "0", 15); t(1000, yy, "0", 15); t(1170, yy, "4 300", 15, anchor="ra")
yy += 70; t(60, yy, "Гарантийные обязательства: на работы 30 дней, на запасные части 6 месяцев или 10 000 км пробега.", 14)
yy += 60; t(60, yy, "Претензий к выполненным работам не имею.", 14)
yy += 60; t(60, yy, "Заказчик ________________          Мастер-приемщик ________________", 14)

base = im.resize((W // S, H // S), Image.LANCZOS)
golden = {"fields": {"number": "58214", "date": "2024-03-15", "vin": "XTAGFK330KY123456", "mileage": 87450,
                     "service": "ООО «Автотехцентр Север»", "total": 6250},
          "lines": [{"section": "work", "name": n, "qty": q, "price": None, "sum": s} for n, q, s in works] +
                   [{"section": "part", "name": n, "qty": q, "price": p, "sum": q * p} for n, q, p in parts],
          "must_not_appear_as_lines": ["Замена тормозных колодок передних (износ 80%)"]}
json.dump(golden, open(os.path.join(OUT, "synthetic-golden.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def save(img, name, q=88):
    img.save(os.path.join(OUT, name), quality=q) if name.endswith(".jpg") else img.save(os.path.join(OUT, name))
save(base.resize((700, 990), Image.LANCZOS), "synth-small.png")                       # мелкий снимок
save(base.resize((700, 990), Image.LANCZOS), "synth-small-q60.jpg", 60)               # мелкий и пережатый
save(base, "synth-a4.jpg", 85)                                                         # ровный скан
big = base.resize((1300, 1838), Image.LANCZOS)
canvas = Image.new("RGB", (big.width + 160, big.height + 160), (110, 100, 88)); canvas.paste(big, (80, 80))
rot = canvas.rotate(2.0, resample=Image.BICUBIC, fillcolor=(110, 100, 88))
a = np.asarray(rot).astype(float); h, w = a.shape[:2]
grad = np.linspace(0.72, 1.04, w)[None, :, None] * np.linspace(1.0, 0.86, h)[:, None, None]
save(Image.fromarray(np.clip(a * grad, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.9)), "synth-photo-tilt.jpg", 82)

# ---------- Документ Б: другая вёрстка (метки в строке, 3 колонки у работ, «Итого к оплате») ----------
im = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(im)
t(60, 70, "Заказ-наряд № ЗН-00731 от 02.09.2025", 24, True)
t(60, 130, "Исполнитель: ООО «Гараж 77», ИНН 7702000002, г. Москва, Складская ул., 5", 16)
t(60, 160, "Заказчик: Сидорова А. В., тел. +70000000001", 16)
t(60, 190, "Автомобиль: KIA RIO, гос. номер в000вв000, VIN: Z94CB41AAGR323456, пробег: 112 300 км", 16)
t(60, 220, "Дата окончания работ: 03.09.2025", 16)
y = 290; hl(y - 8); t(70, y, "Наименование работ", 16, True); t(760, y, "Кол-во", 16, True); t(900, y, "Цена", 16, True); t(1080, y, "Сумма", 16, True); hl(y + 26)
works_b = [("Замена тормозных колодок", 2, 1100), ("Замена тормозной жидкости", 1, 1500), ("Регулировка развала-схождения", 1, 2400)]
m = lambda v: f"{v:,.2f}".replace(",", " ").replace(".", ",")
for i, (n, q, p) in enumerate(works_b):
    yy = y + 40 + i * 30; t(70, yy, n, 16); t(820, yy, str(q), 16, anchor="ra"); t(1000, yy, m(p), 16, anchor="ra"); t(1170, yy, m(q * p), 16, anchor="ra")
yy = y + 40 + len(works_b) * 30; t(900, yy, "Итого по работам:", 16, True); t(1170, yy, "6 100,00", 16, True, "ra")
y = yy + 60; hl(y - 8); t(70, y, "Материалы", 16, True); t(760, y, "Кол-во", 16, True); t(900, y, "Цена", 16, True); t(1080, y, "Сумма", 16, True); hl(y + 26)
parts_b = [("Колодки тормозные передние", 1, 2350), ("Жидкость тормозная DOT-4", 2, 710)]
for i, (n, q, p) in enumerate(parts_b):
    yy = y + 40 + i * 30; t(70, yy, n, 16); t(820, yy, str(q), 16, anchor="ra"); t(1000, yy, m(p), 16, anchor="ra"); t(1170, yy, m(q * p), 16, anchor="ra")
yy = y + 40 + len(parts_b) * 30; t(900, yy, "Итого по материалам:", 16, True); t(1170, yy, "3 770,00", 16, True, "ra")
yy += 60; t(700, yy, "Итого к оплате: 9 870,00", 20, True)
yy += 70; t(60, yy, "Рекомендовано: замена амортизаторов задних — 7 800,00", 15)
yy += 60; t(60, yy, "Работы выполнены в полном объёме. Претензий не имею. Подпись ______________", 14)
base_b = im.resize((W // S, H // S), Image.LANCZOS)
json.dump({"fields": {"number": "ЗН-00731", "date": "2025-09-03", "vin": "Z94CB41AAGR323456", "mileage": 112300, "service": "ООО «Гараж 77»", "total": 9870},
           "lines": [{"section": "work", "name": n, "qty": q, "price": p, "sum": q * p} for n, q, p in works_b] +
                    [{"section": "part", "name": n, "qty": q, "price": p, "sum": q * p} for n, q, p in parts_b],
           "must_not_appear_as_lines": ["замена амортизаторов задних"]},
          open(os.path.join(OUT, "synthetic-b-golden.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
save(base_b.resize((720, 1018), Image.LANCZOS), "synthb-small.jpg", 80)
big = base_b.resize((1400, 1980), Image.LANCZOS)
canvas = Image.new("RGB", (big.width + 160, big.height + 160), (95, 90, 85)); canvas.paste(big, (80, 80))
rot = canvas.rotate(-3.0, resample=Image.BICUBIC, fillcolor=(95, 90, 85))
a = np.asarray(rot).astype(float); h, w = a.shape[:2]
grad = np.linspace(1.03, 0.74, w)[None, :, None] * np.linspace(0.9, 1.0, h)[:, None, None]
save(Image.fromarray(np.clip(a * grad, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.8)), "synthb-photo-tilt.jpg", 80)
print("ok", sorted(os.listdir(OUT)))
