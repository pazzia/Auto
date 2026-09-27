"""Генерирует простые экраны прототипа (шапка «назад», тело, нижняя панель) в web/*.html.

Запуск: python3 tools/make_screens.py — перезаписывает только файлы из списка SCREENS.
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACK = ('<a href="#Garage" aria-label="Назад" style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 999px; background: #FFFFFF; '
        'border: 1px solid #E2DED6; display: flex; align-items: center; justify-content: center; color: #17191C"><svg width="22" height="22" '
        'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>')
H1 = "margin: 0; font-family: Unbounded, 'Arial Black', sans-serif; font-weight: 700; font-size: 20px; line-height: 1.2"

# имя экрана, файл, заголовок, подзаголовок, id тела, нижняя панель (html или ""), доп. блок под шапкой
SCREENS = [
    ("Fuel", "fuel.html", "Заправки", "", "fuBody", '<button class="btn-accent" data-action="add">Добавить заправку</button>', ""),
    ("Budget", "budget.html", "Бюджет владения", "по вашим данным", "bdBody", "", '<div class="seg3" style="margin: 0 16px 8px"><button data-period="month" data-action="p">Месяц</button><button data-period="year" data-action="p" class="on">Год</button><button data-period="all" data-action="p">Всё время</button></div>'),
    ("Wallet", "wallet.html", "Баллы и копилка", "1 балл = 1 ₽ при оплате в приложении", "wlBody", None, ""),
    ("Docs", "docs.html", "Документы и сроки", "напомним заранее, даже без интернета", "dcBody", '<button class="btn-accent" data-action="add">Добавить документ или срок</button>', ""),
    ("Season", "season.html", "Сезонный календарь", "что сделать с машиной в этом месяце", "snBody", None, ""),
    ("Checklists", "checklists.html", "Чек-листы", "отмечайте — сохранится до следующей поездки", "clBody", '<button class="btn-dark" data-action="reset">Сбросить отметки</button>', ""),
    ("DIY", "diy.html", "Сделай сам за 5 минут", "пошагово, с картинками, без интернета", "dyBody", "", ""),
    ("BodyPhoto", "bodyphoto.html", "Состояние кузова", "перед сервисом, мойкой или арендой", "bpBody", "", ""),
    ("Calc", "calc.html", "Калькуляторы", "считают по вашим данным", "ccBody", None, ""),
    ("Achievements", "achievements.html", "Достижения", "за заботу о машине — баллы и уровень", "acBody", None, ""),
]

def page(name, title, sub, body_id, foot, extra):
    sub_id = body_id[:2] + "Sub"
    footer = "" if foot is None else f'<div id="{body_id[:2]}Foot" class="to-foot"{" hidden" if foot == "" else ""}>{foot}</div>'
    return f'''<section class="screen" id="s-{name}" data-name="{name}">
<div style="width: 390px; height: 844px; position: relative; overflow: hidden; background: #F3F1EC; display: flex; flex-direction: column">
<div style="padding: 56px 16px 10px; display: flex; align-items: center; gap: 10px; flex-shrink: 0">{BACK}<div style="min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px"><h1 id="{body_id[:2]}H1" style="{H1}">{title}</h1><span id="{sub_id}" style="font-size: 13px; color: #5B5F66">{sub}</span></div></div>
{extra}<div id="{body_id}" style="flex-grow: 1; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 12px"></div>
{footer}
</div>
</section>
'''

for name, fname, title, sub, bid, foot, extra in SCREENS:
    open(os.path.join(ROOT, "web", fname), "w", encoding="utf-8").write(page(name, title, sub, bid, foot, extra))
print("ok", len(SCREENS))
