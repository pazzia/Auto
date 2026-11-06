const test = require('node:test');
const assert = require('node:assert/strict');
const {extract} = require('../web/document-parser.js');
const lines = (...text) => text.map((t,i) => ({text:t,page:i>8?2:1,confidence:95}));
test('local extraction: completed works, materials, date and mileage', () => {
 const d=extract(lines('Заказ-наряд № А-125','VIN: XWEFC41ABKC001234','Пробег: 125 400 км','Дата открытия: 01.10.2026','Дата закрытия: 02.10.2026','Автосервис: Тест','Выполненные работы','Замена масла 1 900,00','Запчасти','Масло моторное','Рекомендуется заменить ремень','Итого к оплате: 3 900,00'));
 assert.equal(d.fields.mileage.value,125400);assert.equal(d.fields.date.value,'2026-10-02');assert.equal(d.fields.total.value,3900);assert.equal(d.fields.number.value,'А-125');
 assert.deepEqual(d.items.map(r=>r.kind),['work','part']);assert.equal(d.items[0].total,null);
 assert.ok(d.items.every(r=>!r.name.includes('ремень')));
});
test('ambiguous fields, impossible dates and invalid VIN remain unknown',()=>{
 const d=extract(lines('Пробег: 10000 км','Пробег: 20000 км','Дата закрытия: 31.02.2026','Дата печати: 01.10.2026','VIN: XWEFC41ABKC00123I','Итого работы: 100,00'));
 for(const k of ['mileage','date','vin','total']) assert.equal(d.fields[k].value,null);
 assert.ok(d.warnings.length);
});
test('repeat values on multiple pages are not ambiguous; zero is valid',()=>{
 const d=extract(lines('Пробег: 0 км','Пробег: 0 км','Итого к оплате: 0,00'));
 assert.equal(d.fields.mileage.value,0);assert.equal(d.fields.total.value,0);
});
test('offline UI and native bridge contain no network transports or server settings',()=>{
 const fs=require('node:fs');
 const ui=fs.readFileSync('web/documents.js','utf8');
 const native=fs.readFileSync('app/src/main/java/ru/autohub/app/NativeOcr.kt','utf8')+fs.readFileSync('app/src/main/java/ru/autohub/app/OfflineOcrEngine.kt','utf8');
 assert.doesNotMatch(ui,/fetch\s*\(|XMLHttpRequest|ocrToken|ocrUrl/);
 assert.doesNotMatch(native,/HttpURLConnection|java\.net|okhttp|https?:\/\//);
 assert.match(ui,/AutoHubDocumentParser\.extract/);
});

test('table form: completion date, adjacent mileage/VIN, typed columns, grand total', () => {
 const input = [
  'Заказ-наряд № TEST-42',
  'Дата, время приема 14.04.2024 18:42 Дата выполнения работ 15.04.2024 18:43',
  'Поставщик ИНН: 0000000000, ООО «Тестовый сервис»',
  'VIN:', 'XWEFC41ABKC001234', 'Пробег', '123456',
  'Выполнены работы, использованы запчасти и материалы:',
  'Список работ Кол-во Сумма',
  'Диагностика блоков управления 1 800,00',
  'Свечи зажигания с/у 1 800,00',
  'Масло в АКПП проверка, корректировка 1 500,00',
  'Итого: 2 100,00',
  'Запчасти и материалы Кол Цена Сумма',
  'Свеча накаливания 4 180,00 720,00',
  'Масло трансмиссионное DEXRON бочковое 1 850,00 850,00',
  'Итого: 1 570,00',
  'Стоимость без скидки: 3 670,00 Скидка: 0,00 Итого: 3 670,00',
  'Рекомендации', 'Список работ Кол-во Сумма', 'Замена сальника 1 12 484,00', 'Итого: 12 484,00'
 ].map(text=>({text,page:1,confidence:95}));
 const d=extract(input);
 assert.equal(d.fields.number.value,'TEST-42');
 assert.equal(d.fields.date.value,'2024-04-15');
 assert.equal(d.fields.mileage.value,123456);
 assert.equal(d.fields.vin.value,'XWEFC41ABKC001234');
 assert.equal(d.fields.service.value,'ООО «Тестовый сервис»');
 assert.equal(d.fields.total.value,3670);
 assert.deepEqual(d.items.map(r=>[r.kind,r.quantity,r.price,r.total]),[
  ['work',1,null,800],['work',1,null,800],['work',1,null,500],['part',4,180,720],['part',1,850,850]
 ]);
 assert.ok(!d.items.some(r=>/сальник/.test(r.name)));
});
test('adjacent fields never cross pages and bare subtotals are not grand totals',()=>{
 const d=extract([{text:'Пробег',page:1,confidence:95},{text:'123456',page:2,confidence:95},
  {text:'VIN:',page:2,confidence:95},{text:'XWEFC41AB0C001234',page:3,confidence:95},
  {text:'Итого: 800,00',page:3,confidence:95}]);
 assert.equal(d.fields.mileage.value,null);assert.equal(d.fields.vin.value,null);assert.equal(d.fields.total.value,null);
});
test('unrecognized numeric columns remain editable source text',()=>{
 const d=extract(lines('Список работ Кол-во Сумма','Замена фильтра 1 ???','Итого: 100,00'));
 assert.equal(d.items[0].name,'Замена фильтра 1 ???');assert.equal(d.items[0].total,null);
});

test('real table order (anonymized OCR): all fields, rows by section, recommendations excluded', () => {
 const {extractBest} = require('../web/document-parser.js');
 const text = require('node:fs').readFileSync('tests/fixtures/order-table-ocr.txt','utf8').split('\n').filter(s=>s.trim()&&!s.startsWith('#'));
 const pass = t => ({lines: t.map(s=>({text:s.trim(),page:1,confidence:80}))});
 const want = {number:'41760',date:'2021-05-25',vin:'JHMCU2680CC100001',mileage:156000,service:'ООО «СТО Бастион Груп»',total:3670};
 const rows = [['work',1,null,800],['work',1,null,800],['work',1,null,500],['part',4,180,720],['part',1,850,850]];
 const check = d => {
  for (const k in want) assert.equal(d.fields[k].value, want[k], k);
  assert.deepEqual(d.items.map(i=>[i.kind,i.quantity,i.price,i.total]), rows);
  assert.ok(d.items.every(i=>!/Сальник/.test(i.name)));
 };
 check(extract(pass(text).lines));
 // второй проход прочитал закрывающую кавычку как букву, третий — мусор от таблицы: голосование даёт верный результат
 const misread = text.map(s=>s.replace('Груп»','Групз'));
 const noisy = text.map(s=>s.replace(/(\d),(\d\d)/g,'$1.$2 |').replace('156000',''));
 check(extractBest([pass(text), pass(misread), pass(noisy)]));
 check(extractBest([pass(misread), pass(text)]));
});

test('VIN without label: accepted only with valid VIN structure; OCR price kopeck error fixed by arithmetic', () => {
 assert.equal(extract(lines('Автомобиль JHMCU2680CC100001 156000')).fields.vin.value,'JHMCU2680CC100001');
 assert.equal(extract(lines('Счёт 40702810ABCD00012')).fields.vin.value,null);       // нет буквы в коде изготовителя — это не VIN
 assert.equal(extract(lines('Номер JHMCU26800C100001')).fields.vin.value,null);      // 10-й знак «0» — не код года
 const d=extract(lines('Запчасти и материалы Кол Цена Сумма','Свеча накаливания 4 180,06 720,00','Итого: 720,00'));
 assert.equal(d.items[0].price,180);assert.equal(d.items[0].total,720);
});

test('Cyrillic document numbers and quantity from arithmetic when the column is unreadable', () => {
 assert.equal(extract(lines('Заказ-наряд № ЗН-00731 от 02.09.2025')).fields.number.value,'ЗН-00731');
 const d=extract(lines('Запчасти и материалы Кол Цена Сумма','Фильтр воздушный % 780,00 780,00','Замена фильтра i 350,00','Итого: 1 130,00'));
 assert.deepEqual(d.items.map(i=>[i.quantity,i.price,i.total]),[[1,780,780],[1,null,350]]);
});

// ---- Ревью 0.16: ловушки итога, пробега и даты ----
const field = (k, ...t) => extract(lines(...t)).fields[k].value;

test('total with discount: the amount "без скидки" never wins over the discounted total', () => {
 // строка «без скидки … Скидка N%: X» без итога — итог = без скидки − скидка (арифметика сходится)
 assert.equal(field('total','Итого без скидки: 6 000,00 Скидка 10%: 600,00'), 5400);
 assert.equal(field('total','Итого без скидки: 6 000,00 Скидка 10%: 600,00','Итого со скидкой: 5 400,00'), 5400);
 assert.equal(field('total','Итого без скидки: 6 000,00 Скидка 10%: 600,00 Итого со скидкой: 5 400,00'), 5400);
 assert.equal(field('total','Итого со скидкой: 5 400,00'), 5400);
 assert.equal(field('total','Сумма с учётом скидки: 5 400,00'), 5400);
 assert.equal(field('total','Стоимость без скидки: 6 000,00','Скидка: 600,00'), 5400);
 // процент не сходится с суммой скидки (скидка только на работы?) — итог не угадываем
 assert.equal(field('total','Итого без скидки: 6 000,00 Скидка 10%: 300,00'), null);
 // скидка только в процентах — сумма итогов разделов (до скидки) не становится итогом
 assert.equal(field('total','Работы','Итого: 1 000,00','Запчасти','Итого: 2 000,00','Скидка 5%'), null);
 assert.equal(field('total','Работы','Итого: 1 000,00','Запчасти','Итого: 2 000,00'), 3000);
});

test('total is money, not a count: «К оплате 2 позиции на сумму 3 000,00»', () => {
 assert.equal(field('total','К оплате 2 позиции на сумму 3 000,00'), 3000);
 assert.equal(field('total','Итого к оплате 3 наименования на сумму 3 000'), 3000);
 assert.equal(field('total','Итого к оплате: 2 шт.'), null);
 assert.equal(field('total','Итого к оплате на 01.10.2026: 5 400,00'), 5400);
 assert.equal(field('total','Итого к оплате: 5 400 руб.'), 5400);
 assert.equal(field('total','Итого к оплате: 3900'), 3900);
 assert.equal(field('total','Итого к оплате 3 900'), 3900);
});

test('VAT "в том числе" is not the total and not a work row', () => {
 assert.equal(field('total','Итого к оплате, в т.ч. НДС 20%: 900,00'), null);
 assert.equal(field('total','Итого к оплате, в т.ч. НДС 20%: 900,00 5 400,00'), 5400);
 assert.equal(field('total','Итого к оплате: 5 400,00 в том числе НДС (20%) 900,00'), 5400);
 assert.equal(field('total','Итого к оплате с НДС 20%: 5 400,00'), 5400);
 const d=extract(lines('Запчасти и материалы Кол Цена Сумма','Фильтр масляный 1 420,00 420,00','В том числе НДС 20%: 70,00','Итого к оплате: 420,00'));
 assert.deepEqual(d.items.map(i=>i.name),['Фильтр масляный']);
 assert.equal(d.fields.total.value,420);
});

test('mileage thousands separators: space, dot, NBSP, narrow NBSP; no truncation', () => {
 for (const s of ['125 400','125.400','125 400','125 400','125 400','125400'])
  assert.equal(field('mileage','Пробег: '+s+' км'),125400,s);
 assert.equal(field('mileage','Пробег, км: 125 400'),125400);
 assert.equal(field('mileage','Пробег (км): 125.400'),125400);
 assert.equal(field('mileage','Пробег: 125 тыс. км'),null);   // не «12»
 assert.equal(field('mileage','Пробег: 50 000 миль'),null);    // не километры
 assert.equal(field('mileage','Пробег: 01.10.2026'),null);     // дата, не пробег
 assert.equal(field('mileage','Пробег: 125,40'),null);         // копейки, не пробег
 assert.equal(field('mileage','Пробег 87 450 2019 г.в.'),87450);
 const t=extract([{text:'VIN: Пробег',page:1,confidence:90},{text:'XTAGFK330KY123456 87.450',page:1,confidence:90}]);
 assert.equal(t.fields.mileage.value,87450);
 assert.equal(extract([{text:'Пробег',page:1,confidence:90},{text:'125.400',page:1,confidence:90}]).fields.mileage.value,125400);
});

test('reception/print/registration dates are never the service date', () => {
 assert.equal(field('date','Дата приема на обслуживание: 01.03.2026'), null);
 assert.equal(field('date','Дата приёма на обслуживание: 01.03.2026'), null);
 assert.equal(field('date','Дата печати обслуживания: 01.03.2026'), null);
 assert.equal(field('date','Дата оформления заказа на обслуживание 01.03.2026'), null);
 assert.equal(field('date','Дата приёма на обслуживание: 01.03.2026','Дата выполнения работ: 03.03.2026'), '2026-03-03');
 assert.equal(field('date','Дата обслуживания: 03.03.2026'), '2026-03-03');
 assert.equal(field('date','Дата закрытия: 03.03.2026'), '2026-03-03');
 assert.equal(field('date','Дата, время приёма 01.03.2026 10:00 Дата выполнения работ 03.03.2026 18:00'), '2026-03-03');
});

test('neighbouring traps: next-service date/mileage, "без скидки к оплате", VAT in brackets, mileage label variants', () => {
 assert.equal(field('date','Следующее техническое обслуживание: 01.03.2027'), null);
 assert.equal(field('date','Гарантия на обслуживание до 01.03.2027'), null);
 assert.equal(field('date','Плановое обслуживание 01.03.2027'), null);
 assert.equal(field('mileage','Следующее ТО: пробег 135 000 км'), null);
 assert.equal(field('mileage','Пробег: 125 400 км','Следующее ТО: пробег 135 000 км'), 125400);
 assert.equal(field('mileage','Пробег автомобиля: 125 400 км'), 125400);
 assert.equal(field('mileage','Показания одометра: 125 400'), 125400);
 assert.equal(field('total','Итого без скидки к оплате: 6 000,00'), null);
 assert.equal(field('total','Итого к оплате (в т.ч. НДС 900,00): 5 400,00'), 5400);
 assert.equal(field('total','Сумма НДС: 900,00','Итого к оплате: 5 400,00'), 5400);
 assert.equal(field('total','Итого к оплате: НДС не облагается'), null);
});

test('parser regexes run on old Android WebView (minSdk 26): no lookbehind', () => {
 assert.doesNotMatch(require('node:fs').readFileSync('web/document-parser.js','utf8'), /\(\?<[!=]/);
});
