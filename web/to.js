/* АвтоХаб: сквозной сценарий ТО — от напоминания до выполненной работы.
 *
 * Шаги (адрес #TO/<шаг>, кнопка «Назад» телефона ходит по шагам):
 *   plan    — какое ТО и что в него входит (по пробегу и прошлому ТО);
 *   parts   — запчасти: оригинал / оптимально / дешевле, лучшая цена среди площадок, срок доставки;
 *   service — лучший автосервис рядом с адресом пользователя (рейтинг + расстояние);
 *   time    — время визита не раньше, чем приедут все запчасти;
 *   pay     — оплата запчастей с доставкой в сервис (или домой);
 *   order   — статус заказа → ТО выполнено → история, оценка, следующее ТО.
 * Все данные — через AutoHubApi (мок-интеграции), состояние — на телефоне.
 */
(function () {
  "use strict";

  var API = window.AutoHubApi, UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var STEPS = [["plan", "ТО"], ["parts", "Запчасти"], ["service", "Сервис"], ["time", "Время"], ["pay", "Оплата"]];
  var TIERS = [["original", "Оригинал", "как с завода, дороже"], ["optimal", "Оптимально", "лучшие отзывы за разумные деньги"], ["cheap", "Дешевле", "самые доступные из проверенных"]];
  var WHY = {
    oil: "Масло смазывает двигатель. Старое густеет и хуже защищает.",
    oilf: "Задерживает грязь из масла — меняют вместе с маслом.",
    cabin: "Чистит воздух в салоне — меньше пыли и запахов.",
    diag: "Мастер проверит подвеску, тормоза и уровни жидкостей.",
    air: "Даёт двигателю чистый воздух — меньше расход топлива.",
    brake: "Со временем набирает влагу, и тормоза становятся мягче.",
    plugs: "Поджигают топливо. Изношенные — машина хуже заводится."
  };
  var STAGES = ["Заказ оплачен", "Запчасти едут", "Запчасти в сервисе", "Машина в сервисе", "ТО выполнено"];
  var WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  var MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var MONF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var TIMES = ["09:00", "10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

  function rub(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function km(n) { return Math.round(n).toLocaleString("ru-RU") + " км"; }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
  function today() { var d = new Date(); d.setHours(12, 0, 0, 0); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function dShort(d) { d = new Date(d); return WD[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()]; }
  function dLong(d) { d = new Date(d); return d.getDate() + " " + MONF[d.getMonth()]; }
  function iso(d) { d = new Date(d); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("autohub." + k, JSON.stringify(v)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function car() { return window.AutoHubCar ? window.AutoHubCar.active() : {}; }
  function carName(c) { c = c || car(); return [c.make, c.model].filter(Boolean).join(" ") || "Автомобиль"; }
  function where() { return window.AutoHubAuth ? window.AutoHubAuth.location() : { city: "Красногорск", address: "", lat: 55.8215, lng: 37.3302 }; }

  /* ---------- Состояние: черновик ТО (по машине) и заказы ---------- */
  var opts = {};          // варианты деталей по позициям (из API)
  var services = null;    // сервисы рядом
  function drafts() { return load("todraft.v1", {}); }
  function draft() {
    var c = car(), all = drafts(), t = API.maintenance.nextTO(c), d = all[c.id];
    if (!d || d.km !== t.km) d = { km: t.km, tier: "optimal", picks: {}, serviceId: null, date: null, time: null, delivery: "service", usePoints: false };
    return d;
  }
  function saveDraft(d) { var all = drafts(); all[car().id] = d; save("todraft.v1", all); }
  function orders() { return load("orders.v1", {}); }
  function order(carId) { var o = orders()[carId || car().id]; return o && !o.archived ? o : null; }
  function saveOrder(o) { var all = orders(); all[o.carId] = o; save("orders.v1", all); }
  function points() { return load("points.v1", 1240); }

  /* ---------- Расчёты ---------- */
  function loadOptions(t) {
    var need = t.parts.filter(function (r) { return !opts[r.part]; });
    return Promise.all(need.map(function (r) { return API.maintenance.options(r.part).then(function (d) { opts[r.part] = d; }); }));
  }
  function applyTier(d, t, tier) {
    d.tier = tier;
    t.parts.forEach(function (r) { var o = opts[r.part] && opts[r.part].tiers[tier]; if (o) d.picks[r.part] = { id: o.id, market: o.best.market }; });
  }
  function ensurePicks(d, t) {
    t.parts.forEach(function (r) { if (!d.picks[r.part] && opts[r.part]) { var o = opts[r.part].tiers[d.tier]; d.picks[r.part] = { id: o.id, market: o.best.market }; } });
  }
  function pickOf(d, r) {
    var p = d.picks[r.part], data = opts[r.part]; if (!p || !data) return null;
    var o = data.options.filter(function (x) { return x.id === p.id; })[0]; if (!o) return null;
    var off = o.offers.filter(function (x) { return x.market === p.market; })[0] || o.best;
    return { opt: o, offer: off, qty: r.qty || 1, sum: off.price * (r.qty || 1), tier: tierOf(data, o) };
  }
  function tierOf(data, o) { var t = []; TIERS.forEach(function (x) { if (data.tiers[x[0]] && data.tiers[x[0]].id === o.id) t.push(x[1]); }); return t; }
  function totals(d, t) {
    var lines = t.parts.map(function (r) { return pickOf(d, r); }).filter(Boolean);
    var markets = {};
    lines.forEach(function (l) { var m = l.offer.market; if (!markets[m]) markets[m] = { name: l.offer.marketName, delivery: l.offer.delivery, days: 0, sum: 0 }; markets[m].days = Math.max(markets[m].days, l.offer.days); markets[m].sum += l.sum; });
    var parts = lines.reduce(function (s, l) { return s + l.sum; }, 0);
    var delivery = Object.keys(markets).reduce(function (s, m) { return s + markets[m].delivery; }, 0);
    var days = lines.reduce(function (s, l) { return Math.max(s, l.offer.days); }, 0);
    return { lines: lines, markets: markets, parts: parts, delivery: delivery, days: days, eta: addDays(today(), days), earliest: addDays(today(), days + 1) };
  }
  function rankServices(list) {
    // Для ТО — только сервисы, которые делают ТО (не кузовные и не шиномонтаж); онлайн-запись заметно выше
    return list.filter(function (s) { return s.priceTO && s.kind !== "body"; }).map(function (s) {
      var score = s.ratingGis * 20 + (s.ratingYa || s.ratingGis) * 5 - s.distanceKm * 1.5 + (s.online ? 10 : 0);
      return Object.assign({ score: score }, s);
    }).sort(function (a, b) { return b.score - a.score; });
  }
  function busy(serviceId, date, time) { var h = 0, s = serviceId + iso(date) + time; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 3 === 0; }

  /* ---------- Каркас экрана ---------- */
  function stepOf() { var p = location.hash.split("/"); return p[0] === "#TO" ? (p[1] || "plan") : null; }
  function go(step) { location.hash = "#TO" + (step === "plan" ? "" : "/" + step); }
  function renderSteps(step) {
    var el = $("toSteps"); if (step === "order") { el.hidden = true; return; }
    el.hidden = false;
    var idx = STEPS.map(function (s) { return s[0]; }).indexOf(step);
    el.innerHTML = STEPS.map(function (s, i) {
      return '<div class="to-step' + (i < idx ? " done" : i === idx ? " on" : "") + '"><span></span><small>' + s[1] + "</small></div>";
    }).join("");
    el.setAttribute("aria-label", "Шаг " + (idx + 1) + " из " + STEPS.length + ": " + STEPS[idx][1]);
  }
  function head(title, sub) { $("toTitle").textContent = title; $("toSub").textContent = sub; }
  function foot(html) { var f = $("toFoot"); f.innerHTML = html || ""; f.hidden = !html; }
  function body(html) { var b = $("toBody"); b.innerHTML = html; b.scrollTop = 0; }

  function render() {
    var step = stepOf(); if (!step || !$("toBody")) return;
    var c = car(), t = API.maintenance.nextTO(c), o = order(c.id);
    // Есть активный заказ — показываем его статус
    if (o && step !== "order") { history.replaceState(null, "", "#TO/order"); step = "order"; }
    if (!o && step === "order") { history.replaceState(null, "", "#TO"); step = "plan"; }
    renderSteps(step);
    var d = draft();
    // Нельзя перепрыгнуть шаг без выбора на предыдущем
    if ((step === "time" || step === "pay") && !d.serviceId) { history.replaceState(null, "", "#TO/service"); step = "service"; renderSteps(step); }
    if (step === "pay" && (!d.date || !d.time)) { history.replaceState(null, "", "#TO/time"); step = "time"; renderSteps(step); }
    ({ plan: renderPlan, parts: renderParts, service: renderService, time: renderTime, pay: renderPay, order: renderOrder }[step] || renderPlan)(c, t, d, o);
  }

  /* ================= 1. Что за ТО ================= */
  function renderPlan(c, t, d) {
    head("ТО-" + t.km.toLocaleString("ru-RU") + " км", carName(c) + " · по регламенту производителя");
    if (t.noMileage) {
      body('<div class="to-card"><b class="to-h">Сколько сейчас на одометре?</b><p class="to-p">По пробегу рассчитаем, какое ТО следующее и что в него входит.</p>' +
        '<label class="fld">Пробег, км<input id="toMil" inputmode="numeric" placeholder="58 400" autocomplete="off"></label><span id="toMilErr" class="err" hidden></span></div>');
      foot('<button class="btn-accent" data-to="mileage">Рассчитать ТО</button>');
      return;
    }
    var perDay = 45, when = addDays(today(), Math.max(0, Math.round(t.left / perDay)));
    var sinceLast = c.lastTOkm ? c.mileage - c.lastTOkm : c.mileage - (t.km - API.maintenance.step);
    var pct = Math.max(4, Math.min(100, Math.round(sinceLast / API.maintenance.step * 100)));
    var hours = 1 + t.items.length * 0.25;
    body('<div class="to-hero' + (t.soon || t.overdue ? " soon" : "") + '"><div class="to-hero-top"><span>Сейчас ' + km(c.mileage) + "</span><b>" +
      (t.overdue ? "Пора на ТО" : "осталось " + km(t.left)) + '</b></div><div class="to-bar"><div style="width:' + pct + '%"></div></div>' +
      '<span class="to-hero-note">' + (t.overdue ? "Плановый пробег уже пройден — лучше не откладывать." : "Удобно пройти до " + dLong(when) + " — примерно столько вы проедете " + km(t.left) + ".") + "</span></div>" +
      '<div class="to-sec">ЧТО СДЕЛАЮТ · ~' + String(hours).replace(".", ",") + " ч</div>" +
      '<div class="to-list">' + t.items.map(function (r) {
        return '<div class="to-li"><span class="to-ok">✓</span><div><b>' + esc(r.work) + "</b><span>" + esc(WHY[r.key] || "") + "</span></div></div>";
      }).join("") + "</div>" +
      '<div class="to-card to-row"><div><b>' + t.parts.length + " " + plural(t.parts.length, "деталь", "детали", "деталей") + '</b><span>подберём по цене, отзывам и сроку доставки</span></div><span class="to-mk">5 площадок</span></div>' +
      '<div class="to-links"><button class="linkbtn" data-to="done-elsewhere">Уже прошёл это ТО</button><button class="linkbtn" data-to="later">Напомнить позже</button></div>');
    foot('<button class="btn-accent" data-to="next-parts">Подобрать запчасти</button>');
  }

  /* ================= 2. Запчасти ================= */
  function renderParts(c, t, d) {
    head("Запчасти к ТО-" + t.km.toLocaleString("ru-RU"), carName(c) + " · подходят по VIN");
    body('<div class="loading">Сравниваем цены на Exist, Emex, Автопитер, ZZap и Autodoc…</div>'); foot("");
    loadOptions(t).then(function () {
      if (stepOf() !== "parts") return;
      ensurePicks(d, t); saveDraft(d);
      var tot = totals(d, t);
      body('<div class="to-tiers" role="radiogroup" aria-label="Подбор деталей">' + TIERS.map(function (x) {
          return '<button role="radio" aria-checked="' + (d.tier === x[0]) + '" class="' + (d.tier === x[0] ? "on" : "") + '" data-tier="' + x[0] + '" data-action="tier"><b>' + x[1] + "</b><span>" + x[2] + "</span></button>";
        }).join("") + "</div>" +
        t.parts.map(function (r) {
          var l = pickOf(d, r); if (!l) return "";
          return '<div class="to-part"><div class="to-part-top"><div><span class="to-part-t">' + esc(l.opt.name) + (l.qty > 1 ? " × " + l.qty : "") + '</span><b>' + esc(l.opt.brand) + '</b><span class="mono">' + esc(l.opt.article) + "</span></div>" +
            '<div class="to-price"><b>' + rub(l.sum) + "</b><span>" + esc(l.offer.marketName) + "</span></div></div>" +
            '<div class="to-part-meta"><span class="to-star">★ ' + l.opt.rating.toFixed(1) + "</span><span>" + l.opt.reviews.toLocaleString("ru-RU") + " отзывов</span><span>привезут " + dShort(addDays(today(), l.offer.days)) + "</span>" +
            (l.tier.length ? '<span class="to-badge">' + esc(l.tier.join(" · ")) + "</span>" : '<span class="to-badge own">ваш выбор</span>') + "</div>" +
            '<button class="to-more" data-slot="' + r.part + '" data-action="alt">Другие варианты и магазины ›</button></div>';
        }).join("") +
        '<div class="to-note">Цены и наличие — с площадок Exist, Emex, Автопитер, ZZap и Autodoc (демо-интеграции). Все детали подходят к ' + esc(carName(c)) + ".</div>");
      foot('<div class="to-sum"><span>Запчасти · ' + t.parts.length + " поз.</span><b>" + rub(tot.parts) + '</b></div><div class="to-sum sub"><span>Все приедут к ' + dShort(tot.eta) + "</span><span>" + Object.keys(tot.markets).length + " " + plural(Object.keys(tot.markets).length, "магазин", "магазина", "магазинов") + "</span></div>" +
        '<button class="btn-accent" data-to="next-service">Выбрать автосервис</button>');
    });
  }
  function altSheet(slot) {
    var d = draft(), data = opts[slot]; if (!data) return;
    var cur = d.picks[slot] || {};
    UI.sheet({ title: data.title,
      html: '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Выберите деталь и магазин. Отметка — где выгоднее с учётом срока.</p>' +
        data.options.map(function (o) {
          var tags = tierOf(data, o);
          return '<div class="alt' + (o.id === cur.id ? " on" : "") + '"><div class="alt-h"><div><b>' + esc(o.brand) + '</b> <span class="mono">' + esc(o.article) + "</span>" +
            (tags.length ? ' <span class="to-badge">' + esc(tags.join(" · ")) + "</span>" : "") + (o.original ? ' <span class="to-badge dark">оригинал</span>' : "") +
            '</div><span class="to-star">★ ' + o.rating.toFixed(1) + " · " + o.reviews.toLocaleString("ru-RU") + "</span></div>" +
            o.offers.map(function (f) {
              var sel = o.id === cur.id && f.market === cur.market, best = f.market === o.best.market;
              return '<button class="alt-o' + (sel ? " on" : "") + '" data-opt="' + esc(o.id) + '" data-market="' + f.market + '" data-action="pick-offer"><span>' + esc(f.marketName) + (best ? " · выгоднее" : "") + "</span><span>" + dShort(addDays(today(), f.days)) + "</span><b>" + rub(f.price) + "</b></button>";
            }).join("") + "</div>";
        }).join(""),
      onMount: function (b) {
        b.addEventListener("click", function (e) {
          var x = e.target.closest("[data-opt]"); if (!x) return;
          d.picks[slot] = { id: x.dataset.opt, market: x.dataset.market };
          var t = API.maintenance.nextTO(car());
          d.tier = TIERS.filter(function (tr) { return t.parts.every(function (r) { var p = d.picks[r.part], o = opts[r.part] && opts[r.part].tiers[tr[0]]; return p && o && p.id === o.id && p.market === o.best.market; }); }).map(function (tr) { return tr[0]; })[0] || "custom";
          saveDraft(d); UI.close(render);
        });
      } });
  }

  /* ================= 3. Автосервис ================= */
  function renderService(c, t, d) {
    var w = where();
    head("Где пройти ТО", "рядом с вами · по рейтингу и расстоянию");
    body('<div class="loading">Ищем автосервисы рядом…</div>'); foot("");
    API.services.list({ lat: w.lat, lng: w.lng }).then(function (r) {
      if (stepOf() !== "service") return;
      services = rankServices(r.items);
      if (!d.serviceId && services[0]) { d.serviceId = services[0].id; saveDraft(d); }
      var sel = services.filter(function (s) { return s.id === d.serviceId; })[0] || services[0];
      body('<button class="to-addr" data-to="address"><span>📍</span><div><b>' + esc(w.city + (w.address ? ", " + w.address : "")) + "</b><span>подбираем сервисы от этого адреса</span></div><span class=\"linkbtn\">Изменить</span></button>" +
        services.slice(0, 6).map(function (s, i) {
          var price = API.maintenance.worksPrice(s, t.items), on = s.id === sel.id;
          return '<button class="to-svc' + (on ? " on" : "") + '" data-svc="' + s.id + '" data-action="svc" aria-pressed="' + on + '">' +
            '<div class="to-svc-h"><b>' + esc(s.name) + "</b>" + (i === 0 ? '<span class="to-badge">Лучший выбор</span>' : "") + "</div>" +
            "<span>" + String(s.distanceKm).replace(".", ",") + " км · " + esc(s.town) + " · " + esc(s.hours) + "</span>" +
            '<div class="to-svc-m"><span class="to-star">★ ' + s.ratingGis.toFixed(1) + " 2ГИС · " + (s.ratingYa || s.ratingGis).toFixed(1) + " Яндекс</span>" +
            "<b>" + rub(price) + "</b></div>" + (s.online ? "" : '<span class="to-warn">запись по телефону — подтвердим за вас</span>') + "</button>";
        }).join("") + '<div class="to-note">«Лучший выбор» — баланс оценок в 2ГИС и Яндексе, расстояния и онлайн-записи. Цена — работы по этому ТО, запчасти уже выбраны.</div>');
      var price = API.maintenance.worksPrice(sel, t.items);
      foot('<div class="to-sum"><span>Работы · ' + esc(sel.name) + "</span><b>" + rub(price) + '</b></div><button class="btn-accent" data-to="next-time">Выбрать время</button>');
    });
  }

  /* ================= 4. Время ================= */
  function slotsHtml(d, earliest, serviceId) {
    var days = []; for (var i = 0; i < 6; i++) days.push(addDays(earliest, i));
    if (!d.date || d.date < iso(earliest)) { d.date = iso(days[0]); d.time = null; } // сравнение строк ГГГГ-ММ-ДД — без сдвига часовых поясов
    return '<div class="to-days">' + days.map(function (x) {
        var on = iso(x) === d.date;
        return '<button class="' + (on ? "on" : "") + '" data-date="' + iso(x) + '" data-action="day" aria-pressed="' + on + '"><span>' + WD[x.getDay()] + "</span><b>" + x.getDate() + "</b><small>" + MON[x.getMonth()] + "</small></button>";
      }).join("") + '</div><div class="to-times">' + TIMES.map(function (tm) {
        var b = busy(serviceId, d.date, tm), on = d.time === tm && !b;
        return '<button class="' + (on ? "on" : "") + '" data-time="' + tm + '" data-action="time"' + (b ? " disabled aria-label=\"" + tm + " занято\"" : "") + ">" + tm + "</button>";
      }).join("") + "</div>";
  }
  function renderTime(c, t, d) {
    head("Когда удобно", "сервис · дата и время визита");
    loadOptions(t).then(function () {
      if (stepOf() !== "time") return;
      ensurePicks(d, t);
      var tot = totals(d, t), svc = serviceObj(d);
      body('<div class="to-info"><b>Запчасти приедут в сервис ' + dShort(tot.eta) + "</b><span>Поэтому запись — не раньше " + dShort(tot.earliest) + ". Так не придётся ждать деталей в сервисе.</span></div>" +
        '<div class="to-card to-row"><div><b>' + esc(svc ? svc.name : "Автосервис") + "</b><span>" + esc(svc ? svc.town + " · " + String(svc.distanceKm).replace(".", ",") + " км" : "") + '</span></div><button class="linkbtn" data-to="back-service">Другой</button></div>' +
        slotsHtml(d, tot.earliest, d.serviceId) + '<div class="to-note">Занятые окна зачёркнуты. Работы займут около ' + String(1 + t.items.length * 0.25).replace(".", ",") + " ч — можно подождать в сервисе.</div>");
      saveDraft(d);
      foot('<div class="to-sum"><span>Визит</span><b>' + (d.time ? dShort(d.date) + ", " + d.time : "выберите время") + '</b></div><button class="btn-accent" data-to="next-pay"' + (d.time ? "" : " disabled") + ">К оплате</button>");
    });
  }
  function serviceObj(d) { return (services || []).filter(function (s) { return s.id === d.serviceId; })[0] || d.service || null; }

  /* ================= 5. Оплата ================= */
  function renderPay(c, t, d) {
    head("Проверьте и оплатите", carName(c) + " · ТО-" + t.km.toLocaleString("ru-RU"));
    loadOptions(t).then(function () {
      if (stepOf() !== "pay") return;
      ensurePicks(d, t);
      var tot = totals(d, t), svc = serviceObj(d), works = API.maintenance.worksPrice(svc || {}, t.items), w = where();
      var pts = Math.min(points(), Math.floor((tot.parts + tot.delivery) * 0.3)), pay = tot.parts + tot.delivery - (d.usePoints ? pts : 0);
      body('<div class="kv"><div><span>Автосервис</span><b>' + esc(svc ? svc.name : "") + '</b></div><div><span>Визит</span><b>' + dShort(d.date) + ", " + d.time + "</b></div>" +
          "<div><span>Работы</span><b>" + t.items.length + " " + plural(t.items.length, "работа", "работы", "работ") + "</b></div></div>" +
        '<div class="to-sec">КУДА ПРИВЕЗТИ ЗАПЧАСТИ</div><div class="seg3" style="grid-template-columns:1fr 1fr">' +
          '<button class="' + (d.delivery === "service" ? "on" : "") + '" data-deliv="service" data-action="deliv">В автосервис</button><button class="' + (d.delivery === "home" ? "on" : "") + '" data-deliv="home" data-action="deliv">Ко мне</button></div>' +
        '<div class="to-note" style="margin-top:-4px">' + (d.delivery === "service" ? "Магазины привезут детали прямо в сервис — вам ничего не нужно забирать." : "Привезём по адресу: " + esc(w.city + (w.address ? ", " + w.address : "")) + ". Возьмите детали с собой на визит.") + "</div>" +
        '<div class="to-sec">ЗАПЧАСТИ ПО МАГАЗИНАМ</div><div class="kv">' + Object.keys(tot.markets).map(function (m) {
          var x = tot.markets[m];
          return "<div><span>" + esc(x.name) + " · к " + dShort(addDays(today(), x.days)) + "</span><b>" + rub(x.sum) + "</b></div>";
        }).join("") + "<div><span>Доставка</span><b>" + rub(tot.delivery) + "</b></div></div>" +
        '<label class="to-points"><input type="checkbox" data-action="points"' + (d.usePoints ? " checked" : "") + "><span><b>Списать " + pts.toLocaleString("ru-RU") + " баллов</b><small>у вас " + points().toLocaleString("ru-RU") + ", можно оплатить до 30%</small></span></label>" +
        '<div class="kv"><div class="kv-total"><span>К оплате сейчас</span><b>' + rub(pay) + '</b></div><div><span>Работы — в сервисе после ТО</span><b>' + rub(works) + "</b></div></div>" +
        '<div class="to-note">Если сервис найдёт что-то ещё, он спросит вас в приложении — без согласия ничего лишнего не сделают.</div>');
      foot('<button class="btn-accent" data-to="pay">Оплатить ' + rub(pay) + "</button>");
      d._pay = { amount: pay, points: d.usePoints ? pts : 0, works: works };
      saveDraft(d);
    });
  }
  function doPay() {
    var d = draft(), c = car(), t = API.maintenance.nextTO(c), tot = totals(d, t), svc = serviceObj(d), p = d._pay || {};
    UI.sheet({ title: "Оплата запчастей", html: '<div class="kv"><div><span>Карта</span><b>•••• 4242 (демо)</b></div><div class="kv-total"><span>Сумма</span><b>' + rub(p.amount) + "</b></div></div>" +
      '<p class="sheet-text" style="font-size:13px;color:#5B5F66">Прототип: деньги не списываются, заказы в магазинах не создаются.</p><button class="btn-accent" data-action="confirm" style="height:52px">Подтвердить оплату</button>',
      onMount: function (b) {
        b.querySelector("[data-action=confirm]").addEventListener("click", function () {
          var btn = this; btn.disabled = true; btn.textContent = "Оплачиваем…";
          setTimeout(function () {
            var o = { id: "A-" + String(Date.now()).slice(-6), carId: c.id, carName: carName(c), km: t.km, createdAt: iso(today()),
              works: t.items.map(function (r) { return r.work; }), worksPrice: p.works,
              items: tot.lines.map(function (l) { return { title: l.opt.name, brand: l.opt.brand, article: l.opt.article, qty: l.qty, price: l.offer.price, sum: l.sum, market: l.offer.marketName, days: l.offer.days }; }),
              markets: Object.keys(tot.markets).map(function (m) { var x = tot.markets[m]; return { name: x.name, eta: iso(addDays(today(), x.days)), sum: x.sum }; }),
              partsTotal: tot.parts, delivery: tot.delivery, paid: p.amount, pointsUsed: p.points, deliveryTo: d.delivery, eta: iso(tot.eta),
              service: svc ? { id: svc.id, name: svc.name, town: svc.town, address: svc.address, rating: svc.ratingGis } : null,
              visit: { date: d.date, time: d.time }, stage: 0, rated: 0 };
            saveOrder(o);
            if (p.points) save("points.v1", points() - p.points);
            var all = drafts(); delete all[c.id]; save("todraft.v1", all);
            UI.close(function () { location.hash = "#TO/order"; UI.toast("Оплачено. Заказ " + o.id + " передан в магазины"); });
          }, 600);
        });
      } });
  }

  /* ================= 6. Заказ: статус → выполнено ================= */
  function stageDate(o, i) {
    return [o.createdAt, o.createdAt, o.eta, o.visit.date, o.visit.date][i];
  }
  function renderOrder(c, t, d, o) {
    head("ТО-" + o.km.toLocaleString("ru-RU") + " · заказ " + o.id, o.carName);
    var st = o.stage;
    var names = STAGES.slice(); if (o.deliveryTo === "home") names[2] = "Запчасти у вас";
    var html = "";
    if (st >= 4) {
      var next = API.maintenance.nextTO(car());
      html += '<div class="to-done"><span class="to-done-ic">✓</span><b>ТО-' + o.km.toLocaleString("ru-RU") + " выполнено</b><span>" + esc(o.service ? o.service.name : "") + " · " + dLong(o.visit.date) + "</span></div>" +
        (o.rated ? "" : '<div class="to-card"><b class="to-h">Как всё прошло?</b><div class="to-stars" role="radiogroup" aria-label="Оценка сервиса">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-star="' + n + '" data-action="star" aria-label="' + n + ' из 5">★</button>'; }).join("") + '</div><span class="to-p">За отзыв — 100 баллов</span></div>') +
        (o.rated ? '<div class="to-card to-row"><div><b>Ваша оценка: ' + "★".repeat(o.rated) + "</b><span>Спасибо! +100 баллов</span></div></div>" : "") +
        '<div class="to-card to-row"><div><b>Следующее ТО-' + next.km.toLocaleString("ru-RU") + "</b><span>через " + km(next.left) + " · напомним заранее</span></div><span class=\"to-mk\">" + next.items.length + " работ</span></div>" +
        '<a class="to-card to-row link" href="#Warranty"><div><b>Гарантия 30 дней</b><span>на работы и запчасти — если что-то не так</span></div><span class="prow-go">›</span></a>' +
        '<a class="to-card to-row link" href="#History"><div><b>Заказ-наряд в истории</b><span>' + o.items.length + " деталей · работы " + rub(o.worksPrice) + '</span></div><span class="prow-go">›</span></a>';
      foot('<button class="btn-dark" data-to="finish">Готово</button>');
    } else {
      html += '<div class="to-tl">' + names.map(function (n, i) {
        var sub = [
          "Списано " + rub(o.paid) + (o.pointsUsed ? " и " + o.pointsUsed + " баллов" : ""),
          o.markets.map(function (m) { return m.name + " — к " + dShort(m.eta); }).join(", "),
          o.deliveryTo === "home" ? "Возьмите их с собой на визит" : "Сервис примет детали, вам ничего не нужно забирать",
          dShort(o.visit.date) + ", " + o.visit.time + " · " + (o.service ? o.service.name : ""),
          "Сохраним в историю и напомним о следующем ТО"
        ][i];
        return '<div class="to-tl-i' + (i < st ? " done" : i === st ? " on" : "") + '"><span class="to-tl-d">' + (i < st ? "✓" : i + 1) + "</span><div><b>" + n + "</b><span>" + esc(sub) + "</span>" +
          (i === st ? '<small>' + (i === 0 ? "сегодня" : dShort(stageDate(o, i))) + "</small>" : "") + "</div></div>";
      }).join("") + "</div>";
      if (st === 3) html += '<a class="to-card to-row link" href="#RepairLive"><div><b>Ремонт онлайн</b><span>фото от мастера и согласование доп. работ</span></div><span class="prow-go">›</span></a>';
      html += '<div class="to-card to-row"><div><b>' + esc(o.service ? o.service.name : "") + "</b><span>" + esc(o.service ? o.service.town + ", " + o.service.address : "") + '</span></div><span class="to-star">★ ' + (o.service ? o.service.rating.toFixed(1) : "") + "</span></div>" +
        '<div class="kv"><div><span>Запчасти ' + o.items.length + " поз. + доставка</span><b>" + rub(o.partsTotal + o.delivery) + "</b></div><div><span>Работы — в сервисе</span><b>" + rub(o.worksPrice) + "</b></div></div>" +
        '<div class="to-links">' + (st < 3 ? '<button class="linkbtn" data-to="reschedule">Перенести визит</button>' : "") + (st < 2 ? '<button class="linkbtn" data-to="cancel">Отменить заказ</button>' : "") + "</div>";
      foot('<button class="btn-light demo" data-to="advance">Демо: следующий этап · ' + esc(names[st + 1]) + " ›</button>");
    }
    body(html);
  }
  function complete(o) {
    var C = window.AutoHubCar, c = C.cars().filter(function (x) { return x.id === o.carId; })[0] || {};
    C.update(o.carId, { lastTOkm: o.km, lastTOdate: o.visit.date, mileage: Math.max(c.mileage || 0, Math.min(o.km, (c.mileage || 0) + 800)) });
    // Заказ-наряд: запчасти построчно, работы одной строкой, доставка
    var lines = o.items.map(function (it) { return [it.title + " " + it.brand + (it.qty > 1 ? " × " + it.qty : ""), it.sum]; })
      .concat([["Работы: " + o.works.join(", ").toLowerCase(), o.worksPrice], ["Доставка запчастей", o.delivery]]);
    if (window.AutoHubScreens) window.AutoHubScreens.addHistory({
      date: o.visit.date, km: c.mileage || null, kind: "visit", title: "ТО-" + o.km.toLocaleString("ru-RU") + " км",
      place: (o.service ? o.service.name : "Автосервис") + " · заказ " + o.id, cost: o.worksPrice + o.partsTotal + o.delivery, order: lines
    }, o.carId);
    save("points.v1", points() + Math.round((o.partsTotal + o.worksPrice) * 0.03));
  }

  /* ---------- Действия ---------- */
  function onClick(e) {
    var b = e.target.closest("[data-to],[data-tier],[data-slot],[data-svc],[data-date],[data-time],[data-deliv],[data-star]"); if (!b) return;
    var c = car(), t = API.maintenance.nextTO(c), d = draft(), o = order(c.id);
    if (b.dataset.tier) { loadOptions(t).then(function () { applyTier(d, t, b.dataset.tier); saveDraft(d); render(); }); return; }
    if (b.dataset.slot) { altSheet(b.dataset.slot); return; }
    if (b.dataset.svc) { d.serviceId = b.dataset.svc; d.service = serviceObj(d); d.time = null; saveDraft(d); render(); return; }
    if (b.dataset.date) { d.date = b.dataset.date; d.time = null; saveDraft(d); render(); return; }
    if (b.dataset.time) { if (!b.disabled) { d.time = b.dataset.time; saveDraft(d); render(); } return; }
    if (b.dataset.deliv) { d.delivery = b.dataset.deliv; saveDraft(d); render(); return; }
    if (b.dataset.star) { o.rated = +b.dataset.star; saveOrder(o); save("points.v1", points() + 100); UI.toast("Спасибо за оценку! +100 баллов"); render(); return; }
    switch (b.dataset.to) {
      case "mileage":
        var n = parseInt(($("toMil").value || "").replace(/\D/g, ""), 10);
        if (!n || n < 100 || n > 2000000) { var er = $("toMilErr"); er.textContent = "Введите пробег цифрами, например 58400."; er.hidden = false; return; }
        window.AutoHubCar.update(c.id, { mileage: n }); render(); break;
      case "next-parts": go("parts"); break;
      case "next-service": go("service"); break;
      case "back-service": go("service"); break;
      case "next-time": d.service = serviceObj(d); saveDraft(d); go("time"); break;
      case "next-pay": if (d.time) go("pay"); break;
      case "pay": doPay(); break;
      case "address": window.AutoHubAuth.editAddress(function () { services = null; render(); }); break;
      case "later": UI.toast("Напомним за 1 000 км до ТО"); location.hash = "#Garage"; break;
      case "done-elsewhere":
        if (window.confirm("Отметить ТО-" + t.km.toLocaleString("ru-RU") + " как пройденное? Следующее рассчитаем от него.")) {
          window.AutoHubCar.update(c.id, { lastTOkm: t.km, lastTOdate: iso(today()) });
          if (window.AutoHubScreens) window.AutoHubScreens.addHistory({ date: iso(today()), km: c.mileage, kind: "visit", title: "ТО-" + t.km.toLocaleString("ru-RU") + " км", place: "добавлено вручную", cost: 0 }, c.id);
          UI.toast("Готово. Следующее ТО рассчитано"); location.hash = "#Garage";
        }
        break;
      case "advance":
        o.stage = Math.min(4, o.stage + 1);
        if (o.stage === 4) complete(o);
        saveOrder(o); render();
        UI.toast(STAGES[o.stage]);
        break;
      case "finish": o.archived = true; saveOrder(o); location.hash = "#Garage"; break;
      case "cancel":
        if (window.confirm("Отменить заказ? Деньги за запчасти вернутся на карту.")) {
          var all = orders(); delete all[o.carId]; save("orders.v1", all);
          if (o.pointsUsed) save("points.v1", points() + o.pointsUsed);
          UI.toast("Заказ отменён, " + rub(o.paid) + " вернутся за 1–3 дня"); location.hash = "#Garage";
        }
        break;
      case "reschedule":
        var tmp = { date: o.visit.date, time: o.visit.time };
        UI.sheet({ title: "Перенести визит", html: '<div id="rsSlots"></div><button class="btn-accent" data-action="rs-save" style="height:52px">Сохранить</button>',
          onMount: function (sb) {
            var earliest = addDays(new Date(o.eta + "T12:00:00"), 1);
            function draw() { sb.querySelector("#rsSlots").innerHTML = slotsHtml(tmp, earliest, o.service ? o.service.id : ""); }
            sb.addEventListener("click", function (ev) {
              var x = ev.target.closest("[data-date],[data-time],[data-action=rs-save]"); if (!x) return;
              if (x.dataset.date) { tmp.date = x.dataset.date; tmp.time = null; draw(); }
              else if (x.dataset.time) { if (!x.disabled) { tmp.time = x.dataset.time; draw(); } }
              else if (tmp.time) { o.visit = { date: tmp.date, time: tmp.time }; saveOrder(o); UI.close(function () { render(); UI.toast("Визит перенесён на " + dShort(tmp.date) + ", " + tmp.time); }); }
              else UI.toast("Выберите время");
            });
            draw();
          } });
        break;
    }
  }
  function onChange(e) {
    if (e.target.matches("[data-action=points]")) { var d = draft(); d.usePoints = e.target.checked; saveDraft(d); render(); }
  }

  /* ---------- Гараж: карточка ТО, запись, «Сегодня полезно» ---------- */
  function renderGarage() {
    var g = document.getElementById("s-Garage"); if (!g) return;
    if (!document.getElementById("toCard")) {
      var a = g.querySelector('a[href="#TO/parts"]'); // «Собрать ТО» → строка кнопок → карточка
      if (a) a.parentNode.parentNode.id = "toCard";
    }
    var card = document.getElementById("toCard"); if (!card) return;
    var c = car(), t = API.maintenance.nextTO(c), o = order(c.id), html;
    if (o) {
      html = '<div class="tc-top"><span class="tc-ic">🔧</span><div><b>ТО-' + o.km.toLocaleString("ru-RU") + " · " + STAGES[o.stage].toLowerCase() + "</b><span>" + dShort(o.visit.date) + ", " + o.visit.time + " · " + esc(o.service ? o.service.name : "") + "</span></div></div>" +
        '<div class="to-bar"><div style="width:' + (o.stage / 4 * 100 || 6) + '%"></div></div><a href="#TO/order" class="btn-dark tc-btn">Статус заказа</a>';
    } else if (t.noMileage) {
      html = '<div class="tc-top"><span class="tc-ic">🔔</span><div><b>Когда следующее ТО?</b><span>Укажите пробег — рассчитаем и напомним</span></div></div><a href="#TO" class="btn-accent tc-btn">Указать пробег</a>';
    } else {
      var since = c.lastTOkm ? c.mileage - c.lastTOkm : c.mileage - (t.km - API.maintenance.step);
      var pct = Math.max(4, Math.min(100, Math.round(since / API.maintenance.step * 100)));
      html = '<div class="tc-top"><span class="tc-ic' + (t.soon || t.overdue ? " soon" : "") + '">🔔</span><div><b>ТО-' + t.km.toLocaleString("ru-RU") + " км</b><span>" +
        (t.overdue ? "пора пройти — пробег уже больше планового" : "через " + km(t.left) + " · " + t.items.length + " " + plural(t.items.length, "работа", "работы", "работ")) + "</span></div></div>" +
        '<div class="to-bar' + (t.soon || t.overdue ? " soon" : "") + '"><div style="width:' + pct + '%"></div></div>' +
        '<div class="tc-btns"><a href="#TO" class="btn-light tc-btn">Что входит</a><a href="#TO/parts" class="btn-accent tc-btn">Собрать ТО</a></div>';
    }
    card.innerHTML = html;
    card.style.border = t.soon || t.overdue || o ? "1.5px solid #C2410C" : "1px solid #E2DED6";
    // Плитка «Регламент ТО»
    var reg = g.querySelector('a[href="#Reminders"], a#regTile');
    if (reg) { reg.id = "regTile"; reg.href = "#TO"; var sp = reg.querySelectorAll("span"); if (sp[1]) sp[1].textContent = t.noMileage ? "укажите пробег" : "ТО-" + t.km.toLocaleString("ru-RU") + " · " + t.items.length + " работ"; }
    // Карточка записи: заказ ТО важнее разовой записи
    var bk = g.querySelector('a[href="#RepairLive"], a#visitCard');
    if (bk) {
      bk.id = "visitCard";
      var b1 = load("booking.v1", null);
      if (o) {
        var dd = new Date(o.visit.date + "T12:00:00");
        fillVisit(bk, dd.getDate(), MON[dd.getMonth()].toUpperCase(), "Визит на ТО · " + o.visit.time, (o.service ? o.service.name : "") + " · " + STAGES[o.stage].toLowerCase(), "#TO/order");
        bk.hidden = false;
      } else if (b1 && b1.carId === c.id) {
        fillVisit(bk, b1.day, b1.mon, "Запись в сервис · " + b1.time, b1.service + " · " + b1.works, "#BookingDone");
        bk.hidden = false;
      } else bk.hidden = true;
    }
    renderTip(g);
    renderMainKit();
  }
  // Карточка «Комплект к ТО» на вкладке «Запчасти» — по активной машине
  function renderMainKit() {
    var a = document.querySelector('#s-Main a[href="#TO/parts"], #s-Main a[href="#TO/order"], #s-Main a[href="#TO"]'); if (!a) return;
    var c = car(), t = API.maintenance.nextTO(c), o = order(c.id);
    var top = a.children[0], title = a.children[1], sub = a.children[2], bottom = a.children[3];
    if (!top || !bottom) return;
    if (o) {
      a.href = "#TO/order";
      top.children[0].textContent = "ТО-" + o.km.toLocaleString("ru-RU") + " КМ · ЗАКАЗ " + o.id;
      top.children[1].textContent = STAGES[o.stage].toLowerCase();
      title.textContent = "Запчасти заказаны"; sub.textContent = "Визит " + dShort(o.visit.date) + ", " + o.visit.time + " · " + (o.service ? o.service.name : "");
      bottom.children[0].textContent = rub(o.partsTotal + o.delivery); bottom.children[1].textContent = "Статус";
      return;
    }
    a.href = t.noMileage ? "#TO" : "#TO/parts";
    top.children[0].textContent = t.noMileage ? "СЛЕДУЮЩЕЕ ТО" : (t.soon || t.overdue ? "СКОРО " : "ДАЛЕЕ ") + "ТО-" + t.km.toLocaleString("ru-RU") + " КМ";
    top.children[1].textContent = t.noMileage ? "укажите пробег" : t.overdue ? "пора пройти" : "через " + km(t.left);
    title.textContent = "Комплект запчастей к ТО";
    sub.textContent = t.parts.length + " " + plural(t.parts.length, "позиция", "позиции", "позиций") + " для " + carName(c) + " · цены 5 площадок";
    bottom.children[1].textContent = t.noMileage ? "Указать" : "Собрать";
    bottom.children[0].textContent = "…";
    loadOptions(t).then(function () {
      var sum = t.parts.reduce(function (acc, r) { var o2 = opts[r.part] && opts[r.part].tiers.cheap; return acc + (o2 ? o2.best.price * (r.qty || 1) : 0); }, 0);
      bottom.children[0].textContent = sum ? "от " + rub(sum) : "";
    });
  }
  function fillVisit(a, day, mon, title, sub, href) {
    a.href = href;
    var spans = a.querySelectorAll("span");
    if (spans.length >= 4) { spans[0].textContent = day; spans[1].textContent = mon; spans[2].textContent = title; spans[3].textContent = sub; }
  }
  // «Сегодня полезно» — одна актуальная подсказка между ТО
  var TIPS = [
    ["#Tires", "Пора думать о зимней резине", "Ночью уже около нуля. Запишитесь на шиномонтаж без очереди"],
    ["#Insurance", "ОСАГО заканчивается через 28 дней", "Сравните цены трёх страховых и продлите за минуту"],
    ["#Budget", "Сколько стоит ваша машина в месяц", "Бюджет владения и прогноз расходов на год"],
    ["#Community", "Что ставят владельцы вашей модели", "Популярные запчасти и сервисы по отзывам"],
    ["#SOS", "Сохраните помощь на дороге", "Эвакуатор, техпомощь и порядок действий при ДТП"],
    ["#CarPassport", "Паспорт авто для продажи", "История обслуживания повышает цену машины"]
  ];
  function renderTip(g) {
    var anchor = g.querySelector("#toCard"); if (!anchor) return;
    var tip = document.getElementById("tipCard");
    if (!tip) { tip = document.createElement("a"); tip.id = "tipCard"; tip.className = "tipcard"; anchor.parentNode.insertBefore(tip, anchor.nextSibling); }
    var month = new Date().getMonth(), list = TIPS.slice();
    if (!(month >= 8 && month <= 10) && !(month >= 2 && month <= 3)) list.shift(); // резина — в сезон
    if (load("osago.v1", null)) list = list.filter(function (x) { return x[0] !== "#Insurance"; });
    var x = list[new Date().getDate() % list.length];
    tip.href = x[0];
    tip.innerHTML = '<span class="tip-k">СЕГОДНЯ ПОЛЕЗНО</span><b>' + esc(x[1]) + "</b><span>" + esc(x[2]) + '</span><span class="prow-go">›</span>';
  }

  function init() {
    var scr = $("s-TO"); if (!scr) return;
    scr.addEventListener("click", onClick);
    scr.addEventListener("change", onChange);
    $("toBack").addEventListener("click", function () {
      var s = stepOf(), i = STEPS.map(function (x) { return x[0]; }).indexOf(s);
      location.hash = i > 0 ? "#TO" + (i === 1 ? "" : "/" + STEPS[i - 1][0]) : "#Garage";
    });
    // Все старые входы в ТО ведут в единый сценарий
    document.querySelectorAll('a[href="#OneTapTO"], a[href="#Reminders"]').forEach(function (a) { a.href = a.closest("#s-Garage") && /Собрать|один тап/.test(a.textContent) ? "#TO/parts" : "#TO"; });
    var kit = Array.prototype.filter.call(document.querySelectorAll('#s-Main a[href="#Results"]'), function (a) { return /ТО/.test(a.textContent); })[0];
    if (kit) kit.href = "#TO/parts";
    window.addEventListener("hashchange", function () { if (stepOf()) render(); if (location.hash === "#Garage") renderGarage(); });
    window.addEventListener("autohub:car", function () { renderGarage(); if (stepOf()) render(); });
    renderGarage();
    if (stepOf()) render();
  }
  window.AutoHubTO = { init: init, order: order, points: points, renderGarage: renderGarage };
})();
