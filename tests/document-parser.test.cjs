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
