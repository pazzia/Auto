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

  /* ================= История обслуживания ================= */
  var HIST_DEMO = [
    { id: "h1", date: "2026-03-12", km: 45200, kind: "visit", title: "Замена масла и фильтров", place: "Автосервис «[Название]» · запись через приложение", cost: 6300,
      order: [["Замена масла ДВС", 900], ["Замена масляного фильтра", 300], ["Масло 5W-30, 4 л", 3150], ["Фильтр масляный", 640], ["Фильтр салонный", 590], ["Диагностика", 720]] },
    { id: "h2", date: "2026-02-03", km: null, kind: "purchase", title: "Колодки тормозные передние", place: "Магазин А · дешевле средней цены на 620 ₽", cost: 2480 },
    { id: "h3", date: "2025-09-18", km: 38900, kind: "visit", title: "Сезонная смена шин", place: "Шиномонтаж «[Название]» · добавлено вручную", cost: 2400 }
  ];
  var KIND = { visit: "ВИЗИТ В СЕРВИС", purchase: "ПОКУПКА", self: "СВОИМИ СИЛАМИ", booking: "ЗАПИСЬ" };
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  function fmtDate(iso) { var d = new Date(iso + "T12:00:00"); return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function history() {
    var all = load("history.v1", {}), id = car().id || "demo";
    if (!all[id]) { all[id] = HIST_DEMO; save("history.v1", all); }
    return all[id];
  }
  function addHistory(rec, carId) {
    var all = load("history.v1", {}), id = carId || car().id || "demo";
    if (!all[id]) all[id] = HIST_DEMO.slice();
    rec.id = "h" + Date.now(); all[id].unshift(rec); save("history.v1", all);
    drawHistory();
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
    on(head.querySelector('button[aria-label="Добавить запись"]'), addRecordSheet);
    hist.list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-order]"); if (!a) return;
      e.preventDefault();
      var rec = history().filter(function (h) { return h.id === a.dataset.order; })[0]; if (!rec) return;
      UI.sheet({ title: "Заказ-наряд", html: '<div class="kv">' + (rec.order || [[rec.title, rec.cost]]).map(function (x) {
        return '<div><span>' + esc(x[0]) + "</span><b>" + rub(x[1]) + "</b></div>"; }).join("") +
        '<div class="kv-total"><span>Итого</span><b>' + rub(rec.cost) + "</b></div></div>" +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">' + esc(rec.place) + " · " + fmtDate(rec.date) + "</p>" +
        '<button class="btn-dark" data-close="1" data-action="close">Закрыть</button>' });
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
      html += '<div class="hist-row' + (h.kind === "booking" ? " future" : "") + '"><span class="hist-dot ' + h.kind + '"></span><div class="hist-card">' +
        '<div class="hist-meta"><span>' + fmtDate(h.date) + (h.km ? " · " + h.km.toLocaleString("ru-RU") + " км" : "") + '</span><span class="hist-kind">' + KIND[h.kind] + "</span></div>" +
        '<div class="hist-title">' + esc(h.title) + '</div><div class="hist-place">' + esc(h.place || "") + "</div>" +
        '<div class="hist-foot"><b>' + (h.cost ? rub(h.cost) : h.kind === "booking" ? "предварительно" : "—") + "</b>" +
        (h.kind === "visit" ? '<a href="#" data-order="' + h.id + '">Заказ-наряд</a>' : "") + "</div></div></div>";
    });
    hist.list.innerHTML = html || '<div class="empty"><b>Записей пока нет</b><span>Добавьте визит в сервис или покупку кнопкой «+ Запись».</span></div>';
  }
  function addRecordSheet() {
    var today = new Date().toISOString().slice(0, 10);
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
  var DAYS = [["вт", 29, 8], ["ср", 30, 8], ["чт", 1, 9], ["пт", 2, 9], ["сб", 3, 9]];
  var WD = { "вт": "вторник", "ср": "среда", "чт": "четверг", "пт": "пятница", "сб": "суббота" };
  var MSHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сент", "окт", "нояб", "дек"];
  var bk = { day: 4, time: null };
  function initBooking() {
    var r = $s("ServiceBooking"); if (!r) return;
    bk.root = r;
    bk.days = byText(r, "div", "ДАТА").parentNode.querySelectorAll("button");
    bk.times = byText(r, "div", "СВОБОДНОЕ ВРЕМЯ").parentNode.querySelectorAll("button");
    bk.cta = r.querySelector('a[href="#BookingDone"]');
    bk.total = byText(r, "span", "Работы, предварительно").nextElementSibling;
    bk.checks = r.querySelectorAll('input[type="checkbox"]');
    bk.days.forEach(function (b, i) { on(b, function () { bk.day = i; bk.time = null; drawBooking(); }); });
    bk.times.forEach(function (b, i) { on(b, function () { if (b.disabled) return; bk.time = i; drawBooking(); }); });
    bk.checks.forEach(function (c) { c.addEventListener("change", drawBooking); });
    bk.cta.addEventListener("click", function (e) {
      if (bk.time == null) { e.preventDefault(); UI.toast("Выберите время визита"); return; }
      var d = DAYS[bk.day], t = bk.times[bk.time].textContent.trim(), svc = service();
      var works = []; if (bk.checks[0] && bk.checks[0].checked) works.push("ТО-60 000 км"); if (bk.checks[1] && bk.checks[1].checked) works.push("Компьютерная диагностика");
      var b = { when: d[0] + ", " + d[1] + " " + MONTHS[d[2]] + ", " + t, short: d[1] + " " + MSHORT[d[2]] + ", " + t, day: d[1], mon: MSHORT[d[2]].toUpperCase(), time: t,
        service: svc.name, address: svc.town ? svc.town + ", " + svc.address : "[адрес]", works: works.join(", ") || "Осмотр", own: bk.checks[2] && bk.checks[2].checked,
        car: carName(), carId: car().id, total: totalWorks() };
      save("booking.v1", b);
      if (window.AutoHubTO) setTimeout(window.AutoHubTO.renderGarage, 0);
      addHistory({ date: "2026-" + (d[2] + 1 < 10 ? "0" : "") + (d[2] + 1) + "-" + (d[1] < 10 ? "0" : "") + d[1], km: null, kind: "booking",
        title: b.works, place: b.service + " · " + t, cost: 0 });
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#ServiceBooking") drawBooking(); });
    drawBooking();
  }
  function service() {
    try { var s = JSON.parse(sessionStorage.getItem("autohub.serviceObj") || "null"); if (s) return s; } catch (e) {}
    return { name: "Автосервис «[Название]»", ratingGis: 4.8, distanceKm: 1.2, town: "", address: "" };
  }
  function totalWorks() { var t = 0; if (bk.checks[0] && bk.checks[0].checked) t += 3900; if (bk.checks[1] && bk.checks[1].checked) t += 1200; return t; }
  function drawBooking() {
    var svc = service(), head = bk.root.children[0].children[1];
    if (head) {
      head.children[0].textContent = svc.name;
      head.children[1].textContent = "★ " + (svc.ratingGis || 4.8).toFixed(1) + " · " + String(svc.distanceKm || 1.2).replace(".", ",") + " км · " + (svc.town || "запись через 2ГИС");
    }
    bk.days.forEach(function (b, i) {
      var sel = i === bk.day;
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
    bk.cta.textContent = bk.time == null ? "Выберите время" : "Записаться на " + d[1] + " " + MSHORT[d[2]] + ", " + bk.times[bk.time].textContent.trim();
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
  // Карточка «Запись в сервис» в гараже
  function drawGarageBooking() {
    var g = $s("Garage"); if (!g) return;
    var t = byText(g, "div", "Запись в сервис"); if (!t) return;
    var b = load("booking.v1", null); if (!b) return;
    t.textContent = "Запись в сервис · " + b.time;
    if (t.nextElementSibling) t.nextElementSibling.textContent = b.service + " · " + b.works;
    var box = t.closest("a") || t.parentNode.parentNode;
    var cal = box.querySelector("span"), spans = cal && cal.querySelectorAll("span");
    if (spans && spans.length >= 2) { spans[0].textContent = b.day; spans[1].textContent = b.mon; }
  }

  /* ================= Штрафы ================= */
  var FINES = [{ id: "f1", disc: 250, full: 500 }, { id: "f2", disc: 500, full: 1000 }];
  function initFines() {
    var r = $s("Fines"); if (!r) return;
    var pays = Array.prototype.filter.call(r.querySelectorAll("button"), function (b) { return b.textContent.trim() === "Оплатить"; });
    var all = byText(r, "button", "Оплатить оба");
    var stats = byText(r, "div", "Неоплачено").parentNode.parentNode.children;
    function paid() { return load("fines.v1", {}); }
    function draw() {
      var p = paid(), left = FINES.filter(function (f) { return !p[f.id]; });
      pays.forEach(function (b, i) {
        var card = b.closest('div[style*="border-radius: 18px"]') || b.parentNode.parentNode;
        if (p[FINES[i].id]) { setBtn(b, "Оплачен ✓", DONE); b.disabled = true; card.style.opacity = ".6"; }
      });
      stats[0].lastElementChild.textContent = left.length;
      stats[1].lastElementChild.textContent = rub(left.reduce(function (s, f) { return s + f.disc; }, 0));
      stats[2].lastElementChild.textContent = rub(left.reduce(function (s, f) { return s + f.full - f.disc; }, 0));
      if (!left.length) { setBtn(all, "Все штрафы оплачены ✓", DONE); all.disabled = true; }
      else if (left.length === 1) setBtn(all, "Оплатить со скидкой · " + rub(left[0].disc));
      drawGarageFines();
    }
    function pay(ids) {
      var sum = FINES.filter(function (f) { return ids.indexOf(f.id) >= 0; }).reduce(function (s, f) { return s + f.disc; }, 0);
      UI.sheet({ title: "Оплата штрафа", html: '<div class="kv"><div><span>К оплате со скидкой 50%</span><b>' + rub(sum) + '</b></div><div><span>Комиссия</span><b>0 ₽</b></div><div><span>Карта</span><b>•••• 4242 (демо)</b></div></div>' +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Прототип: деньги не списываются. В рабочей версии оплата пройдёт через платёжного партнёра с доступом к ГИС ГМП.</p>' +
        '<button class="btn-accent" data-action="pay" style="height:52px">Оплатить ' + rub(sum) + "</button>",
        onMount: function (b) {
          b.querySelector("[data-action=pay]").addEventListener("click", function () {
            var p = paid(); ids.forEach(function (id) { p[id] = true; }); save("fines.v1", p);
            UI.close(function () { draw(); UI.toast("Оплачено. Квитанция сохранена в истории"); });
          });
        } });
    }
    pays.forEach(function (b, i) { on(b, function () { if (!paid()[FINES[i].id]) pay([FINES[i].id]); }); });
    on(all, function () { var p = paid(); var ids = FINES.filter(function (f) { return !p[f.id]; }).map(function (f) { return f.id; }); if (ids.length) pay(ids); });
    draw();
  }
  function drawGarageFines() {
    var g = $s("Garage"); if (!g) return;
    var a = g.querySelector('a[href="#Fines"]'); if (!a) return;
    var p = load("fines.v1", {}), left = FINES.filter(function (f) { return !p[f.id]; });
    var t = a.querySelectorAll(":scope > span");
    if (!left.length) {
      t[0].textContent = "✓"; t[0].style.background = "#0F6B3A"; a.style.background = "#DDF0E4";
      t[1].innerHTML = '<span style="font-weight: 700; font-size: 14px">Штрафов нет</span><span style="font-size: 12px; color: #0F6B3A; font-weight: 600">Проверяем каждый день по ГИС ГМП</span>';
    } else {
      t[0].textContent = left.length;
      t[1].firstElementChild.textContent = (left.length === 1 ? "Новый штраф · " : "Новые штрафы · ") + rub(left.reduce(function (s, f) { return s + f.disc; }, 0)) + " со скидкой";
    }
  }

  /* ================= Шины ================= */
  function initTires() {
    var r = $s("Tires"); if (!r) return;
    var slots = byText(r, "div", "БЛИЖАЙШИЕ ОКНА РЯДОМ").nextElementSibling.querySelectorAll("button");
    var cta = byText(r, "button", "Записаться на");
    var sel = 0, done = load("tires.v1", null);
    function label(b) { var s = b.querySelector("span"); return (s ? s.textContent : "") + " " + b.lastChild.textContent.trim(); }
    function draw() {
      slots.forEach(function (b, i) {
        var on2 = i === sel;
        b.style.background = on2 ? "#17191C" : "#FFFFFF"; b.style.color = on2 ? "#FFFFFF" : "#17191C"; b.style.borderColor = on2 ? "#17191C" : "#E2DED6";
      });
      if (done) setBtn(cta, "Вы записаны · " + done, DONE);
      else setBtn(cta, "Записаться на " + label(slots[sel]).replace(",", ", сент,").replace(/\s+/g, " "));
    }
    slots.forEach(function (b, i) { on(b, function () { if (done) { done = null; save("tires.v1", null); } sel = i; draw(); }); });
    on(cta, function () {
      if (done) { UI.toast("Вы уже записаны. Выберите другое окно, чтобы перенести"); return; }
      done = label(slots[sel]); save("tires.v1", done);
      addHistory({ date: "2026-09-" + (label(slots[sel]).match(/\d+/) || ["28"])[0], km: null, kind: "booking", title: "Сезонная смена шин", place: "Шиномонтаж · " + done, cost: 0 });
      draw(); UI.dialog("Записали на шиномонтаж", "Окно " + done + ". Зимние заберём с хранения к визиту, летние сдадим на хранение. Напомним накануне.", "Хорошо");
    });
    draw();
  }

  /* ================= Страховка ================= */
  function initInsurance() {
    var r = $s("Insurance"); if (!r) return;
    var cards = ["Страховая А", "Страховая Б", "Страховая В"].map(function (n) { return byText(r, "span", n).closest('div[style*="border-radius"]'); });
    var prices = [7840, 8120, 8900], sel = 0;
    var cta = byText(r, "button", "Продлить ОСАГО");
    var kasko = byText(r, "span", "КАСКО"); kasko = kasko && kasko.closest('div[style*="border-radius"]');
    var status = byText(r, "span", "ОСАГО заканчивается");
    function draw() {
      cards.forEach(function (c, i) { if (!c) return; c.style.border = i === sel ? "1.5px solid " + ACC : "1px solid #E2DED6"; c.style.cursor = "pointer"; });
      var done = load("osago.v1", null);
      if (done) {
        setBtn(cta, "ОСАГО продлён ✓ · " + done.insurer, DONE);
        if (status) { status.textContent = "ОСАГО действует"; status.nextElementSibling.textContent = "до 24 октября 2027"; status.nextElementSibling.style.color = "#0F6B3A"; }
      } else setBtn(cta, "Продлить ОСАГО за " + rub(prices[sel]));
    }
    cards.forEach(function (c, i) { if (c) { c.setAttribute("role", "button"); c.tabIndex = 0; c.addEventListener("click", function () { if (!load("osago.v1", null)) { sel = i; draw(); } }); } });
    if (kasko) { kasko.style.cursor = "pointer"; kasko.addEventListener("click", function () {
      UI.sheet({ title: "Расчёт КАСКО", html: '<div class="kv"><div><span>Страховая А</span><b>от 38 400 ₽</b></div><div><span>Страховая Б</span><b>от 41 900 ₽</b></div><div><span>Страховая В</span><b>от 45 200 ₽</b></div></div>' +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Демо-расчёт для ' + esc(carName()) + ", стаж 10 лет, франшиза 15 000 ₽. Точную цену дадут страховые после подключения брокера.</p>" +
        '<button class="btn-dark" data-close="1" data-action="close">Понятно</button>' }); }); }
    on(cta, function () {
      if (load("osago.v1", null)) { UI.toast("Полис уже продлён"); return; }
      var name = ["Страховая А", "Страховая Б", "Страховая В"][sel];
      UI.sheet({ title: "Продление ОСАГО", html: '<div class="kv"><div><span>Страховая</span><b>' + name + '</b></div><div><span>Срок</span><b>25.10.2026 – 24.10.2027</b></div><div><span>Водители</span><b>2</b></div><div class="kv-total"><span>К оплате</span><b>' + rub(prices[sel]) + "</b></div></div>" +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Прототип: полис не оформляется, деньги не списываются.</p><button class="btn-accent" data-action="buy" style="height:52px">Оформить е-ОСАГО</button>',
        onMount: function (b) { b.querySelector("[data-action=buy]").addEventListener("click", function () {
          save("osago.v1", { insurer: name, price: prices[sel] }); UI.close(function () { draw(); UI.toast("Полис отправлен на почту (демо)"); });
        }); } });
    });
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
    function draw() { var s = load("plus.v1", null); if (s) setBtn(cta, "«Плюс» активен до " + s.until + " ✓", DONE); }
    on(cta, function () {
      if (load("plus.v1", null)) {
        UI.sheet({ title: "АвтоХаб Плюс", html: '<p class="sheet-text">Пробный период активен до ' + load("plus.v1").until + '. Отменить можно в любой момент — деньги не спишутся.</p><button class="btn-light" data-action="off" style="height:48px">Отменить подписку</button>',
          onMount: function (b) { b.querySelector("[data-action=off]").addEventListener("click", function () { save("plus.v1", null); UI.close(function () { setBtn(cta, "Попробовать «Плюс» 30 дней бесплатно", { background: ACC, color: "#FFFFFF" }); UI.toast("Подписка отменена"); }); }); } });
        return;
      }
      save("plus.v1", { until: "27 октября" }); draw();
      UI.dialog("«Плюс» подключён", "30 дней бесплатно, до 27 октября. Регламентное ТО по фиксированной цене, кэшбэк ×2 и эвакуатор раз в год. Цена после пробного периода — [ЦЕНА] ₽/мес.", "Отлично");
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

  function init() {
    // Каждый экран отдельно: ошибка в одном не выключает остальные
    [initHistory, initBooking, initBookingDone, initFines, initTires, initInsurance, initSOS,
      initSubscription, initRepair, initWarranty, initPassport, initFamily, drawGarageFines].forEach(function (f) {
      try { f(); } catch (e) { if (window.console) console.error("AutoHubScreens." + f.name, e); }
    });
  }
  window.AutoHubScreens = { init: init, addHistory: addHistory };
})();
