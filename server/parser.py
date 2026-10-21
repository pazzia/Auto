"""Conservative extraction. Unknown/ambiguous values stay null; no inferred maintenance."""
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation


def money(value):
    try:
        n = Decimal(re.sub(r'[\s\u00a0]', '', value).replace(',', '.'))
        return float(n) if n.is_finite() and 0 <= n <= 100_000_000 else None
    except InvalidOperation:
        return None


def extract(lines):
    fields = {k: {'value': None, 'evidence': []} for k in
              ('date', 'mileage', 'vin', 'number', 'service', 'total')}
    candidates = {k: [] for k in fields}
    items, warnings = [], []
    section = None
    for line in lines:
        text = line['text'].strip()
        low = text.lower().replace('ё', 'е')
        def add(key, value):
            if value is not None:
                candidates[key].append((value, {'page': line['page'], 'text': text,
                    'box': line.get('box'), 'confidence': line.get('confidence')}))
        m = re.search(r'(?:пробег|одометр)\s*[:=]?\s*(\d(?:[\d \u00a0]*\d)?)\s*(?:км|km|$)', low)
        if m:
            n = int(re.sub(r'\s', '', m[1]))
            if n <= 3_000_000: add('mileage', n)
        m = re.search(r'\bVIN\s*[:=]?\s*([A-HJ-NPR-Z0-9]{17})\b', text, re.I)
        if m: add('vin', m[1].upper())
        m = re.search(r'(?:заказ[ -]*наряд|наряд[ -]*заказ)\s*(?:№|N|номер|#)\s*([\w/.-]+)', text, re.I)
        if m: add('number', m[1])
        m = re.search(r'(?:дата\s*(?:выполнения|закрытия|обслуживания)|работы выполнены)\s*[:=]?\s*(\d{2}[./-]\d{2}[./-]\d{4})', low)
        if m:
            try: add('date', datetime.strptime(re.sub('[/-]', '.', m[1]), '%d.%m.%Y').date().isoformat())
            except ValueError: warnings.append('Некорректная дата: ' + m[1])
        m = re.search(r'^(?:автосервис|исполнитель|сервис)\s*:\s*(.+)$', text, re.I)
        if m: add('service', m[1])
        m = re.search(r'^(?:всего к оплате|итого к оплате|итого по заказу|общая сумма)\s*[:=]?\s*([\d\s]+(?:[.,]\d{2})?)', low)
        if m: add('total', money(m[1]))
        if re.search(r'рекомендац|рекомендован|планируем|предварительн', low):
            section = None
            warnings.append('Есть рекомендации или предварительные работы. Проверьте статус документа.')
            continue
        if re.match(r'^(?:выполненные работы|наименование работ|работы)(?:\s|:|$)', low):
            section = 'work'; continue
        if re.match(r'^(?:запасные части|запчасти|материалы|запчасти и материалы)(?:\s|:|$)', low):
            section = 'part'; continue
        if re.match(r'^(?:итого|всего|подпись|заказчик|исполнитель|гарантия|ндс|к оплате)', low):
            section = None
        if section and text and not re.search(r'наименование|кол-во|количество|цена|стоимость|сумма', low):
            # Preserve the row verbatim. Never guess column meaning from the last number.
            items.append({'kind': section, 'name': text, 'quantity': None, 'price': None,
                          'total': None, 'page': line['page'], 'sourceText': text})
    for key, values in candidates.items():
        distinct = list(dict.fromkeys(v for v, _ in values))
        fields[key]['evidence'] = [e for _, e in values]
        if len(distinct) == 1: fields[key]['value'] = distinct[0]
        elif len(distinct) > 1: warnings.append('Несколько значений поля «' + key + '»: выберите вручную.')
    if not fields['date']['value']:
        warnings.append('Дата выполнения не определена. Дата открытия/печати не считается датой обслуживания.')
    if items:
        warnings.append('Строки работ и материалов — черновик OCR. Проверьте переносы, колонки и суммы по оригиналу.')
    else:
        warnings.append('Разделы работ и материалов не выделены. Добавьте строки вручную по распознанному тексту.')
    if any(l.get('confidence', 100) < 65 for l in lines):
        warnings.append('Есть текст с низкой уверенностью распознавания. Проверьте оригинал.')
    return {'fields': fields, 'items': items, 'warnings': list(dict.fromkeys(warnings)), 'lines': lines}
