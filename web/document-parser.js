/* AUTO-39/41: разбор наряд-заказа на телефоне, без сети и LLM.
 *
 * extract(lines)         — разбор одного прохода OCR.
 * extractBest(passes)    — несколько проходов OCR одного документа (разный масштаб и разметка):
 *                          поля выбираются голосованием, строки работ — из прохода, чьи суммы сходятся с «Итого».
 *
 * Разбор рассчитан на типичные ошибки OCR: мусор из рамок таблиц (| [ ] _ ‘), латиница вместо кириллицы
 * («OOO», «HAC»), нули вместо «О» («000 «СТО…»), испорченное первое слово («fata выполнения работ»),
 * значения под заголовком колонки («VIN: … Пробег» и строкой ниже «JHMCU… 156000»).
 * Неоднозначные поля остаются пустыми: дата приёма не становится датой ТО, рекомендации — выполненными работами.
 */
(function (root) {
  'use strict';

  var FIELDS = ['date', 'mileage', 'vin', 'number', 'service', 'total'];
  var LAT2CYR = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', '0': 'о' };
  var CYR2LAT = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  var MONEY = '\\d{1,3}(?:[ \\u00a0]\\d{3})+[.,]\\d{2}|\\d+[.,]\\d{2}';

  /** Чистка строки: рамки таблиц и типографский мусор → пробелы. */
  function clean(text) {
    return String(text || '').replace(/[|\[\]{}_‘’“”`~]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.,;:'"-]+/, '').trim();
  }
  /** Ключ для поиска слов: нижний регистр, ё→е, латинские двойники → кириллица (только внутри слов с кириллицей). */
  function key(text) {
    return clean(text).toLowerCase().replace(/ё/g, 'е').replace(/[a-z0-9а-я]+/g, function (w) {
      if (!/[а-я]/.test(w) && !/^[aceopxyhkmtb]+$/.test(w)) return w;
      return w.replace(/[abcehkmoptxy]/g, function (c) { return LAT2CYR[c] || c; });
    });
  }
  function num(v) { return Number(String(v).replace(/[\s ]/g, '').replace(',', '.')); }
  function moneyList(text) { var m = text.match(new RegExp(MONEY, 'g')); return m ? m.map(num) : []; }
  function validDate(d, m, y) {
    var iso = y + '-' + m + '-' + d, t = new Date(iso + 'T12:00:00Z');
    return Number.isFinite(+t) && t.toISOString().slice(0, 10) === iso ? iso : null;
  }

  /* ---------- VIN ---------- */
  var VIN_W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  var VIN_V = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  function vinCheck(v) {
    var s = 0; for (var i = 0; i < 17; i++) { var c = v[i]; s += (/\d/.test(c) ? +c : VIN_V[c]) * VIN_W[i]; }
    var r = s % 11; return v[8] === (r === 10 ? 'X' : String(r));
  }
  /** VIN-кандидаты в строке: кириллические двойники → латиница, O/Q → 0 (в VIN этих букв нет). */
  function vinTokens(text) {
    var up = String(text).toUpperCase().replace(/[А-ЯЁ]/g, function (c) { return CYR2LAT[c] || c; });
    return (up.match(/[A-Z0-9]{17}/g) || []).map(function (t) { return t.replace(/[OQ]/g, '0'); })
      .filter(function (t) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(t) && /\d.*\d.*\d/.test(t) && /[A-Z].*[A-Z]/.test(t); });
  }

  /* ---------- Строка таблицы: «название  [кол-во]  [цена]  сумма» ---------- */
  function parseRow(text, cols) {
    var t = clean(text).replace(/(\d)\.$/, '$1'), toks = t.split(' '), nums = [];
    while (toks.length && /^\d+(?:[.,]\d+)?$/.test(toks[toks.length - 1])) nums.unshift(toks.pop());
    var name = toks.join(' ').replace(/[\s.,:;\-]+$/, '');
    if (!nums.length || !/[A-Za-zА-Яа-яЁё]{3}/.test(name)) return null;
    // Склейка тысяч: «1 250,00» — целое из 1–3 цифр перед «ddd,dd».
    var segs = [[]];
    nums.forEach(function (n) {
      var next = [];
      segs.forEach(function (s) {
        next.push(s.concat([n]));
        var last = s[s.length - 1];
        if (last && /^\d{1,3}(?: \d{3})*$/.test(last) && /^\d{3}(?:[.,]\d{2})?$/.test(n)) next.push(s.slice(0, -1).concat([last + ' ' + n]));
      });
      segs = next;
    });
    var best = null;
    segs.forEach(function (s) {
      var k = s.length, q = null, p = null, tot = null, score = 0;
      if (cols === 3 && k === 3) { q = s[0]; p = s[1]; tot = s[2]; }
      else if (cols === 2 && k === 2) { q = s[0]; tot = s[1]; }
      else if (cols === 3 && k === 2) { q = s[0]; tot = s[1]; score -= 1; }
      else return;
      if (!/^\d+(?:[.,]\d+)?$/.test(q.replace(/ /g, '')) || / /.test(q)) return;
      var Q = num(q), P = p == null ? null : num(p), T = num(tot);
      if (!(Q > 0 && Q <= 1000)) return;
      if (/[.,]\d{2}$/.test(tot)) score += 2;
      if (P != null && /[.,]\d{2}$/.test(p)) score += 1;
      if (P != null && Math.abs(Q * P - T) < 0.6) score += 5;
      if (P == null && Q === 1) score += 1;
      if (!best || score > best.score) best = { score: score, quantity: Q, price: P, total: T };
    });
    return best ? { name: name, quantity: best.quantity, price: best.price, total: best.total } : null;
  }

  function extract(lines) {
    var fields = {}, candidates = {}, items = [], warnings = [], section = null, columns = 0, recommendations = false;
    var sections = [], cur = null, subtotalSum = [];
    FIELDS.forEach(function (k) { fields[k] = { value: null, evidence: [] }; candidates[k] = []; });

    lines.forEach(function (line, index) {
      var raw = String(line.text || ''), text = clean(raw), low = key(raw), m;
      if (!text) return;
      function add(k, value, weight) {
        if (value === null || value === undefined) return;
        candidates[k].push({ value: value, weight: weight || 1, evidence: { page: line.page, text: raw.trim(), box: line.box || null, confidence: line.confidence } });
      }
      function near(offset) { var l = lines[index + offset]; return l && l.page === line.page ? l : null; }

      // Номер документа
      m = low.match(/(?:заказ[ -]*наряд|наряд[ -]*заказ|наряд)[^№#\d]{0,6}(?:№|n[еo°]?|#|номер)\s*([0-9a-zа-я][\w\/.-]*)/i);
      if (m) { var nm = text.match(new RegExp('(?:№|N[eoо°]?|#|номер)\\s*([0-9A-Za-zА-Яа-я][\\w/.-]*)', 'i')); add('number', (nm ? nm[1] : m[1]).replace(/[.,]$/, '')); }

      // Дата выполнения: «Дата выполнения работ», «Дата закрытия», «Работы выполнены»; слово «Дата» может быть испорчено
      m = low.match(/(?:выполнени[яе](?:\s+работ)?|закрыти[яе](?:\s+заказа)?|обслуживани[яе]|работы выполнены|окончани[яе] работ|дата выдачи)[^\d]{0,12}(\d{2})[./-](\d{2})[./-](\d{4})/);
      if (m) { var d = validDate(m[1], m[2], m[3]); if (d) add('date', d, 2); else warnings.push('Некорректная дата: ' + m[0]); }

      // Пробег: «Пробег: 125 400 км» в строке…
      m = low.match(/(?:пробег(?!а)|одометр)\s*[:=]?\s*(?:км\s*)?(\d{1,3}(?:[  ]\d{3})+|\d{1,7})(?!\s*тыс)(?![.,]\d)/);
      if (m) { var mv = num(m[1]); if (mv <= 3000000) add('mileage', mv, 2); }
      // …или заголовок колонки «Пробег», а значение — на строке ниже (последнее число строки)
      else if (/(?:^|\s)(?:пробег(?!а)|одометр)\s*[:=]?\s*(?:км)?\s*$/.test(low) || (/пробег(?!а)/.test(low) && /vin|вин/.test(low) && !/\d{3}/.test(low.split(/пробег/)[1] || ''))) {
        for (var o = 1; o <= 2; o++) {
          var nl = near(o); if (!nl) break;
          var nt = clean(nl.text).replace(/[A-Za-z0-9]{17}/g, ' ').replace(/\d{2}[./]\d{2}[./]\d{2,4}/g, ' ').replace(/\+?\d[\d\- ]{9,}\d/g, ' ');
          var ints = (nt.match(/(?:^|\s)(\d{1,3}(?: \d{3})+|\d{2,7})(?:\s*(?:км|km))?(?=\s|$)/gi) || []).map(function (s) { return num(s.replace(/км|km/i, '')); });
          if (ints.length) { var last = ints[ints.length - 1]; if (last >= 10 && last <= 3000000) add('mileage', last, 2); break; }
        }
      }

      // VIN: в строке или ниже метки VIN; без метки — тоже кандидат, но с меньшим весом
      var labeled = /vin|вин/i.test(low);
      // без метки VIN — только с верной контрольной цифрой (иначе это может быть любой 17-значный номер)
      vinTokens(raw).forEach(function (v) { if (labeled || vinCheck(v)) add('vin', v, (labeled ? 3 : 1) + (vinCheck(v) ? 1 : 0)); });
      if (labeled) for (var vo = 1; vo <= 2; vo++) { var vl = near(vo); if (!vl) break; vinTokens(vl.text).forEach(function (v) { add('vin', v, 3 + (vinCheck(v) ? 1 : 0)); }); }

      // Исполнитель: «ООО «Название»», в том числе «OOO»/«000» и без закрывающей кавычки
      var org = text.replace(/(^|[^A-Za-zА-Яа-я0-9])(?:OOO|0OO|O0O|00O|000|ООО|0ОО|О0О)(?=\s*[«"“])/g, '$1ООО').match(/(?:^|[^A-Za-zА-Яа-я0-9])(ООО|ОАО|ЗАО|ПАО|АО|ИП)\s*[«"“]\s*([^»"”,]{2,60})/);
      if (org && !/банк/i.test(org[2])) add('service', org[1] + ' «' + org[2].trim() + '»', /поставщ|исполнит|инн/.test(low) ? 3 : 1);
      m = text.match(/^(?:автосервис|исполнитель|сервис)\s*:\s*(.+)$/i); if (m) add('service', m[1].trim(), 2);

      // Итог документа
      m = low.match(/(?:всего к оплате|итого к оплате|итого по заказу|общая сумма|к оплате)\s*[:=]?\s*(\d[\d  ]*(?:[.,]\d{2})?)/);
      if (m) { var am = num(m[1]); if (Number.isFinite(am) && am <= 100000000) add('total', am, 3); }
      if (!recommendations && /без скидки/.test(low) && /итого/.test(low)) {
        var g = text.match(new RegExp('итого\\s*[:=]?\\s*(' + MONEY + ')', 'i')) || text.match(new RegExp('(' + MONEY + ')\\s*$'));
        if (g) add('total', num(g[1]), 3);
      }

      // Разделы работ и материалов
      if (/рекоменд|планируем|предварительн/.test(low)) {
        if (!recommendations) warnings.push('Есть рекомендации или предварительные работы — они не считаются выполненными.');
        section = null; columns = 0; recommendations = true; return;
      }
      if (recommendations) return;
      var head = low.replace(/^[^а-яa-z]+/, '');
      var hasCols = /кол(?:[ -.]?(?:во|ичество))?(?![а-яa-z])/.test(low) && /сумма|стоим/.test(low), nCols = /цена/.test(low) ? 3 : 2;
      if (/^(?:выполнены работы|выполненные работы|работы|.?писок работ|наименование работ|список выполненных работ)(?![а-яa-z0-9])/.test(head) || /список работ/.test(low)) {
        section = 'work'; columns = hasCols ? nCols : 0; cur = { kind: 'work', rows: [], subtotal: null }; sections.push(cur); return;
      }
      if (/^(?:запасные части|запчасти|материалы|.?апчасти)(?![а-яa-z0-9])/.test(head)) {
        section = 'part'; columns = hasCols ? nCols : 0; cur = { kind: 'part', rows: [], subtotal: null }; sections.push(cur); return;
      }
      if (section && hasCols) { columns = nCols; return; }
      if (/^(?:итого|всего|подпись|заказчик|исполнитель|гарантия|ндс|к оплате|стоимость без скидки|сумма прописью|услуга)/.test(head)) {
        if (section && /^(?:итого|всего)/.test(head) && cur) { var st = moneyList(text); if (st.length) { cur.subtotal = st[st.length - 1]; subtotalSum.push(cur.subtotal); } }
        section = null; return;
      }
      if (section && !/^(?:наименование|кол-во|количество|цена|сумма)(?![а-яa-z0-9])/.test(head)) {
        var row = { kind: section, name: text, quantity: null, price: null, total: null, page: line.page, sourceText: raw.trim() };
        var parsed = columns ? parseRow(raw, columns) : null;
        if (parsed) { row.name = parsed.name; row.quantity = parsed.quantity; row.price = parsed.price; row.total = parsed.total; }
        else if (!/[A-Za-zА-Яа-яЁё]{3}/.test(text)) return; // мусор из линий таблицы
        items.push(row); if (cur) cur.rows.push(row);
      }
    });

    // Итог не найден явно — сумма итогов разделов (работы + запчасти), если их хотя бы два
    if (!candidates.total.length && subtotalSum.length >= 2) {
      candidates.total.push({ value: Math.round(subtotalSum.reduce(function (a, b) { return a + b; }, 0) * 100) / 100, weight: 1,
        evidence: { page: null, text: 'сумма итогов разделов', box: null, confidence: null } });
    }

    FIELDS.forEach(function (k) {
      var score = {};
      candidates[k].forEach(function (c) { score[c.value] = (score[c.value] || 0) + c.weight; });
      if (k === 'service') foldNames(score);
      var vals = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
      fields[k].evidence = candidates[k].map(function (c) { return c.evidence; });
      fields[k].scores = score;
      if (!vals.length) return;
      // Одно значение — берём. Несколько — только если лидер явно сильнее (VIN с меткой против случайной строки)
      var top = vals[0], second = vals[1];
      var winner = !second || ((k === 'vin' || k === 'service') && score[top] >= score[second] + 2) ? top : null;
      if (winner !== null) {
        var orig = candidates[k].filter(function (c) { return String(c.value) === winner; })[0];
        fields[k].value = orig.value;
      } else warnings.push('Несколько значений поля «' + k + '»: выберите вручную.');
    });

    // Проверка строк по итогам разделов
    var checked = 0, ok = 0;
    sections.forEach(function (s) {
      if (s.subtotal == null || !s.rows.length) return;
      checked++;
      var sum = s.rows.reduce(function (a, r) { return a + (r.total || 0); }, 0);
      if (Math.abs(sum - s.subtotal) < 0.6) ok++;
      else warnings.push('Сумма строк раздела «' + (s.kind === 'work' ? 'работы' : 'запчасти') + '» не сходится с «Итого» — проверьте строки.');
    });
    if (!fields.date.value) warnings.push('Дата выполнения не определена. Дата открытия/печати не считается датой обслуживания.');
    warnings.push(items.length ? 'Строки работ и материалов — черновик OCR. Проверьте названия по оригиналу.' : 'Разделы работ и материалов не выделены. Добавьте строки вручную по распознанному тексту.');
    if (lines.some(function (l) { return l.confidence < 65; })) warnings.push('Есть текст с низкой уверенностью распознавания. Проверьте оригинал.');
    return { fields: fields, items: items, warnings: Array.from(new Set(warnings)), lines: lines, check: { sections: checked, ok: ok } };
  }

  /** Название с лишней буквой перед кавычкой («…Групв» — так OCR читает «»») сливается с правильным «…Груп». */
  function foldNames(score) {
    Object.keys(score).forEach(function (a) {
      var m = a.match(/^(.*[А-Яа-яA-Za-z])[А-Яа-яA-Za-z0-9]»$/);
      if (m && score[m[1] + '»'] !== undefined) { score[m[1] + '»'] += score[a]; delete score[a]; }
    });
    return score;
  }

  /** Несколько проходов OCR одного документа → один результат. passes: [{lines, confidence}] или массивы строк. */
  function extractBest(passes) {
    passes = (passes || []).map(function (p) { return Array.isArray(p) ? { lines: p } : p; }).filter(function (p) { return p.lines && p.lines.length; });
    if (passes.length <= 1) return extract(passes[0] ? passes[0].lines : []);
    var results = passes.map(function (p) { return { pass: p, r: extract(p.lines) }; });
    function conf(x) { var ls = x.pass.lines; return ls.reduce(function (a, l) { return a + (l.confidence || 0); }, 0) / ls.length; }
    function rowQuality(x) {
      return x.r.check.ok * 100 + x.r.items.filter(function (i) { return i.total != null; }).length * 5 - (x.r.check.sections - x.r.check.ok) * 20 + conf(x) / 10;
    }
    // Строки и текст — из прохода, где суммы сходятся с «Итого» лучше всего
    var base = results.slice().sort(function (a, b) { return rowQuality(b) - rowQuality(a); })[0];
    var out = { fields: {}, items: base.r.items, lines: base.pass.lines, warnings: [], passes: passes.length, check: base.r.check };
    FIELDS.forEach(function (k) {
      // Голосование: значение каждого прохода (решённое) + слабый вес его кандидатов
      var votes = {}, ev = [];
      results.forEach(function (x) {
        var f = x.r.fields[k];
        if (f.value !== null) votes[f.value] = (votes[f.value] || 0) + 3;
        Object.keys(f.scores || {}).forEach(function (v) { votes[v] = (votes[v] || 0) + Math.min(1, f.scores[v] / 3); });
        if (x === base) ev = f.evidence;
      });
      if (k === 'service') foldNames(votes);
      var vals = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
      var value = null;
      if (vals.length && (vals.length === 1 || votes[vals[0]] >= votes[vals[1]] * 1.5)) {
        results.some(function (x) { var c = x.r.fields[k]; if (c.value !== null && String(c.value) === vals[0]) { value = c.value; return true; }
          var s = Object.keys(c.scores || {}); return false; });
        if (value === null) value = k === 'mileage' || k === 'total' ? Number(vals[0]) : vals[0];
      }
      out.fields[k] = { value: value, evidence: ev, votes: votes };
      if (value === null && vals.length) out.warnings.push('Несколько значений поля «' + k + '»: выберите вручную.');
    });
    var keep = base.r.warnings.filter(function (w) { return !/^Несколько значений/.test(w) && !(/Дата выполнения не определена/.test(w) && out.fields.date.value); });
    out.warnings = Array.from(new Set(out.warnings.concat(keep)));
    return out;
  }

  var api = { extract: extract, extractBest: extractBest, parseRow: parseRow, vinCheck: vinCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AutoHubDocumentParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
