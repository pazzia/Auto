/* АвтоХаб: живая логика экранов прототипа — история, запись в сервис, штрафы, шины, страховка, SOS,
 * подписка, ремонт онлайн, гарантии, паспорт авто, семья.
 * Всё демонстрационное: состояние хранится на телефоне (localStorage), реальные API подключим позже.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI, API = window.AutoHubApi;
  var esc = function (s) { return UI.esc(s); };
  var ACC = "#C2410C";
  function $s(n) { var s = document.getElementById("s-" + n); return s && s.firstElementChild; }
  function rub(n) { return Number(n).toLocaleString("ru-RU") + " ₽"; }
  // Элемент, текст которого начинается с text; из вложенных совпадений — самый глубокий
  function byText(rootEl, sel, text) {
    var ms = Array.prototype.filter.call(rootEl.querySelectorAll(sel), function (e) { return e.textContent.replace(/\s+/g, " ").trim().indexOf(text) === 0; });
    var m = ms[0];
    ms.forEach(function (x) { if (m && x !== m && m.contains(x)) m = x; });
    return m;
  }
  function on(el, fn) { if (!el) return; el.dataset.action = el.dataset.action || "screen"; el.addEventListener("click", fn); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("autohub." + k, JSON.stringify(v)); } catch (e) {} }
  function car() { return (window.AutoHubCar && window.AutoHubCar.active()) || {}; }
  function carName() { var c = car(); return [c.make, c.model].filter(Boolean).join(" ") || "Автомобиль"; }
  function setBtn(b, text, style) { if (!b) return; b.textContent = text; if (style) Object.assign(b.style, style); }
  var DONE = { background: "#DDF0E4", color: "#0F6B3A" };
  var D = UI.dates; // даты по местному времени телефона
  function plural(n, a, b, c) { n = Math.abs(n); var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
  function daysTo(iso) { return Math.round((D.toDate(iso) - D.toDate(D.iso())) / 864e5); }

  /* ================= История обслуживания ================= */
  var HIST_DEMO = [
    { id: "h1", date: "2026-03-12", km: 45200, kind: "visit", title: "Замена масла и фильтров", place: "Мотор-Профи · запись через приложение", cost: 6300,
      order: [["Замена масла ДВС", 900], ["Замена масляного фильтра", 300], ["Масло 5W-30, 4 л", 3150], ["Фильтр масляный", 640], ["Фильтр салонный", 590], ["Диагностика", 720]] },
    { id: "h2", date: "2026-02-03", km: null, kind: "purchase", title: "Колодки тормозные передние", place: "Запчастино · дешевле средней цены на 620 ₽", cost: 2480 },
    { id: "h3", date: "2025-09-18", km: 38900, kind: "visit", title: "Сезонная смена шин", place: "Колесо 24 · добавлено вручную", cost: 2400 }
  ];
  var KIND = { visit: "ВИЗИТ В СЕРВИС", purchase: "ПОКУПКА", self: "СВОИМИ СИЛАМИ", booking: "ЗАПИСЬ" };
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  function fmtDate(iso) { var d = new Date(iso + "T12:00:00"); return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function history() {
    var all = load("history.v1", {}), id = car().id || "demo";
    if (!all[id]) { all[id] = car().demo || id === "demo" ? HIST_DEMO.slice() : []; save("history.v1", all); }
    return all[id];
  }
  /** Число записей истории машины (у демо-машины — демо-записи, даже если история ещё не открывалась). */
  function historyCount(carId) {
    var all = load("history.v1", {});
    if (all[carId]) return all[carId].length;
    var c = (window.AutoHubCar ? window.AutoHubCar.cars() : []).filter(function (x) { return x.id === carId; })[0];
    return carId === "demo" || (c && c.demo) ? HIST_DEMO.length : 0;
  }
  // Цифры из истории на других экранах: плитка «История» в гараже, паспорт авто
  function drawCounts() {
    var c = car(), id = c.id || "demo", n = historyCount(id), list = load("history.v1", {})[id] || (c.demo ? HIST_DEMO : []);
    var g = $s("Garage"), a = g && g.querySelector('a[href="#History"]');
    if (a) { var sp = a.querySelectorAll(":scope > span"); if (sp.length >= 2) sp[sp.length - 1].textContent = n ? n + " " + plural(n, "запись", "записи", "записей") : "пока пусто"; }
    var r = $s("CarPassport"); if (!r) return;
    var real = list.filter(function (h) { return h.kind !== "booking"; });
    var confirmed = real.filter(function (h) { return h.documentId || (h.order && h.order.length) || /заказ|через приложение/.test(h.place || ""); }).length;
    var stat = byText(r, "div", "Записей"); if (stat && stat.nextElementSibling) stat.nextElementSibling.textContent = real.length;
    var conf = byText(r, "div", "Подтверждено"); if (conf && conf.nextElementSibling) conf.nextElementSibling.textContent = confirmed;
    var orders = byText(r, "span", "Заказ-наряды"); if (orders && orders.nextElementSibling) orders.nextElementSibling.textContent = real.filter(function (h) { return h.kind === "visit"; }).length + " шт.";
    var checks = byText(r, "span", "Чеки на запчасти"); if (checks && checks.nextElementSibling) checks.nextElementSibling.textContent = real.filter(function (h) { return h.kind === "purchase"; }).length + " шт.";
  }
  function addHistory(rec, carId) {
    var all = load("history.v1", {}), id = carId || car().id || "demo";
    if (!all[id]) all[id] = id === "demo" ? HIST_DEMO.slice() : [];
    rec.id = "h" + Date.now() + Math.random().toString(36).slice(2, 8); all[id].unshift(rec);
    localStorage.setItem("autohub.history.v1", JSON.stringify(all));
    drawHistory(); drawCounts();
  }
  var hist = { filter: "all" };
  function initHistory() {
    var r = $s("History"); if (!r) return;
    var head = r.children[0], top = r.children[1];
    hist.list = r.children[2];
    hist.tabs = top.children[0].querySelectorAll("button");
    hist.sum = top.children[1];
    var keys = ["all", "service", "visits"];
    hist.tabs.forEach(function (b, i) { on(b, function () { hist.filter = keys[i]; drawHistory(); }); });
    on(head.querySelector('button[aria-label="Добавить запись"]'), function () {
      UI.sheet({ title: "Добавить в историю", html: '<button id="historyScan" class="btn-accent">Сканировать наряд-заказ</button><button id="historyManual" class="btn-light">Ввести вручную</button>', onMount: function (b) {
        b.querySelector('#historyScan').onclick = function () { window.AutoHubDocuments.open(); };
        b.querySelector('#historyManual').onclick = addRecordSheet;
      } });
    });
    hist.list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-order]"); if (!a) return;
      e.preventDefault();
      var rec = history().filter(function (h) { return h.id === a.dataset.order; })[0]; if (!rec) return;
      UI.sheet({ title: "Заказ-наряд", onMount: function (b) { var btn = b.querySelector("#viewOriginal"); if (btn) btn.onclick = function () { window.AutoHubDocuments.view(rec.documentId); }; }, html: '<div class="kv">' + (rec.order || [[rec.title, rec.cost]]).map(function (x) {
        return '<div><span>' + esc(x[0]) + "</span><b>" + (x[1] == null ? "не указано" : rub(x[1])) + "</b></div>"; }).join("") +
        '<div class="kv-total"><span>Итого</span><b>' + (rec.cost == null ? "не указано" : rub(rec.cost)) + "</b></div></div>" +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">' + esc(rec.place) + " · " + fmtDate(rec.date) + "</p>" +
        (rec.documentId ? '<button id="viewOriginal" class="btn-light">Оригинал документа</button>' : '') + '<button class="btn-dark" data-close="1" data-action="close">Закрыть</button>' });
    });
    drawHistory();
    window.addEventListener("autohub:car", drawHistory);
  }
  function drawHistory() {
    if (!hist.list) return;
    var all = history(), keys = ["all", "service", "visits"];
    hist.tabs.forEach(function (b, i) {
      var sel = keys[i] === hist.filter;
      b.style.background = sel ? "#FFFFFF" : "transparent"; b.style.fontWeight = sel ? "700" : "600";
      b.style.color = sel ? "#17191C" : "#5B5F66"; b.style.boxShadow = sel ? "0 1px 2px rgba(0,0,0,.08)" : "none";
    });
    var list = all.filter(function (h) {
      return hist.filter === "all" || (hist.filter === "visits" ? (h.kind === "visit" || h.kind === "booking") : (h.kind === "purchase" || h.kind === "self"));
    });
    var yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    var spent = all.filter(function (h) { return h.kind !== "booking" && new Date(h.date) >= yearAgo; }).reduce(function (s, h) { return s + (h.cost || 0); }, 0);
    var vals = hist.sum.querySelectorAll(":scope > div > div:last-child");
    if (vals[0]) vals[0].textContent = rub(spent);
    var year = null, html = "";
    list.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (h) {
      var y = h.date.slice(0, 4);
      if (y !== year) { year = y; html += '<div class="hist-year">' + y + "</div>"; }
      html += '<div class="hist-row' + (h.kind === "booking" ? " future" : "") + '"><span class="hist-dot ' + esc(h.kind) + '"></span><div class="hist-card">' +
        '<div class="hist-meta"><span>' + fmtDate(h.date) + (h.km ? " · " + h.km.toLocaleString("ru-RU") + " км" : "") + '</span><span class="hist-kind">' + KIND[h.kind] + "</span></div>" +
        '<div class="hist-title">' + esc(h.title) + '</div><div class="hist-place">' + esc(h.place || "") + "</div>" +
        '<div class="hist-foot"><b>' + (h.cost ? rub(h.cost) : h.kind === "booking" ? "предварительно" : "—") + "</b>" +
        (h.kind === "visit" ? '<a href="#" data-order="' + esc(h.id) + '">Заказ-наряд</a>' : "") + "</div></div></div>";
    });
    hist.list.innerHTML = html || '<div class="empty"><b>Записей пока нет</b><span>Добавьте визит в сервис или покупку кнопкой «+ Запись».</span></div>';
  }
  function addRecordSheet() {
    var today = D.iso(); // местная дата, не UTC: после полуночи по Москве — уже новый день
    UI.sheet({ title: "Новая запись",
      html: '<div class="seg3" role="radiogroup"><button data-kind="visit" class="on" data-action="k">Сервис</button><button data-kind="purchase" data-action="k">Покупка</button><button data-kind="self" data-action="k">Сам</button></div>' +
        '<label class="fld">Что сделали<input id="hTitle" placeholder="Замена свечей зажигания" autocomplete="off"></label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="fld">Дата<input id="hDate" type="date" value="' + today + '"></label>' +
        '<label class="fld">Пробег, км<input id="hKm" inputmode="numeric" placeholder="' + (car().mileage || 58400) + '"></label></div>' +
        '<label class="fld">Где<input id="hPlace" placeholder="Сервис или магазин" autocomplete="off"></label>' +
        '<label class="fld">Сумма, ₽<input id="hCost" inputmode="numeric" placeholder="3 500"></label>' +
        '<span id="hErr" class="err" hidden></span><button class="btn-accent" data-action="save-h" style="height:52px">Сохранить запись</button>',
      onMount: function (b) {
        var kind = "visit";
        b.addEventListener("click", function (e) {
          var k = e.target.closest("[data-kind]");
          if (k) { kind = k.dataset.kind; b.querySelectorAll("[data-kind]").forEach(function (x) { x.classList.toggle("on", x === k); }); return; }
          if (!e.target.closest("[data-action=save-h]")) return;
          var t = b.querySelector("#hTitle").value.trim();
          if (!t) { var er = b.querySelector("#hErr"); er.textContent = "Напишите, что сделали."; er.hidden = false; return; }
          var num = function (id) { return parseInt((b.querySelector(id).value || "").replace(/\D/g, ""), 10) || null; };
          UI.close(function () {
            addHistory({ date: b.querySelector("#hDate").value || today, km: num("#hKm"), kind: kind, title: t,
              place: b.querySelector("#hPlace").value.trim() || "добавлено вручную", cost: num("#hCost") || 0 });
            UI.toast("Запись добавлена в историю");
          });
        });
      } });
  }

  /* ================= Запись в сервис ================= */
  // Дни от сегодняшнего: +1…+n, как data-rel-day в макетах (app.js) — [день недели, число, месяц, ГГГГ-ММ-ДД]
  function workDays(n, from) {
    var out = [];
    for (var i = 1; i <= n; i++) { var d = D.addDays(from || D.iso(), i); out.push([D.WD[d.getDay()], d.getDate(), d.getMonth(), D.iso(d)]); }
    return out;
  }
  var DAYS = workDays(5);
  var MSHORT = D.MON;
  var BK_DEFAULT = 4; // по умолчанию выбран день +5 — его же показывают «Запись подтверждена» и гараж из макета
  var bk = { day: BK_DEFAULT, time: null };
  // ТО по регламенту для выбранной машины и цена работ у выбранного сервиса — тот же расчёт, что в сценарии ТО
  function bookingTO() { var t = API.maintenance.nextTO(car()); return { t: t, price: API.maintenance.worksPrice(service(), t.items) }; }
  function initBooking() {
    var r = $s("ServiceBooking"); if (!r) return;
    bk.root = r;
    bk.days = byText(r, "div", "ДАТА").parentNode.querySelectorAll("button");
    bk.times = byText(r, "div", "СВОБОДНОЕ ВРЕМЯ").parentNode.querySelectorAll("button");
    bk.cta = r.querySelector('a[href="#BookingDone"]');
    bk.total = byText(r, "span", "Работы, предварительно").nextElementSibling;
    bk.checks = r.querySelectorAll('input[type="checkbox"]');
    bk.fair = byText(r, "span", "Честная цена");
    var ty = bk.checks[0] && bk.checks[0].closest("label");
    if (ty) { bk.toTitle = ty.querySelector("span span"); bk.toPrice = ty.lastElementChild; }
    bk.days.forEach(function (b, i) { on(b, function () { bk.day = i; bk.time = null; drawBooking(); }); });
    bk.times.forEach(function (b, i) { on(b, function () { if (b.disabled) return; bk.time = i; drawBooking(); }); });
    bk.checks.forEach(function (c) { c.addEventListener("change", drawBooking); });
    bk.cta.addEventListener("click", function (e) {
      if (bk.time == null) { e.preventDefault(); UI.toast("Выберите время визита"); return; }
      var d = DAYS[bk.day], t = bk.times[bk.time].textContent.trim(), svc = service(), to = bookingTO();
      var works = []; if (bk.checks[0] && bk.checks[0].checked) works.push("ТО-" + to.t.km.toLocaleString("ru-RU") + " км"); if (bk.checks[1] && bk.checks[1].checked) works.push("Компьютерная диагностика");
      var b = { when: d[0] + ", " + d[1] + " " + MONTHS[d[2]] + ", " + t, short: d[1] + " " + MONTHS[d[2]] + ", " + t, day: d[1], mon: MSHORT[d[2]].toUpperCase(), time: t, date: d[3],
        service: svc.name, address: svc.town ? svc.town + (svc.address ? ", " + svc.address : "") : "адрес пришлёт сервис", works: works.join(", ") || "Осмотр", own: bk.checks[2] && bk.checks[2].checked,
        car: carName(), carId: car().id, total: totalWorks() };
      save("booking.v1", b);
      if (window.AutoHubTO) setTimeout(window.AutoHubTO.renderGarage, 0);
      addHistory({ date: d[3], km: null, kind: "booking",
        title: b.works, place: b.service + " · " + t, cost: 0 });
    });
    window.addEventListener("hashchange", function () {
      if (location.hash !== "#ServiceBooking") return;
      var first = DAYS[0] && DAYS[0][3]; DAYS = workDays(5); if (DAYS[0][3] !== first) { bk.day = BK_DEFAULT; bk.time = null; } // наступил новый день
      drawBooking();
    });
    window.addEventListener("autohub:car", function () { if (location.hash === "#ServiceBooking") drawBooking(); });
    drawBooking();
  }
  function service() {
    try { var s = JSON.parse(sessionStorage.getItem("autohub.serviceObj") || "null"); if (s) return s; } catch (e) {}
    return { name: "Мотор-Профи", ratingGis: 4.8, distanceKm: 1.2, town: "Красногорск", address: "ул. Заводская, 14", priceTO: 3900 };
  }
  function totalWorks() { var t = 0; if (bk.checks[0] && bk.checks[0].checked) t += bookingTO().price; if (bk.checks[1] && bk.checks[1].checked) t += 1200; return t; }
  function drawBooking() {
    var svc = service(), head = bk.root.children[0].children[1];
    if (head) {
      head.children[0].textContent = svc.name;
      head.children[1].textContent = "★ " + (svc.ratingGis || 4.8).toFixed(1) + " · " + String(svc.distanceKm || 1.2).replace(".", ",") + " км · " + (svc.town || "запись через 2ГИС");
    }
    // ТО из регламента машины и его цена у этого сервиса
    var to = bookingTO(), km = to.t.km.toLocaleString("ru-RU");
    if (bk.toTitle) bk.toTitle.textContent = "ТО-" + km + " км";
    if (bk.toPrice) bk.toPrice.textContent = rub(to.price);
    if (bk.fair) {
      bk.fair.textContent = "Честная цена ТО-" + km;
      var box = bk.fair.closest('div[style*="border-radius: 16px"]'), market = API.maintenance.worksPrice({ priceTO: 4600 }, to.t.items);
      var lo = API.maintenance.worksPrice({ priceTO: 3400 }, to.t.items), v = API.maintenance.priceVerdict(to.price, market);
      var tag = bk.fair.nextElementSibling;
      if (tag) { tag.textContent = v.verdict === "high" ? "Выше рынка" : v.verdict === "low" ? "Ниже рынка" : "В норме"; tag.style.background = v.verdict === "high" ? "#FCEBDF" : "#DDF0E4"; tag.style.color = v.verdict === "high" ? "#9A3412" : "#0F6B3A"; }
      var scale = box && byText(box, "span", "здесь");
      if (scale) {
        var row = scale.parentNode.children; row[0].textContent = rub(lo); scale.textContent = "здесь " + rub(to.price); row[2].textContent = rub(market);
        var dot = box.querySelector('div[style*="margin-left: -10px"]');
        if (dot) dot.style.left = Math.max(0, Math.min(100, 20 + (to.price - lo) / (market - lo) * 55)) + "%";
      }
    }
    bk.days.forEach(function (b, i) {
      var sel = i === bk.day, d = DAYS[i], sp = b.querySelectorAll("span");
      if (d && sp.length >= 2) { sp[0].textContent = d[0]; sp[1].textContent = d[1]; sp[0].style.color = sel ? "#C9CCD1" : "#5B5F66"; b.setAttribute("aria-label", D.dayMonth(d[3])); }
      b.style.background = sel ? "#17191C" : "#FFFFFF"; b.style.color = sel ? "#FFFFFF" : "#17191C"; b.style.borderColor = sel ? "#17191C" : "#E2DED6";
      b.setAttribute("aria-pressed", String(sel));
    });
    // Занятые окна зависят от дня (демо)
    bk.times.forEach(function (b, i) {
      var busy = (bk.day * 3 + i * 5) % 7 === 0, sel = i === bk.time;
      b.disabled = busy; b.style.textDecoration = busy ? "line-through" : "none";
      b.style.background = sel ? ACC : "#FFFFFF"; b.style.color = sel ? "#FFFFFF" : busy ? "#9A958B" : "#17191C";
      b.style.borderColor = sel ? ACC : "#E2DED6"; b.setAttribute("aria-pressed", String(sel));
    });
    var t = totalWorks();
    bk.total.textContent = t ? "от " + rub(t) : "по осмотру";
    var d = DAYS[bk.day];
    bk.cta.textContent = bk.time == null ? "Выберите время" : "Записаться на " + d[1] + " " + MONTHS[d[2]] + ", " + bk.times[bk.time].textContent.trim();
    bk.cta.style.opacity = bk.time == null ? ".55" : "1";
  }
  function initBookingDone() {
    var r = $s("BookingDone"); if (!r) return;
    var cal = byText(r, "button", "В календарь");
    on(cal, function () { setBtn(cal, "✓ В календаре", DONE); UI.toast("Напоминание добавлено в календарь (демо)"); });
    function fill() {
      var b = load("booking.v1", null); if (!b) return;
      var rows = byText(r, "span", "Когда").parentNode.parentNode.children;
      rows[0].lastElementChild.textContent = b.when;
      rows[1].lastElementChild.innerHTML = esc(b.service) + '<br><span style="font-size: 13px; color: #5B5F66; font-weight: 500">' + esc(b.address) + "</span>";
      rows[2].lastElementChild.textContent = b.works;
      var own = byText(r, "div", "Вы привезёте свои запчасти");
      if (own) own.parentNode.style.display = b.own ? "" : "none";
      setBtn(cal, "В календарь", { background: "", color: "" });
    }
    window.addEventListener("hashchange", function () { if (location.hash === "#BookingDone") fill(); });
    fill();
  }

  /* ================= Штрафы ================= */
  // Единый источник — AutoHubApi.fines.list(машина). Оплаченные: autohub.fines.v1 { id: { at, carId, amount, receipt } }.
  var fines = { carId: null, items: null, error: null, req: 0 };
  function finesPaid() { return load("fines.v1", {}); }
  function fineDiscount(f) { return !!(f.discountUntil && f.discountAmount != null && daysTo(f.discountUntil) >= 0); }
  function fineSum(f) { return fineDiscount(f) ? f.discountAmount : f.amount; }
  function finesLeft() { var p = finesPaid(); return (fines.items || []).filter(function (f) { return !p[f.id]; }); }
  /** Штрафы активной машины: загрузить (если сменилась машина) и перерисовать гараж, экран и плитку. */
  function loadFines(force) {
    var c = car(), id = c.id || "demo";
    if (!force && fines.carId === id && (fines.items || fines.error)) return;
    var req = ++fines.req;
    fines.carId = id; fines.items = null; fines.error = null;
    API.fines.list(c).then(function (d) { if (req === fines.req) fines.items = d.items || []; },
      function (e) { if (req === fines.req) { fines.items = []; fines.error = API.errorText(e); } })
      .then(function () { if (req !== fines.req) return; drawFines(); drawGarageFines(); if (window.AutoHubHub) window.AutoHubHub.render(); });
  }
  var fn = {};
  function initFines() {
    var r = $s("Fines"); if (!r) return;
    fn.root = r;
    var firstPay = Array.prototype.filter.call(r.querySelectorAll("button"), function (b) { return b.textContent.trim() === "Оплатить"; })[0];
    fn.tpl = firstPay.closest('div[style*="border-radius: 16px"]').cloneNode(true); // карточка штрафа из макета — шаблон
    fn.anchor = byText(r, "div", "НАСТРОЙКИ");
    Array.prototype.forEach.call(r.querySelectorAll("button"), function (b) { if (b.textContent.trim() === "Оплатить") b.closest('div[style*="border-radius: 16px"]').remove(); });
    fn.all = byText(r, "button", "Оплатить оба");
    fn.stats = byText(r, "div", "Неоплачено").parentNode.parentNode.children;
    fn.sub = r.querySelector("h1") && r.querySelector("h1").nextElementSibling;
    r.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fine]"); if (!b) return;
      var p = finesPaid()[b.dataset.fine];
      if (p) receipt(b.dataset.fine); else pay([b.dataset.fine]);
    });
    on(fn.all, function () { var ids = finesLeft().map(function (f) { return f.id; }); if (ids.length) pay(ids); });
    window.addEventListener("hashchange", function () { if (location.hash === "#Fines") { loadFines(); drawFines(); } });
    window.addEventListener("autohub:car", function () { loadFines(); drawFines(); drawGarageFines(); });
    loadFines(); drawFines();
  }
  function fineCard(f, paid) {
    var el = fn.tpl.cloneNode(true), spans = el.querySelectorAll("span"), disc = fineDiscount(f), left = disc ? daysTo(f.discountUntil) : 0;
    var d = D.toDate(f.date);
    spans[0].textContent = f.text;
    spans[1].textContent = d.getDate() + " " + D.MON[d.getMonth()] + (f.time ? ", " + f.time : "") + " · " + (f.place || "") + (f.uin ? " · УИН " + f.uin : "");
    var tag = spans[2];
    if (paid) { tag.textContent = "Оплачен"; tag.style.background = "#DDF0E4"; tag.style.color = "#0F6B3A"; }
    else if (disc) { tag.textContent = left === 0 ? "Скидка — последний день" : "Скидка ещё " + left + " " + plural(left, "день", "дня", "дней"); tag.style.background = left <= 3 ? "#FCEBDF" : "#DDF0E4"; tag.style.color = left <= 3 ? "#9A3412" : "#0F6B3A"; }
    else { tag.textContent = f.discountUntil ? "Скидка закончилась" : "Без скидки"; tag.style.background = "#EFECE6"; tag.style.color = "#5B5F66"; }
    spans[3].textContent = rub(paid ? paid.amount : fineSum(f));
    spans[4].textContent = disc && !paid ? rub(f.amount) : ""; spans[4].hidden = !(disc && !paid);
    var btn = el.querySelector("button");
    btn.dataset.fine = f.id; btn.dataset.action = "fine";
    if (paid) { setBtn(btn, "Квитанция", DONE); el.style.opacity = ".7"; } else setBtn(btn, "Оплатить");
    return el;
  }
  function drawFines() {
    if (!fn.root) return;
    var c = car(), p = finesPaid(), items = fines.items, left = finesLeft();
    if (fn.sub) fn.sub.textContent = carName() + (c.plate && window.AutoHubCar ? " · " + window.AutoHubCar.plate(c.plate, c.region) : "") + " · проверка каждый день";
    Array.prototype.forEach.call(fn.root.querySelectorAll(".fine-card, .fine-empty"), function (e) { e.remove(); });
    if (!items) {
      var w = document.createElement("div"); w.className = "fine-empty loading"; w.textContent = "Проверяем штрафы…"; fn.anchor.parentNode.insertBefore(w, fn.anchor);
    } else if (!items.length) {
      var e = document.createElement("div"); e.className = "fine-empty empty";
      e.innerHTML = fines.error ? "<b>Не удалось проверить штрафы</b><span>" + esc(fines.error) + "</span>" : "<b>Штрафов нет</b><span>Неоплаченных штрафов по " + esc(carName()) + " не найдено.</span>";
      fn.anchor.parentNode.insertBefore(e, fn.anchor);
    } else items.forEach(function (f) { var el = fineCard(f, p[f.id]); el.classList.add("fine-card"); fn.anchor.parentNode.insertBefore(el, fn.anchor); });
    fn.stats[0].lastElementChild.textContent = left.length;
    fn.stats[1].lastElementChild.textContent = rub(left.reduce(function (s, f) { return s + fineSum(f); }, 0));
    fn.stats[2].lastElementChild.textContent = rub(left.reduce(function (s, f) { return s + f.amount - fineSum(f); }, 0));
    var withDisc = left.filter(fineDiscount).length;
    fn.all.disabled = !left.length;
    if (!items || !items.length) { fn.all.parentNode.hidden = true; return; }
    fn.all.parentNode.hidden = false;
    if (!left.length) setBtn(fn.all, "Все штрафы оплачены ✓", DONE);
    else setBtn(fn.all, (left.length === 1 ? "Оплатить" : "Оплатить все") + (withDisc ? " со скидкой" : "") + " · " + rub(left.reduce(function (s, f) { return s + fineSum(f); }, 0)), { background: ACC, color: "#FFFFFF" });
  }
  function pay(ids) {
    var list = (fines.items || []).filter(function (f) { return ids.indexOf(f.id) >= 0; });
    var sum = list.reduce(function (s, f) { return s + fineSum(f); }, 0), disc = list.some(fineDiscount);
    UI.sheet({ title: list.length > 1 ? "Оплата штрафов" : "Оплата штрафа", html: '<div class="kv"><div><span>' + (disc ? "К оплате со скидкой 50%" : "К оплате") + "</span><b>" + rub(sum) + '</b></div><div><span>Комиссия</span><b>0 ₽</b></div><div><span>Карта</span><b>•••• 4242 (демо)</b></div></div>' +
      '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Прототип: деньги не списываются. В рабочей версии оплата пройдёт через платёжного партнёра с доступом к ГИС ГМП.</p>' +
      '<button class="btn-accent" data-action="pay" style="height:52px">Оплатить ' + rub(sum) + "</button>",
      onMount: function (b) {
        var btn = b.querySelector("[data-action=pay]");
        btn.addEventListener("click", function () {
          btn.disabled = true; btn.textContent = "Оплачиваем…";
          var carId = car().id || "demo";
          API.fines.pay(ids).then(function (r) {
            var p = finesPaid(), rec = {};
            (r.receipts || []).forEach(function (x) { rec[x.fineId] = x; });
            list.forEach(function (f) { p[f.id] = { at: Date.now(), carId: carId, amount: fineSum(f), title: f.text, receipt: (rec[f.id] || {}).receipt || null }; });
            save("fines.v1", p);
            UI.close(function () { drawFines(); drawGarageFines(); if (window.AutoHubHub) window.AutoHubHub.render(); UI.toast("Оплачено. Квитанция — по кнопке у штрафа"); });
          }, function (e) { btn.disabled = false; btn.textContent = "Оплатить " + rub(sum); UI.toast(API.errorText(e)); });
        });
      } });
  }
  function receipt(id) {
    var p = finesPaid()[id] || {}, f = (fines.items || []).filter(function (x) { return x.id === id; })[0] || {};
    UI.sheet({ title: "Квитанция", html: '<div class="kv"><div><span>Штраф</span><b>' + esc(p.title || f.text || "") + "</b></div><div><span>Сумма</span><b>" + rub(p.amount || 0) + "</b></div>" +
      "<div><span>Оплачен</span><b>" + esc(D.dayMonth(new Date(p.at || Date.now()), true)) + "</b></div><div><span>Номер</span><b>" + esc(p.receipt || "—") + "</b></div></div>" +
      '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Демо-квитанция: в рабочей версии её пришлёт платёжный партнёр.</p><button class="btn-dark" data-close="1" data-action="close">Закрыть</button>' });
  }
  /** Неоплаченные штрафы активной машины (синхронно, по последней загрузке): null — ещё не загружены. */
  function finesUnpaid() { return fines.items ? finesLeft().length : null; }
  function drawGarageFines() {
    var g = $s("Garage"); if (!g) return;
    var a = g.querySelector('a[href="#Fines"]'); if (!a) return;
    loadFines();
    var items = fines.items, left = finesLeft();
    // Штрафов нет и не было (своя машина, или ещё грузим) — баннер не показываем
    a.hidden = !items || !items.length;
    if (a.hidden) return;
    var t = a.querySelectorAll(":scope > span");
    if (!left.length) {
      t[0].textContent = "✓"; t[0].style.background = "#0F6B3A"; a.style.background = "#DDF0E4";
      t[1].innerHTML = '<span style="font-weight: 700; font-size: 14px">Штрафов нет</span><span style="font-size: 12px; color: #0F6B3A; font-weight: 600">Проверяем каждый день по ГИС ГМП</span>';
    } else {
      t[0].textContent = left.length; t[0].style.background = ACC; a.style.background = "#FCEBDF";
      var sum = left.reduce(function (s, f) { return s + fineSum(f); }, 0), disc = left.filter(fineDiscount);
      var soon = disc.map(function (f) { return daysTo(f.discountUntil); }).sort(function (x, y) { return x - y; })[0];
      t[1].innerHTML = '<span style="font-weight: 700; font-size: 14px"></span><span style="font-size: 12px; color: #9A3412; font-weight: 600"></span>';
      t[1].firstElementChild.textContent = (left.length === 1 ? "Новый штраф · " : "Новые штрафы · ") + rub(sum) + (disc.length ? " со скидкой" : "");
      t[1].lastElementChild.textContent = disc.length ? "Скидка 50%" + (left.length > 1 ? (disc.length === left.length ? " на все" : " на " + disc.length) : "") + " — ещё " + soon + " " + plural(soon, "день", "дня", "дней") : "Скидка 50% уже не действует";
    }
  }

  /* ================= Шины ================= */
  function initTires() {
    var r = $s("Tires"); if (!r) return;
    var slots = byText(r, "div", "БЛИЖАЙШИЕ ОКНА РЯДОМ").nextElementSibling.querySelectorAll("button");
    var cta = byText(r, "button", "Записаться на");
    var sel = 0, done = load("tires.v1", null);
    // Окна — от сегодняшнего дня: +1 вечером, +2 утром и днём
    function fillSlots() {
      var days = workDays(2), plan = [[days[0], "18:30"], [days[1], "09:00"], [days[1], "13:30"]];
      slots.forEach(function (b, i) {
        var x = plan[i]; if (!x) return;
        var s = b.querySelector("span"); if (s) s.textContent = x[0][0] + ", " + x[0][1];
        b.lastChild.textContent = x[1];
        b.dataset.date = x[0][3]; b.dataset.time = x[1];
      });
    }
    function label(b) { var d = D.toDate(b.dataset.date); return D.WD[d.getDay()] + ", " + D.dayMonth(d) + ", " + b.dataset.time; }
    function draw() {
      slots.forEach(function (b, i) {
        var on2 = i === sel;
        b.style.background = on2 ? "#17191C" : "#FFFFFF"; b.style.color = on2 ? "#FFFFFF" : "#17191C"; b.style.borderColor = on2 ? "#17191C" : "#E2DED6";
      });
      if (done) setBtn(cta, "Вы записаны · " + done, DONE);
      else setBtn(cta, "Записаться на " + label(slots[sel]));
    }
    slots.forEach(function (b, i) { on(b, function () { if (done) { done = null; save("tires.v1", null); } sel = i; draw(); }); });
    on(cta, function () {
      if (done) { UI.toast("Вы уже записаны. Выберите другое окно, чтобы перенести"); return; }
      done = label(slots[sel]); save("tires.v1", done);
      addHistory({ date: slots[sel].dataset.date, km: null, kind: "booking", title: "Сезонная смена шин", place: "Шиномонтаж · " + done, cost: 0 });
      draw(); UI.dialog("Записали на шиномонтаж", "Окно " + done + ". Зимние заберём с хранения к визиту, летние сдадим на хранение. Напомним накануне.", "Хорошо");
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Tires") { fillSlots(); draw(); } });
    fillSlots(); draw();
  }

  /* ================= Страховка ================= */
  // Срок полиса — запись d-osago раздела «Документы» (AutoHubDocs): один источник для обоих экранов и напоминания
  function yearAfter(iso) { var d = D.toDate(iso); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); return D.iso(d); }
  function initInsurance() {
    var r = $s("Insurance"); if (!r) return;
    var NAMES = ["Страховая А", "Страховая Б", "Страховая В"];
    var cards = NAMES.map(function (n) { var t = byText(r, "span", n); return t && t.closest('div[style*="border-radius"]'); });
    var prices = [7840, 8120, 8900], sel = 0, quotesOk = true;
    var cta = byText(r, "button", "Продлить ОСАГО");
    var kasko = byText(r, "span", "КАСКО"); kasko = kasko && kasko.closest('div[style*="border-radius"]');
    var status = byText(r, "span", "ОСАГО заканчивается"), policy = byText(r, "span", "Полис до");
    function policyUntil() { var d = window.AutoHubDocs && window.AutoHubDocs.osago(); return d && d.until ? d.until : null; }
    // Е-ОСАГО действует с даты покупки ровно год
    function newPeriod() { var today = D.iso(); return [today, yearAfter(today)]; }
    function fmt(iso) { var d = D.toDate(iso); return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear(); }
    function draw() {
      cards.forEach(function (c, i) { if (!c) return; c.style.border = i === sel ? "1.5px solid " + ACC : "1px solid #E2DED6"; c.style.cursor = "pointer"; });
      var done = load("osago.v1", null), until = policyUntil(), n = until ? daysTo(until) : null;
      if (status) {
        var tag = status.nextElementSibling;
        if (done && n != null && n > 30) { status.textContent = "ОСАГО действует"; tag.textContent = "до " + D.dayMonth(until, true); tag.style.background = "#DDF0E4"; tag.style.color = "#0F6B3A"; }
        else if (n == null) { status.textContent = "Срок ОСАГО не указан"; tag.textContent = "добавьте в «Документах»"; }
        else if (n < 0) { status.textContent = "ОСАГО закончилось"; tag.textContent = "срок истёк"; tag.style.background = "#FCEBDF"; tag.style.color = "#9A3412"; }
        else { status.textContent = "ОСАГО заканчивается"; tag.textContent = n === 0 ? "сегодня" : "через " + n + " " + plural(n, "день", "дня", "дней"); tag.style.background = "#FCEBDF"; tag.style.color = "#9A3412"; }
      }
      if (policy && until) policy.textContent = "Полис до " + D.dayMonth(until, true) + " · " + (done ? done.insurer : "текущая страховая") + " · 2 водителя";
      if (done && n != null && n > 30) setBtn(cta, "ОСАГО продлён ✓ · " + done.insurer, DONE);
      else setBtn(cta, quotesOk ? "Продлить ОСАГО за " + rub(prices[sel]) : "Цены страховых недоступны", { background: ACC, color: "#FFFFFF" });
    }
    function bought() { var o = load("osago.v1", null), n = policyUntil() ? daysTo(policyUntil()) : -1; return o && n > 30; }
    // Цены — из AutoHubApi.insurance.quotes (заглушка совпадает с макетом)
    API.insurance.quotes(car(), "osago").then(function (d) {
      (d.items || []).forEach(function (q) { var i = NAMES.indexOf(q.insurer); if (i < 0) return; prices[i] = q.price; var t = byText(r, "span", q.insurer); if (t && t.nextElementSibling) t.nextElementSibling.textContent = rub(q.price); });
      draw();
    }, function () { quotesOk = false; draw(); });
    cards.forEach(function (c, i) { if (c) { c.setAttribute("role", "button"); c.tabIndex = 0; c.addEventListener("click", function () { if (!bought()) { sel = i; draw(); } }); } });
    if (kasko) { kasko.style.cursor = "pointer"; kasko.addEventListener("click", function () {
      UI.sheet({ title: "Расчёт КАСКО", html: '<div class="kv"><div><span>Страховая А</span><b>от 38 400 ₽</b></div><div><span>Страховая Б</span><b>от 41 900 ₽</b></div><div><span>Страховая В</span><b>от 45 200 ₽</b></div></div>' +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Демо-расчёт для ' + esc(carName()) + ", стаж 10 лет, франшиза 15 000 ₽. Точную цену дадут страховые после подключения брокера.</p>" +
        '<button class="btn-dark" data-close="1" data-action="close">Понятно</button>' }); }); }
    on(cta, function () {
      if (bought()) { UI.toast("Полис уже продлён"); return; }
      if (!quotesOk) { UI.toast("Нет связи со страховыми. Попробуйте позже"); return; }
      var name = NAMES[sel], period = newPeriod();
      UI.sheet({ title: "Продление ОСАГО", html: '<div class="kv"><div><span>Страховая</span><b>' + name + '</b></div><div><span>Срок</span><b>' + fmt(period[0]) + " – " + fmt(period[1]) + '</b></div><div><span>Водители</span><b>2</b></div><div class="kv-total"><span>К оплате</span><b>' + rub(prices[sel]) + "</b></div></div>" +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Прототип: полис не оформляется, деньги не списываются.</p><button class="btn-accent" data-action="buy" style="height:52px">Оформить е-ОСАГО</button>',
        onMount: function (b) { b.querySelector("[data-action=buy]").addEventListener("click", function () {
          save("osago.v1", { insurer: name, price: prices[sel], at: Date.now(), from: period[0], until: period[1], carId: car().id || "demo" });
          if (window.AutoHubDocs) window.AutoHubDocs.setOsago(period[1], name + ", оформлен в приложении");
          UI.close(function () { draw(); UI.toast("Полис отправлен на почту (демо)"); });
        }); } });
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Insurance") draw(); });
    draw();
  }

  /* ================= Помощь на дороге ================= */
  function initSOS() {
    var r = $s("SOS"); if (!r) return;
    function request(kind, title) {
      API.sos.request({ kind: kind }).then(function (d) {
        var html = '<div class="sosbox"><div class="sos-eta">' + d.etaMin + ' <span>мин</span></div><div><b>' + esc(title) + ' вызван</b><span>' + esc(d.operator) + " · заявка " + esc(d.requestId) + "</span></div></div>" +
          '<div class="kv"><div><span>Куда</span><b>ваша геопозиция</b></div><div><span>Автомобиль</span><b>' + esc(carName()) + "</b></div></div>" +
          '<button class="btn-light" data-action="cancel" style="height:48px">Отменить вызов</button>';
        UI.sheet({ title: title, html: html, onMount: function (b) {
          b.querySelector("[data-action=cancel]").addEventListener("click", function () { UI.close(function () { UI.toast("Вызов отменён"); }); });
        } });
      }, function (e) {
        // Нет связи с оператором — звонок остаётся рабочим способом вызвать помощь
        UI.sheet({ title: title, html: '<p class="sheet-text">Не удалось отправить заявку: ' + esc(API.errorText(e)) + ' Позвоните — так быстрее.</p>' +
          '<button class="btn-accent" data-action="call" style="height:52px">Позвонить 112</button><button class="btn-light" data-close="1" data-action="close" style="height:48px">Закрыть</button>',
          onMount: function (b) { b.querySelector("[data-action=call]").addEventListener("click", function () { location.href = "tel:112"; }); } });
      });
    }
    on(byText(r, "button", "Эвакуатор"), function () { request("tow", "Эвакуатор"); });
    on(byText(r, "button", "Техпомощь"), function () {
      UI.sheet({ title: "Что случилось?", html: ["Прикурить аккумулятор", "Заменить колесо", "Подвезти топливо", "Вскрыть замок"].map(function (t) {
        return '<button class="pick" data-help="' + t + '" data-action="h"><span class="pick-txt"><b>' + t + "</b><span>подача ~30–40 мин</span></span></button>"; }).join(""),
        onMount: function (b) { b.addEventListener("click", function (e) { var h = e.target.closest("[data-help]"); if (h) UI.close(function () { request("help", "Техпомощь: " + h.dataset.help.toLowerCase()); }); }); } });
    });
    on(byText(r, "button", "ДТП"), function () {
      var steps = byText(r, "div", "ЕСЛИ ПРОИЗОШЛО ДТП"); if (steps) steps.scrollIntoView({ behavior: "smooth", block: "start" });
      UI.toast("Следуйте шагам ниже");
    });
    var call = byText(r, "button", "Позвонить 112");
    on(call, function () { location.href = "tel:112"; });
    on(byText(r, "button", "Начать фотофиксацию"), function () {
      var shots = ["Общий план места ДТП", "Обе машины целиком", "Госномера всех машин", "Повреждения крупно", "Знаки и разметка рядом", "Положение машин относительно дороги"];
      UI.sheet({ title: "Фотофиксация ДТП", html: '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Камера в прототипе не подключена — отмечайте снятые кадры.</p>' +
        shots.map(function (t, i) { return '<button class="pick" data-shot="' + i + '" data-action="s"><span class="shot-ic">' + (i + 1) + '</span><span class="pick-txt"><b>' + t + "</b></span></button>"; }).join("") +
        '<button class="btn-dark" data-action="done" disabled>Сохранить фото · 0 из ' + shots.length + "</button>",
        onMount: function (b) {
          var n = 0, done = b.querySelector("[data-action=done]");
          b.addEventListener("click", function (e) {
            var s = e.target.closest("[data-shot]");
            if (s && !s.classList.contains("on")) { s.classList.add("on"); s.querySelector(".shot-ic").textContent = "✓"; n++; done.disabled = n < shots.length; done.textContent = "Сохранить фото · " + n + " из " + shots.length; }
            if (e.target.closest("[data-action=done]")) UI.close(function () { UI.toast("Фото сохранены — пригодятся для европротокола"); });
          });
        } });
    });
  }

  /* ================= Подписка ================= */
  function initSubscription() {
    var r = $s("Subscription"); if (!r) return;
    var cta = byText(r, "button", "Попробовать");
    // Пробный период — 30 дней от подключения. Запись до 0.17 («до 27 октября» без даты) уже истекла — убираем.
    var old = load("plus.v1", null);
    if (old && (!old.untilIso || daysTo(old.untilIso) < 0)) save("plus.v1", null);
    function draw() { var s = load("plus.v1", null); if (s) setBtn(cta, "«Плюс» активен до " + s.until + " ✓", DONE); }
    on(cta, function () {
      if (load("plus.v1", null)) {
        UI.sheet({ title: "АвтоХаб Плюс", html: '<p class="sheet-text">Пробный период активен до ' + load("plus.v1").until + '. Отменить можно в любой момент — деньги не спишутся.</p><button class="btn-light" data-action="off" style="height:48px">Отменить подписку</button>',
          onMount: function (b) { b.querySelector("[data-action=off]").addEventListener("click", function () { save("plus.v1", null); UI.close(function () { setBtn(cta, "Попробовать «Плюс» 30 дней бесплатно", { background: ACC, color: "#FFFFFF" }); UI.toast("Подписка отменена"); }); }); } });
        return;
      }
      var until = D.addDays(D.iso(), 30);
      save("plus.v1", { until: D.dayMonth(until), untilIso: D.iso(until), at: Date.now() }); draw();
      UI.dialog("«Плюс» подключён", "30 дней бесплатно, до " + D.dayMonth(until) + ". Регламентное ТО по фиксированной цене, кэшбэк ×2 и эвакуатор раз в год. Цена после пробного периода — [ЦЕНА] ₽/мес.", "Отлично");
    });
    draw();
  }

  /* ================= Ремонт онлайн ================= */
  function initRepair() {
    var r = $s("RepairLive"); if (!r) return;
    var ok = byText(r, "button", "Согласовать"), later = byText(r, "button", "Отложить");
    var step = byText(r, "div", "Нужно ваше решение");
    function decide(v) {
      save("repair.v1", v);
      var box = ok.parentNode;
      box.innerHTML = '<div class="decided ' + (v === "ok" ? "ok" : "") + '">' + (v === "ok" ? "✓ Согласовано: колодки из приложения, работа 1 200 ₽" : "Отложено — напомним при следующем ТО") + "</div>";
      if (step) { step.textContent = v === "ok" ? "Решение принято" : "Замена отложена"; var dot = step.parentNode.previousElementSibling; if (dot) { dot.textContent = "✓"; dot.style.background = "#0F6B3A"; dot.style.color = "#FFFFFF"; dot.style.border = "none"; } }
    }
    on(ok, function () { decide("ok"); UI.toast("Мастер получил согласование"); });
    on(later, function () { decide("later"); UI.toast("Работы отложены"); });
    var reply = r.querySelector('a[href="javascript:void(0)"]');
    if (reply) reply.addEventListener("click", function (e) {
      e.preventDefault();
      UI.sheet({ title: "Ответ мастеру", html: '<label class="fld">Сообщение<textarea id="rMsg" rows="3" placeholder="Можно фото колодок крупнее?"></textarea></label><button class="btn-dark" data-action="send">Отправить</button>',
        onMount: function (b) { b.querySelector("[data-action=send]").addEventListener("click", function () { UI.close(function () { UI.toast("Сообщение отправлено мастеру Алексею"); }); }); } });
    });
    var v = load("repair.v1", null); if (v) decide(v);
  }

  /* ================= Гарантии ================= */
  function initWarranty() {
    var r = $s("Warranty"); if (!r) return;
    var cta = byText(r, "button", "Поломка вернулась");
    on(cta, function () {
      var items = ["ТО-60 000 км · сервис", "Задние колодки · продавец", "Масляный фильтр MANN · продавец"];
      UI.sheet({ title: "Заявка по гарантии", html: items.map(function (t, i) { return '<button class="pick' + (i ? "" : " on") + '" data-w="' + i + '" data-action="w"><span class="pick-txt"><b>' + t + "</b></span></button>"; }).join("") +
        '<label class="fld">Что случилось<textarea id="wText" rows="3" placeholder="Снова загорелся индикатор масла"></textarea></label><span id="wErr" class="err" hidden></span>' +
        '<button class="btn-accent" data-action="send" style="height:52px">Открыть заявку</button>',
        onMount: function (b) {
          b.addEventListener("click", function (e) {
            var w = e.target.closest("[data-w]"); if (w) { b.querySelectorAll("[data-w]").forEach(function (x) { x.classList.toggle("on", x === w); }); return; }
            if (!e.target.closest("[data-action=send]")) return;
            if (!b.querySelector("#wText").value.trim()) { var er = b.querySelector("#wErr"); er.textContent = "Опишите, что случилось."; er.hidden = false; return; }
            var n = "W-" + String(Date.now()).slice(-5);
            UI.close(function () { setBtn(cta, "Заявка " + n + " открыта ✓", DONE); UI.dialog("Заявка " + n + " открыта", "Сервис свяжется с вами в течение 24 часов. Если не договоритесь, АвтоХаб вернёт деньги за работы.", "Хорошо"); });
          });
        } });
    });
  }

  /* ================= Паспорт авто ================= */
  function qrSvg(seed) {
    var n = 21, cells = "", h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    function finder(x, y) { return '<rect x="' + x + '" y="' + y + '" width="7" height="7" fill="#17191C"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#fff"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" fill="#17191C"/>'; }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue;
      h = (h * 1103515245 + 12345) >>> 0; if ((h >>> 16) & 1) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#17191C"/>';
    }
    return '<svg viewBox="-1 -1 23 23" width="180" height="180" role="img" aria-label="QR-код ссылки на паспорт"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/>' + cells + finder(0, 0) + finder(14, 0) + finder(0, 14) + "</svg>";
  }
  function initPassport() {
    var r = $s("CarPassport"); if (!r) return;
    on(byText(r, "button", "Поделиться с покупателем"), function () {
      var code = (car().vin || "XWE1234").slice(-4) + String(Date.now()).slice(-3), url = "https://autohub.example/p/" + code;
      UI.sheet({ title: "Паспорт для покупателя", html: '<div class="qrbox">' + qrSvg(url) + '<span class="mono">' + esc(url) + "</span><small>Ссылка действует 7 дней · без личных данных</small></div>" +
        '<button class="btn-dark" data-action="copy">Скопировать ссылку</button>' + (navigator.share ? '<button class="btn-light" data-action="share" style="height:48px">Отправить…</button>' : ""),
        onMount: function (b) {
          b.addEventListener("click", function (e) {
            if (e.target.closest("[data-action=copy]")) {
              (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { UI.toast("Ссылка скопирована"); }, function () { UI.toast("Ссылка: " + url); });
            }
            if (e.target.closest("[data-action=share]")) navigator.share({ title: "История " + carName(), url: url }).catch(function () {});
          });
        } });
    });
  }

  /* ================= Семейный гараж ================= */
  function initFamily() {
    var r = $s("Family"); if (!r) return;
    var cta = byText(r, "button", "Пригласить в гараж");
    var anchor = byText(r, "div", "МАШИНЫ СЕМЬИ");
    function draw() {
      Array.prototype.forEach.call(r.querySelectorAll(".fam-new"), function (e) { e.remove(); });
      load("family.v1", []).forEach(function (m) {
        var d = document.createElement("div"); d.className = "fam-new";
        d.innerHTML = '<span class="fam-av">' + esc(m.name.charAt(0).toUpperCase()) + '</span><div><b>' + esc(m.name) + "</b><span>" + esc(m.role) + " · приглашение отправлено на " + esc(m.phone) + "</span></div>";
        anchor.parentNode.insertBefore(d, anchor);
      });
    }
    on(cta, function () {
      UI.sheet({ title: "Пригласить в гараж", html: '<label class="fld">Имя<input id="fName" placeholder="Анна" autocomplete="off"></label><label class="fld">Телефон<input id="fPhone" type="tel" placeholder="+7 900 000-00-00"></label>' +
        '<div class="seg3"><button class="on" data-role="водитель" data-action="r">Водитель</button><button data-role="совладелец" data-action="r">Совладелец</button><button data-role="наблюдатель" data-action="r">Только смотрит</button></div>' +
        '<span id="fErr" class="err" hidden></span><button class="btn-accent" data-action="inv" style="height:52px">Отправить приглашение</button>',
        onMount: function (b) {
          var role = "водитель";
          b.addEventListener("click", function (e) {
            var ro = e.target.closest("[data-role]"); if (ro) { role = ro.dataset.role; b.querySelectorAll("[data-role]").forEach(function (x) { x.classList.toggle("on", x === ro); }); return; }
            if (!e.target.closest("[data-action=inv]")) return;
            var name = b.querySelector("#fName").value.trim(), phone = b.querySelector("#fPhone").value.trim();
            if (!name || phone.replace(/\D/g, "").length < 10) { var er = b.querySelector("#fErr"); er.textContent = "Укажите имя и телефон."; er.hidden = false; return; }
            var list = load("family.v1", []); list.push({ name: name, phone: phone, role: role }); save("family.v1", list);
            UI.close(function () { draw(); UI.toast("Приглашение отправлено: " + name); });
          });
        } });
    });
    draw();
  }

  function initCounts() {
    window.addEventListener("autohub:car", drawCounts);
    window.addEventListener("hashchange", function () { if (location.hash === "#Garage" || location.hash === "#CarPassport") { drawCounts(); drawGarageFines(); } });
    drawCounts(); drawGarageFines();
  }
  function init() {
    // Каждый экран отдельно: ошибка в одном не выключает остальные
    [initHistory, initBooking, initBookingDone, initFines, initTires, initInsurance, initSOS,
      initSubscription, initRepair, initWarranty, initPassport, initFamily, initCounts].forEach(function (f) {
      try { f(); } catch (e) { if (window.console) console.error("AutoHubScreens." + f.name, e); }
    });
  }
  window.AutoHubScreens = { init: init, addHistory: addHistory, historyCount: historyCount, finesUnpaid: finesUnpaid };
})();
