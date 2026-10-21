/* AUTO-31: imports are drafts until explicitly confirmed. Originals live in IndexedDB. */
(function () {
  'use strict';
  var UI = window.AutoHubUI, esc = UI.esc, key = 'autohub.ocr.url', nativeSeq = 0, callbacks = {};
  var token = ''; // Session memory only: never export or persist the server token.
  function database() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open('autohub.documents', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('documents'); };
      r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(new Error('Хранилище документов недоступно.')); };
    });
  }
  async function storage(mode, fn) {
    var db = await database();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('documents', mode), req = fn(tx.objectStore('documents'));
      tx.oncomplete = function () { db.close(); resolve(req.result); };
      tx.onerror = tx.onabort = function () { db.close(); reject(new Error('Не удалось сохранить оригинал. Проверьте свободное место.')); };
    });
  }
  function field(id, label, value, type) {
    return '<label class="fld">' + label + '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '"></label>';
  }
  function endpoint(value) {
    var u = new URL(value);
    if (u.username || u.password || u.search || u.hash || (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname) && !window.NativeOcr))) throw new Error('Укажите HTTPS-адрес своего OCR-сервера.');
    return u.href.replace(/\/$/, '') + '/v1/documents/recognize';
  }
  window.__nativeOcrCb = function (id, status, body) { if (callbacks[id]) { callbacks[id](status, body); delete callbacks[id]; } };
  async function request(url, body) {
    var response;
    if (window.NativeOcr) {
      response = await new Promise(function (resolve, reject) {
        var id = 'ocr' + (++nativeSeq), timer = setTimeout(function () { delete callbacks[id]; reject(new Error('Время ожидания истекло. Попробуйте меньше страниц.')); }, 780000);
        callbacks[id] = function (status, text) { clearTimeout(timer); resolve({ status: status, text: text }); };
        window.NativeOcr.recognize(url, token, JSON.stringify(body), id);
      });
    } else {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 780000);
      try {
        var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body), signal: controller.signal });
        response = { status: r.status, text: await r.text() };
      } finally { clearTimeout(timer); }
    }
    var result; try { result = JSON.parse(response.text); } catch (e) { throw new Error('Нет корректного ответа OCR-сервера. Проверьте адрес и подключение.'); }
    if (response.status !== 200) throw new Error(typeof result.detail === 'string' ? result.detail : 'OCR временно недоступен.');
    return result;
  }
  function base64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader(); r.onload = function () { resolve({ data: r.result.split(',')[1] }); }; r.onerror = function () { reject(new Error('Не удалось прочитать файл.')); }; r.readAsDataURL(file);
    });
  }
  function open() {
    var car = window.AutoHubCar.active();
    if (!car || car.demo || car.id === 'demo') return UI.dialog('Добавьте автомобиль', 'Сначала добавьте свою машину в гараж. Документ будет привязан к ней.');
    var files = [];
    UI.sheet({ title: 'Сканировать наряд-заказ', html:
      '<p class="sheet-text">Автомобиль: ' + esc([car.make, car.model, car.plate].filter(Boolean).join(' ')) + '. Загружайте страницы одного наряд-заказа.</p>' +
      '<p class="sheet-text">Снимайте лист целиком, прямо сверху, без бликов. До 10 страниц и 16 МБ суммарно.</p>' +
      '<label class="btn-light ocr-pick">Сфотографировать<input id="ocrCamera" type="file" accept="image/*" capture="environment"></label>' +
      '<label class="btn-light ocr-pick">Выбрать фото или PDF<input id="ocrFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple></label>' +
      '<div id="ocrSelected" aria-live="polite"></div>' +
      '<details><summary>Подключение к своему OCR-серверу</summary><p class="sheet-text">Файлы отправляются на указанный сервер для обработки. На сервере оригиналы не сохраняются.</p>' +
      field('ocrUrl', 'Адрес сервера', localStorage.getItem(key) || '', 'url') + field('ocrToken', 'Ключ доступа (на эту сессию)', token, 'password') + '</details>' +
      '<p id="ocrStatus" role="status" aria-live="polite"></p><button id="ocrRun" class="btn-accent">Распознать</button><button class="btn-light" data-close="1">Закрыть</button>',
      onMount: function (b) {
        function draw() {
          b.querySelector('#ocrSelected').innerHTML = files.map(function (f, i) { return '<div class="ocr-file">' + esc(f.name) + ' <button data-remove="' + i + '">Убрать</button></div>'; }).join('');
        }
        ['ocrCamera', 'ocrFiles'].forEach(function (id) { b.querySelector('#' + id).onchange = function (e) {
          var next = files.concat(Array.from(e.target.files || [])); e.target.value = '';
          if (next.length > 10 || next.reduce(function (sum, f) { return sum + f.size; }, 0) > 16 * 1024 * 1024) { b.querySelector('#ocrStatus').textContent = 'Не больше 10 файлов и 16 МБ.'; return; }
          files = next; draw();
        }; });
        b.addEventListener('click', function (e) { var el = e.target.closest('[data-remove]'); if (el) { files.splice(+el.dataset.remove, 1); draw(); } });
        b.querySelector('#ocrRun').onclick = async function () {
          var status = b.querySelector('#ocrStatus'), button = this;
          try {
            if (!files.length) throw new Error('Добавьте фото или PDF.');
            var urlValue = b.querySelector('#ocrUrl').value.trim(), url = endpoint(urlValue);
            token = b.querySelector('#ocrToken').value.trim();
            if (token.length < 24) { b.querySelector('details').open = true; throw new Error('Введите ключ доступа своего сервера (минимум 24 символа).'); }
            localStorage.setItem(key, urlValue);
            var selected = files.slice();
            button.disabled = true;
            b.querySelectorAll('input, [data-remove]').forEach(function (x) { x.disabled = true; });
            status.textContent = 'Распознаём… Несколько страниц могут занять несколько минут.';
            var payload = []; for (var f of selected) payload.push(await base64(f));
            var result = await request(url, { files: payload });
            // Closing the sheet abandons the result; it must not reopen over another screen.
            if (b.isConnected && /\/sheet$/.test(location.hash)) review(car, selected, result);
          } catch (e) { status.textContent = e.message || 'Ошибка соединения с OCR-сервером.'; }
          finally { button.disabled = false; b.querySelectorAll('input, [data-remove]').forEach(function (x) { x.disabled = false; }); }
        };
      }
    });
  }
  function originals(b, files, previews) {
    var urls = [];
    var root = b.querySelector('.ocr-originals');
    if (previews && previews.length) {
      previews.forEach(function (src, i) {
        if (!/^data:image\/jpeg;base64,/.test(src)) return;
        var label = document.createElement('p'); label.textContent = 'Страница ' + (i + 1);
        var img = document.createElement('img'); img.src = src; img.alt = label.textContent;
        root.appendChild(label); root.appendChild(img);
      });
      return;
    }
    files.forEach(function (file, i) {
      var url = URL.createObjectURL(file); urls.push(url);
      var el = document.createElement('div'), label = document.createElement('p'); label.textContent = 'Файл ' + (i + 1) + ': ' + file.name; el.appendChild(label);
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        var frame = document.createElement('iframe'); frame.src = url; frame.title = label.textContent; frame.className = 'ocr-pdf'; el.appendChild(frame);
        var note = document.createElement('p'); note.textContent = 'Если PDF не отображается на устройстве, сверяйте с исходным файлом в приложении просмотра PDF.'; el.appendChild(note);
      } else { var img = document.createElement('img'); img.src = url; img.alt = label.textContent; el.appendChild(img); }
      root.appendChild(el);
    });
    var observer = new MutationObserver(function () { if (!b.isConnected) { urls.forEach(URL.revokeObjectURL); observer.disconnect(); } });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function review(car, files, data) {
    var f = data.fields, rows = data.items || [];
    UI.sheet({ title: 'Проверьте распознавание', html:
      '<p class="sheet-text">Запись для ' + esc(car.make + ' ' + car.model) + '. Это черновик: сверяйте все поля с оригиналом.</p>' +
      '<div class="ocr-warnings">' + data.warnings.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</div>' +
      field('docDate', 'Дата выполнения *', f.date.value, 'date') + field('docKm', 'Пробег, км', f.mileage.value, 'number') +
      field('docVin', 'VIN из документа', f.vin.value) + field('docNumber', 'Номер наряд-заказа', f.number.value) +
      field('docService', 'Автосервис', f.service.value) + field('docTotal', 'Итого, ₽ (пусто — неизвестно)', f.total.value, 'number') +
      field('docTitle', 'Название записи *', 'Обслуживание по наряд-заказу') +
      '<div id="docRows"></div><button id="docAdd" class="btn-light">Добавить строку</button>' +
      '<details><summary>Распознанный текст и источники полей</summary><pre class="ocr-text">' + esc(data.lines.map(function (l) { return '[Стр. ' + l.page + '] ' + l.text; }).join('\n')) + '</pre>' +
      Object.keys(f).map(function (k) { return '<p><b>' + esc(k) + '</b>: ' + f[k].evidence.map(function (e) { return esc('стр. ' + e.page + ': ' + e.text); }).join('; ') + '</p>'; }).join('') + '</details>' +
      '<details><summary>Оригиналы документов</summary><div class="ocr-originals"></div></details>' +
      '<label class="ocr-confirm"><input id="docConfirm" type="checkbox"> Я проверил данные и подтверждаю, что указанные работы выполнены</label>' +
      '<p class="sheet-text">Текущий пробег и дата полного ТО не изменятся. Оригиналы сохранятся на этом устройстве.</p>' +
      '<p id="docError" role="alert"></p><button id="docSave" class="btn-accent">Сохранить в историю</button>',
      onMount: function (b) {
        originals(b, files, data.previews);
        b.querySelector('#docTotal').step = '0.01';
        function renderRows() {
          b.querySelector('#docRows').innerHTML = rows.map(function (row, i) {
            return '<fieldset class="ocr-row" data-row="' + i + '"><legend>Строка ' + (i + 1) + '</legend><select data-prop="kind"><option value="work"' + (row.kind === 'work' ? ' selected' : '') + '>Работа</option><option value="part"' + (row.kind === 'part' ? ' selected' : '') + '>Запчасть / материал</option></select>' +
              '<label class="fld">Наименование<input data-prop="name" value="' + esc(row.name) + '"></label>' +
              ['quantity', 'price', 'total'].map(function (prop, j) { return '<label class="fld">' + ['Количество', 'Цена, ₽', 'Сумма, ₽'][j] + '<input data-prop="' + prop + '" type="number" min="0" step="0.01" value="' + esc(row[prop] == null ? '' : row[prop]) + '"></label>'; }).join('') +
              '<button data-delete-row="' + i + '" class="btn-light">Удалить строку</button></fieldset>';
          }).join('');
        }
        b.addEventListener('input', function (e) { var row = e.target.closest('[data-row]'), prop = e.target.dataset.prop; if (row && prop) rows[+row.dataset.row][prop] = e.target.value; });
        b.addEventListener('change', function (e) { var row = e.target.closest('[data-row]'); if (row && e.target.dataset.prop) rows[+row.dataset.row][e.target.dataset.prop] = e.target.value; });
        b.addEventListener('click', function (e) { var del = e.target.closest('[data-delete-row]'); if (del) { rows.splice(+del.dataset.deleteRow, 1); renderRows(); } });
        b.querySelector('#docAdd').onclick = function () { rows.push({ kind: 'work', name: '', quantity: null, price: null, total: null }); renderRows(); };
        renderRows();
        b.querySelector('#docSave').onclick = async function () {
          var button = this;
          try {
            var value = function (id) { return b.querySelector('#' + id).value.trim(); };
            if (!b.querySelector('#docConfirm').checked) throw new Error('Подтвердите проверку документа.');
            if (!window.AutoHubCar.cars().some(function (c) { return c.id === car.id; })) throw new Error('Автомобиль удалён. Начните импорт заново.');
            var date = value('docDate'), title = value('docTitle');
            if (!date || !title) throw new Error('Укажите дату выполнения и название записи.');
            if (date > new Date().toLocaleDateString('sv-SE')) throw new Error('Дата выполненных работ не может быть в будущем.');
            var vin = value('docVin').toUpperCase();
            if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error('Проверьте VIN: 17 латинских букв и цифр, без I, O, Q.');
            if (car.vin && vin && car.vin !== vin) throw new Error('VIN не совпадает с выбранной машиной. Исправьте поле или загрузите документ для другой машины.');
            function number(v, max) { if (v == null || v === '') return null; var n = Number(String(v).replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > max) throw new Error('Проверьте числовые значения.'); return n; }
            var km = number(value('docKm'), 3000000), total = number(value('docTotal'), 100000000);
            if (km !== null && !Number.isInteger(km)) throw new Error('Пробег должен быть целым числом.');
            var items = rows.map(function (r) { if (!r.name.trim()) throw new Error('Укажите наименование каждой строки или удалите пустую.'); return Object.assign({}, r, { name: r.name.trim(), quantity: number(r.quantity, 1000000), price: number(r.price, 100000000), total: number(r.total, 100000000) }); });
            if (total !== null && items.length && items.every(function (r) { return r.total !== null; }) && Math.abs(items.reduce(function (s, r) { return s + r.total; }, 0) - total) > 0.02 && !window.confirm('Сумма строк отличается от итога. Возможны скидки или налоги. Сохранить проверенный итог?')) return;
            var all = JSON.parse(localStorage.getItem('autohub.history.v1') || '{}'), records = all[car.id] || [];
            if (records.some(function (r) { return r.documentHash === data.documentHash || (r.fileHashes || []).some(function (h) { return data.fileHashes.indexOf(h) >= 0; }); })) throw new Error('Этот файл уже есть в истории автомобиля.');
            button.disabled = true;
            var documentId = car.id + ':' + data.documentHash;
            await storage('readwrite', function (s) { return s.put({ files: files, ocr: data }, documentId); });
            try {
              window.AutoHubScreens.addHistory({ date: date, km: km, kind: 'visit', title: title, place: value('docService') || 'Из документа', cost: total,
                vin: vin, documentNumber: value('docNumber'), items: items, documentId: documentId, documentHash: data.documentHash, fileHashes: data.fileHashes,
                source: 'ocr-confirmed', confirmedAt: new Date().toISOString(), order: items.map(function (r) { return [r.name, r.total]; }) }, car.id);
            } catch (e) { await storage('readwrite', function (s) { return s.delete(documentId); }); throw e; }
            UI.close(function () { UI.toast('Документ сохранён в истории автомобиля'); });
          } catch (e) { b.querySelector('#docError').textContent = e.message; button.disabled = false; }
        };
      }
    });
  }
  async function view(id) {
    try {
      var saved = await storage('readonly', function (s) { return s.get(id); });
      if (!saved) throw new Error('Оригинал не найден на этом устройстве.');
      UI.sheet({ title: 'Оригинал наряд-заказа', html: '<div class="ocr-originals"></div><button data-close="1" class="btn-light">Закрыть</button>', onMount: function (b) { originals(b, saved.files, saved.ocr.previews); } });
    } catch (e) { UI.toast(e.message); }
  }
  window.AutoHubDocuments = { open: open, view: view, clear: function () { token = ''; return storage('readwrite', function (s) { return s.clear(); }); } };
})();
