import base64
import io
import os
from PIL import Image, ImageDraw, ImageFont
from fastapi.testclient import TestClient
from server.app import app
from server.parser import extract


def lines(*texts):
    return [{'text': t, 'page': 1, 'confidence': 95, 'box': [0, i*30, 600, i*30+25]} for i, t in enumerate(texts)]


def test_extract_and_recommendations():
    d = extract(lines('Заказ-наряд № А-125', 'VIN: XWEFC41ABKC001234', 'Пробег: 125 400 км',
        'Дата открытия: 01.10.2026', 'Дата закрытия: 02.10.2026', 'Автосервис: Тест',
        'Выполненные работы', 'Замена масла 1 900,00', 'Запчасти', 'Масло 5W-30 4 3000,00',
        'Рекомендации', 'Замена ремня 10000,00', 'Итого к оплате: 3 900,00'))
    assert d['fields']['mileage']['value'] == 125400
    assert d['fields']['date']['value'] == '2026-10-02'
    assert d['fields']['total']['value'] == 3900
    assert [r['kind'] for r in d['items']] == ['work', 'part']
    assert d['items'][0]['total'] is None  # not guessing table column semantics
    assert all('ремня' not in r['name'] for r in d['items'])


def test_ambiguous_and_invalid_fields_stay_empty():
    d = extract(lines('Пробег: 50000 км', 'Пробег: 60000 км', 'Дата печати: 01.10.2026',
        'Дата закрытия: 31.02.2026', 'VIN: XWEFC41ABKC00123I', 'Итого работы: 900,00'))
    assert all(d['fields'][k]['value'] is None for k in ['mileage', 'date', 'vin', 'total'])
    assert d['warnings']


def test_auth_limits_and_malformed(monkeypatch):
    monkeypatch.setenv('OCR_API_TOKEN', 'x'*32)
    c = TestClient(app)
    assert c.post('/v1/documents/recognize', json={'files': []}).status_code == 401
    headers = {'Authorization': 'Bearer ' + 'x'*32}
    for payload in [{'files': []}, {'files': [{'data': '!'}]}, {'files': [{'data': 'YQ=='}]}, {'files': [{'data': 'YQ=='}]*11}]:
        assert c.post('/v1/documents/recognize', headers=headers, json=payload).status_code == 422
    from server.app import lock
    lock.acquire()
    try: assert c.post('/v1/documents/recognize', headers=headers, json={}).status_code == 429
    finally: lock.release()


def sample():
    image = Image.new('RGB', (1800, 1500), 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 40)
    texts = ['Заказ-наряд № 125', 'Автосервис: Тест', 'VIN: XWEFC41ABKC001234',
             'Пробег: 125400 км', 'Дата закрытия: 02.10.2026', 'Выполненные работы',
             'Замена масла', 'Замена фильтра', 'Запчасти', 'Масло моторное 5W-30',
             'Итого к оплате: 3900,00']
    for i, text in enumerate(texts): draw.text((80, 70+i*100), text, fill='black', font=font)
    return image


def test_real_russian_image_and_scanned_pdf(monkeypatch):
    monkeypatch.setenv('OCR_API_TOKEN', 'x'*32)
    c = TestClient(app)
    for fmt in ['PNG', 'PDF']:
        b = io.BytesIO(); image = sample()
        image.save(b, format=fmt)
        response = c.post('/v1/documents/recognize', headers={'Authorization': 'Bearer ' + 'x'*32},
            json={'files': [{'data': base64.b64encode(b.getvalue()).decode()}]})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['fields']['mileage']['value'] == 125400, result
        assert result['fields']['date']['value'] == '2026-10-02', result
        assert result['fields']['total']['value'] == 3900, result
        assert result['pages'] == 1
        assert len(result['items']) >= 2
        assert result['fileHashes']
