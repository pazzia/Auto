"""Генерирует статическую схему Подмосковья: web/map/podmoskovye.svg.

Запуск: python3 tools/make_map.py

Координаты упрощённые (схема для прототипа, не для навигации).
Проекция равнопромежуточная, единица viewBox = 1 км:
    x = (lon - LON0) * KX,  y = (LAT0 - lat) * KY
Те же параметры записываются в атрибуты data-* корня SVG, по ним web/services.js
ставит метки сервисов.
"""
import math, os

LON0, LAT0 = 35.0, 57.0
KX = 111.32 * math.cos(math.radians(55.75))  # км в градусе долготы на широте Москвы
KY = 111.2
W, H = 335, 312
CENTER = (55.751, 37.617)  # Кремль
MKAD_R = 17.4
CKAD_R = 55.0

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "map", "podmoskovye.svg")


def xy(lat, lon):
    return (round((lon - LON0) * KX, 1), round((LAT0 - lat) * KY, 1))


def path(points, close=False):
    pts = [xy(la, lo) for la, lo in points]
    d = "M" + " L".join("%s %s" % p for p in pts)
    return d + (" Z" if close else "")


# Граница области (грубо, по часовой стрелке от запада), (lat, lon)
BORDER = [
    (55.95, 35.15), (56.25, 35.40), (56.45, 35.90), (56.55, 36.50), (56.80, 36.90),
    (56.78, 37.20), (56.96, 37.60), (56.85, 38.00), (56.60, 38.30), (56.40, 38.60),
    (56.05, 39.10), (55.95, 39.30), (55.75, 39.85), (55.50, 40.20), (55.20, 40.10),
    (54.90, 39.40), (54.60, 39.00), (54.25, 38.80), (54.35, 38.40), (54.65, 38.10),
    (54.80, 37.70), (54.85, 37.30), (54.95, 36.90), (55.20, 36.50), (55.35, 36.10),
    (55.45, 35.70), (55.60, 35.30),
]

# Вылетные магистрали: подпись и точки после МКАД
ROADS = [
    ("М-10", [(55.99, 37.19), (56.18, 36.98), (56.33, 36.73), (56.53, 36.52)]),
    ("А-104", [(55.95, 37.55), (56.34, 37.52), (56.73, 37.17)]),
    ("М-8", [(55.91, 37.73), (56.01, 37.85), (56.31, 38.13), (56.52, 38.40)]),
    ("А-103", [(55.85, 37.85), (55.92, 37.97), (55.97, 38.25)]),
    ("М-7", [(55.80, 37.94), (55.85, 38.44), (55.78, 38.65), (55.88, 39.05)]),
    ("М-5", [(55.68, 37.90), (55.43, 38.26), (55.10, 38.75), (54.88, 39.25)]),
    ("М-4", [(55.45, 37.75), (55.00, 37.95), (54.83, 38.15), (54.55, 38.30)]),
    ("М-2", [(55.43, 37.55), (55.14, 37.47), (54.93, 37.43), (54.83, 37.47)]),
    ("М-3", [(55.55, 37.07), (55.39, 36.73), (55.25, 36.35)]),
    ("М-1", [(55.68, 37.28), (55.58, 36.70), (55.49, 36.03), (55.47, 35.50)]),
    ("М-9", [(55.82, 37.30), (55.91, 36.86), (56.00, 35.96), (55.98, 35.25)]),
]

RIVERS = [
    ("Ока", [(54.88, 37.10), (54.90, 37.42), (54.85, 37.70), (54.85, 38.15), (54.95, 38.40),
             (55.08, 38.77), (55.00, 39.05), (54.85, 39.35)]),
    ("Москва-река", [(55.55, 35.90), (55.68, 36.20), (55.65, 36.50), (55.72, 36.86), (55.78, 37.20),
                     (55.75, 37.40), (55.74, 37.62), (55.65, 37.85), (55.55, 38.00), (55.42, 38.26),
                     (55.35, 38.50), (55.32, 38.68), (55.10, 38.78)]),
]

# Города: (название, lat, lon, ранг) — ранг 1 виден всегда, 2 — при приближении
TOWNS = [
    ("Химки", 55.889, 37.445, 1), ("Мытищи", 55.911, 37.730, 1), ("Балашиха", 55.796, 37.938, 1),
    ("Люберцы", 55.676, 37.893, 1), ("Подольск", 55.431, 37.545, 1), ("Одинцово", 55.678, 37.278, 1),
    ("Красногорск", 55.831, 37.330, 1), ("Королёв", 55.922, 37.854, 2), ("Зеленоград", 55.991, 37.214, 2),
    ("Домодедово", 55.437, 37.766, 1), ("Сергиев Посад", 56.315, 38.136, 1), ("Коломна", 55.103, 38.753, 1),
    ("Серпухов", 54.913, 37.411, 1), ("Клин", 56.331, 36.729, 1), ("Дмитров", 56.344, 37.521, 1),
    ("Ногинск", 55.854, 38.441, 1), ("Орехово-Зуево", 55.806, 38.962, 1), ("Наро-Фоминск", 55.386, 36.734, 1),
    ("Можайск", 55.508, 36.024, 1), ("Волоколамск", 56.035, 35.959, 1), ("Истра", 55.915, 36.861, 2),
    ("Дубна", 56.732, 37.167, 1), ("Егорьевск", 55.383, 39.036, 1), ("Кашира", 54.834, 38.151, 1),
    ("Чехов", 55.143, 37.470, 2), ("Раменское", 55.567, 38.230, 2), ("Щёлково", 55.924, 37.972, 2),
    ("Пушкино", 56.011, 37.847, 2), ("Шатура", 55.577, 39.544, 1), ("Воскресенск", 55.323, 38.681, 2),
    ("Солнечногорск", 56.185, 36.977, 2), ("Руза", 55.701, 36.195, 2), ("Зарайск", 54.762, 38.884, 2),
    ("Талдом", 56.731, 37.527, 2), ("Лобня", 56.012, 37.475, 2), ("Долгопрудный", 55.933, 37.514, 2),
    ("Видное", 55.551, 37.709, 2), ("Реутов", 55.759, 37.855, 2), ("Жуковский", 55.599, 38.117, 2),
    ("Электросталь", 55.785, 38.444, 2), ("Ступино", 54.886, 38.078, 2), ("Звенигород", 55.730, 36.855, 2),
    ("Нахабино", 55.842, 37.183, 2), ("Дедовск", 55.870, 37.122, 2),
]


def ring_from_mkad(first_wp):
    """Точка на МКАД в направлении первой точки трассы."""
    cx, cy = xy(*CENTER)
    fx, fy = xy(*first_wp)
    d = math.hypot(fx - cx, fy - cy)
    return (round(cx + (fx - cx) / d * MKAD_R, 1), round(cy + (fy - cy) / d * MKAD_R, 1))


def road_d(wps):
    sx, sy = ring_from_mkad(wps[0])
    pts = [(sx, sy)] + [xy(*p) for p in wps]
    return "M" + " L".join("%s %s" % p for p in pts)


def main():
    cx, cy = xy(*CENTER)
    o = []
    o.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
             'data-lon0="%s" data-lat0="%s" data-kx="%.4f" data-ky="%.4f" '
             'role="img" aria-label="Схема Московской области">' % (W, H, LON0, LAT0, KX, KY))
    o.append('<title>Подмосковье — схема для прототипа АвтоХаб</title>')
    o.append('<style>.map-towns text,.map-roads text{paint-order:stroke;stroke:#F6F4EF;stroke-width:3px;stroke-linejoin:round;'
             'vector-effect:non-scaling-stroke}</style>')
    o.append('<rect x="-400" y="-400" width="%d" height="%d" fill="#E4E0D6"/>' % (W + 800, H + 800))
    o.append('<path d="%s" fill="#F6F4EF" stroke="#C9C3B6" stroke-width="1.2" stroke-dasharray="4 3" '
             'vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' % path(BORDER, True))
    # реки
    o.append('<g fill="none" stroke="#C9DAE8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" '
             'vector-effect="non-scaling-stroke">')
    for name, pts in RIVERS:
        o.append('<path d="%s" vector-effect="non-scaling-stroke"><title>%s</title></path>' % (path(pts), name))
    o.append('</g>')
    # ЦКАД (схематично — окружность)
    o.append('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#D8D2C6" stroke-width="2" '
             'stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>' % (cx, cy, CKAD_R))
    # магистрали: подложка + белая линия
    for color, width in (("#D8D2C6", 5), ("#FFFFFF", 3)):
        o.append('<g fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">'
                 % (color, width))
        for name, wps in ROADS:
            o.append('<path d="%s" vector-effect="non-scaling-stroke"/>' % road_d(wps))
        o.append('</g>')
    # Москва внутри МКАД
    o.append('<circle cx="%s" cy="%s" r="%s" fill="#E7E3DB" stroke="#17191C" stroke-width="2.5" '
             'vector-effect="non-scaling-stroke"/>' % (cx, cy, MKAD_R))
    # подписи трасс (в конце трассы)
    o.append('<g class="map-roads" font-size="3.5" font-family="JetBrains Mono, monospace" fill="#5B5F66" text-anchor="middle">')
    for name, wps in ROADS:
        (x1, y1), (x2, y2) = xy(*wps[-2]), xy(*wps[-1])
        x, y = round((x1 + x2) / 2, 1), round((y1 + y2) / 2, 1)
        o.append('<text x="%s" y="%s" data-rank="2">%s</text>' % (x, y, name))
    o.append('</g>')
    # города
    o.append('<g class="map-towns" font-size="4.5" font-family="Manrope, sans-serif" fill="#17191C">')
    for name, la, lo, rank in TOWNS:
        x, y = xy(la, lo)
        o.append('<g data-rank="%d"><circle cx="%s" cy="%s" r="1" fill="#5B5F66"/>'
                 '<text x="%s" y="%s" data-dx="1" data-dy="-1">%s</text></g>' % (rank, x, y, x, y, name))
    o.append('<g data-rank="0"><text x="%s" y="%s" text-anchor="middle" font-weight="700" font-size="5" data-fs="12" '
             'font-family="Unbounded, sans-serif">МОСКВА</text></g>' % (cx, cy))
    o.append('<g data-rank="1"><text x="%s" y="%s" text-anchor="middle" fill="#9A958B" font-size="4" data-fs="9">'
             'ЦКАД</text></g>' % (cx, round(cy - CKAD_R - 1.5, 1)))
    o.append('</g>')
    o.append('</svg>')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(o) + "\n")
    print("ok", OUT)


if __name__ == "__main__":
    main()
