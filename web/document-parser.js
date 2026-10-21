/* AUTO-39: deterministic extraction on the device, no network or LLM. */
(function (root) {
  'use strict';
  function extract(lines) {
    var fields = {}, candidates = {}, items = [], warnings = [], section = null, columns = 0, recommendations = false;
    ['date', 'mileage', 'vin', 'number', 'service', 'total'].forEach(function (k) { fields[k] = {value: null, evidence: []}; candidates[k] = []; });
    lines.forEach(function (line, index) {
      var text = line.text.trim(), low = text.toLowerCase().replace(/ё/g, 'е'), m;
      function add(k, value) { if (value !== null) candidates[k].push({value: value, evidence: {page: line.page, text: text, box: line.box || null, confidence: line.confidence}}); }
      m = low.match(/(?:пробег|одометр)\s*[:=]?\s*(\d(?:[\d \u00a0]*\d)?)\s*(?:км|km|$)/);
      if (m) { var n = Number(m[1].replace(/\s/g, '')); if (n <= 3000000) add('mileage', n); }
      var previous = index > 0 && lines[index - 1].page === line.page ? lines[index - 1].text.trim() : '';
      if (/^(?:пробег|одометр)\s*[:=]?$/i.test(previous) && /^\d[\d \u00a0]*(?:\s*(?:км|km))?$/i.test(text)) {
        var adjacentKm = Number(text.replace(/(?:км|km)|\s/gi, ''));
        if (adjacentKm <= 3000000) add('mileage', adjacentKm);
      }
      if (/\bVIN\s*[:=]?\s*$/i.test(previous) && /^[A-HJ-NPR-Z0-9]{17}$/i.test(text)) add('vin', text.toUpperCase());
      m = text.match(/\bVIN\s*[:=]?\s*([A-HJ-NPR-Z0-9]{17})\b/i); if (m) add('vin', m[1].toUpperCase());
      m = text.match(/(?:заказ[ -]*наряд|наряд[ -]*заказ)\s*(?:№|N|номер|#)\s*([\wА-Яа-я/.-]+)/i); if (m) add('number', m[1]);
      m = low.match(/(?:дата\s*(?:выполнения|закрытия|обслуживания)(?:\s+работ)?|работы выполнены)\s*[:=]?\s*(\d{2})[./-](\d{2})[./-](\d{4})/);
      if (m) {
        var date = m[3] + '-' + m[2] + '-' + m[1], d = new Date(date + 'T12:00:00Z');
        if (Number.isFinite(+d) && d.toISOString().slice(0, 10) === date) add('date', date);
        else warnings.push('Некорректная дата: ' + m[0]);
      }
      m = text.match(/^(?:автосервис|исполнитель|сервис)\s*:\s*(.+)$/i); if (m) add('service', m[1]);
      m = low.match(/^(?:всего к оплате|итого к оплате|итого по заказу|общая сумма)\s*[:=]?\s*([\d\s]+(?:[.,]\d{2})?)/);
      if (m) { var amount = Number(m[1].replace(/\s/g, '').replace(',', '.')); if (Number.isFinite(amount) && amount >= 0 && amount <= 100000000) add('total', amount); }
      // A grand total row may also contain the pre-discount amount and discount.
      // Plain section subtotals and recommendation totals are never a document total.
      if (!recommendations && /^стоимость без скидки/.test(low)) {
        var grand = text.match(/итого\s*[:=]?\s*([\d \u00a0]+[.,]\d{2})\s*$/i);
        if (grand) add('total', Number(grand[1].replace(/\s/g, '').replace(',', '.')));
      }
      if (/^(?:поставщик|исполнитель)/.test(low)) {
        var supplier = text.match(/ООО\s*[«"]([^»"]+)[»"]/i);
        if (supplier) add('service', 'ООО «' + supplier[1] + '»');
      }
      if (/рекоменд|планируем|предварительн/.test(low)) { section = null; columns = 0; recommendations = true; warnings.push('Есть рекомендации или предварительные работы. Проверьте статус документа.'); return; }
      if (!recommendations && /^(?:выполнены работы|выполненные работы|список работ|наименование работ|работы)(?:\s|:|$)/.test(low)) {
        section = 'work'; columns = /кол[ -]?(?:во|ичество)?/.test(low) && /сумма/.test(low) ? (/цена/.test(low) ? 3 : 2) : 0; return;
      }
      if (!recommendations && /^(?:запасные части|запчасти|материалы)(?:\s|:|$)/.test(low)) {
        section = 'part'; columns = /кол[ -]?(?:во|ичество)?/.test(low) && /сумма/.test(low) ? (/цена/.test(low) ? 3 : 2) : 0; return;
      }
      if (section && /кол[ -]?(?:во|ичество)?/.test(low) && /сумма/.test(low)) { columns = /цена/.test(low) ? 3 : 2; return; }
      if (/^(?:итого|всего|подпись|заказчик|исполнитель|гарантия|ндс|к оплате|стоимость без скидки|сумма прописью)/.test(low)) section = null;
      if (section && text && !/наименование|кол-во|количество|цена|стоимость|сумма/.test(low)) {
        var row = {kind: section, name: text, quantity: null, price: null, total: null, page: line.page, sourceText: text};
        // Parse numeric columns only when their header was recognized. Preserve the source.
        var money = '(\\d{1,3}(?:[ \\u00a0]\\d{3})*[.,]\\d{2}|\\d+[.,]\\d{2})';
        var pattern = columns === 3 ? new RegExp('^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+' + money + '\\s+' + money + '$') :
          columns === 2 ? new RegExp('^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+' + money + '$') : null;
        var cells = pattern && text.match(pattern);
        if (cells) {
          var num = function (v) { return Number(v.replace(/\s/g, '').replace(',', '.')); };
          row.name = cells[1]; row.quantity = num(cells[2]);
          row.price = columns === 3 ? num(cells[3]) : null;
          row.total = num(cells[columns === 3 ? 4 : 3]);
        }
        items.push(row);
      }
    });
    Object.keys(fields).forEach(function (k) {
      var distinct = Array.from(new Set(candidates[k].map(function (v) { return v.value; })));
      fields[k].evidence = candidates[k].map(function (v) { return v.evidence; });
      if (distinct.length === 1) fields[k].value = distinct[0];
      if (distinct.length > 1) warnings.push('Несколько значений поля «' + k + '»: выберите вручную.');
    });
    if (!fields.date.value) warnings.push('Дата выполнения не определена. Дата открытия/печати не считается датой обслуживания.');
    warnings.push(items.length ? 'Строки работ и материалов — черновик OCR. Проверьте переносы, колонки и суммы по оригиналу.' : 'Разделы работ и материалов не выделены. Добавьте строки вручную по распознанному тексту.');
    if (lines.some(function (l) { return l.confidence < 65; })) warnings.push('Есть текст с низкой уверенностью распознавания. Проверьте оригинал.');
    return {fields: fields, items: items, warnings: Array.from(new Set(warnings)), lines: lines};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {extract: extract};
  else root.AutoHubDocumentParser = {extract: extract};
})(typeof window !== 'undefined' ? window : globalThis);

