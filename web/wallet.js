/* АвтоХаб: AUTO-29 «Баллы и бюджет из реальных данных».
 * AutoHubPoints — единый журнал баллов: каждое начисление и списание с причиной.
 * Экран «Баллы и копилка» и «Бюджет владения» считают цифры по данным пользователя:
 * заправки (AUTO-14), история обслуживания, заказы ТО, ОСАГО, оплаченные штрафы.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI, API = window.AutoHubApi;
  var esc = function (s) { return UI.esc(s); };
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("autohub." + k, JSON.stringify(v)); } catch (e) {} }
  function rub(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function $(id) { return document.getElementById(id); }
  var MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  function dShort(t) { var d = new Date(t); return d.getDate() + " " + MON[d.getMonth()]; }

  /* ================= Журнал баллов ================= */
  var Points = {
    balance: function () { return load("points.v1", 1240); },
    ledger: function () {
      var l = load("ledger.v1", null);
      if (!l) { l = [{ at: Date.now(), title: "Приветственные баллы", amount: 1240 }]; save("ledger.v1", l); }
      return l;
    },
    /** Начислить (+) или списать (−) баллы с причиной. */
    add: function (amount, title) {
      amount = Math.round(amount); if (!amount) return;
      Points.ledger();
      var l = load("ledger.v1", []); l.unshift({ at: Date.now(), title: title, amount: amount }); save("ledger.v1", l.slice(0, 100));
      save("points.v1", Math.max(0, Points.balance() + amount));
    }
  };
  window.AutoHubPoints = Points;

  /* ================= Данные для бюджета ================= */
  function carId() { var c = window.AutoHubCar && window.AutoHubCar.active(); return (c && c.id) || "demo"; }
  var FINES = { f1: 250, f2: 500 }; // суммы со скидкой, как на экране штрафов
  function expenses(fromTs) {
    var id = carId(), rows = [];
    (load("fuel.v1", {})[id] || []).forEach(function (f) { rows.push({ cat: "fuel", at: new Date(f.date).getTime(), sum: f.sum }); });
    (load("history.v1", {})[id] || []).forEach(function (h) {
      if (!h.cost || h.kind === "booking") return;
      rows.push({ cat: h.kind === "purchase" ? "parts" : "service", at: new Date(h.date + "T12:00:00").getTime(), sum: h.cost });
    });
    var osago = load("osago.v1", null); if (osago && osago.price) rows.push({ cat: "insurance", at: osago.at || Date.now(), sum: osago.price });
    var paid = load("fines.v1", {}); Object.keys(paid).forEach(function (k) { if (paid[k] && FINES[k]) rows.push({ cat: "fines", at: typeof paid[k] === "number" ? paid[k] : Date.now(), sum: FINES[k] }); });
    return rows.filter(function (r) { return r.at >= fromTs; });
  }
  var CATS = [["fuel", "Топливо", "из журнала заправок"], ["service", "Обслуживание", "ТО и визиты из истории"], ["parts", "Запчасти", "покупки из истории"],
    ["insurance", "Страховка", "полис, оформленный в приложении"], ["fines", "Штрафы", "оплаченные в приложении"]];

  /* ================= Экран «Бюджет» ================= */
  var period = "year";
  function renderBudget() {
    var body = $("bdBody"); if (!body) return;
    var now = Date.now(), from = period === "month" ? now - 30 * 864e5 : period === "year" ? now - 365 * 864e5 : 0;
    var rows = expenses(from), total = rows.reduce(function (s, r) { return s + r.sum; }, 0);
    var byCat = {}; rows.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + r.sum; });
    var max = Math.max.apply(null, [1].concat(Object.keys(byCat).map(function (k) { return byCat[k]; })));
    var fuel = window.AutoHubFuel ? window.AutoHubFuel.stats() : null;
    var km = fuel && fuel.kmSpan ? fuel.kmSpan : 0;
    document.querySelectorAll("#s-Budget [data-period]").forEach(function (b) { b.classList.toggle("on", b.dataset.period === period); });
    var html = '<div class="bd-hero"><div><span>Потрачено ' + (period === "month" ? "за месяц" : period === "year" ? "за год" : "всего") + "</span><b>" + rub(total) + "</b>" +
      "<span>" + (km && total ? "≈ " + (total / km).toFixed(1).replace(".", ",") + " ₽ за км · " + km.toLocaleString("ru-RU") + " км по заправкам" : "добавьте заправки — посчитаем цену километра") + "</span></div></div>";
    html += '<div class="to-sec">НА ЧТО УХОДЯТ ДЕНЬГИ</div><div class="kv bd-cats">' + CATS.map(function (c) {
      var v = byCat[c[0]] || 0;
      return '<div class="bd-cat"><div><b>' + c[1] + "</b><span>" + c[2] + "</span></div><b>" + (v ? rub(v) : "—") + '</b><div class="bd-bar"><i style="width:' + Math.round(v / max * 100) + '%"></i></div></div>';
    }).join("") + "</div>";
    if (!rows.length) html += '<div class="to-note">Пока нет трат за этот период. Они появятся из заправок, ТО, оплаченных штрафов и страховки.</div>';
    html += '<div class="to-sec">ПРОГНОЗ НА 12 МЕСЯЦЕВ</div><div class="kv" id="bdForecast"><div><span>Считаем…</span></div></div>';
    body.innerHTML = html;
    forecast().then(function (f) {
      var el = $("bdForecast"); if (!el) return;
      el.innerHTML = f.lines.map(function (l) { return "<div><span>" + esc(l[0]) + "<small>" + esc(l[1]) + "</small></span><b>" + (l[2] ? "≈ " + rub(l[2]) : "—") + "</b></div>"; }).join("") +
        '<div class="kv-total"><span>Итого</span><b>≈ ' + rub(f.total) + "</b></div>";
      $("bdFoot").innerHTML = '<button class="btn-dark" data-action="piggy">Копить на ТО — ' + rub(Math.ceil(f.toCost / 12 / 100) * 100) + " в месяц</button>";
      $("bdFoot").hidden = false; $("bdFoot").dataset.goal = f.toCost; $("bdFoot").dataset.km = f.toKm;
    });
  }
  // Прогноз: ТО по регламенту (работы + запчасти «оптимально»), ОСАГО, сезонная смена шин, топливо по расходу
  function forecast() {
    var c = window.AutoHubCar.active(), t = API.maintenance.nextTO(c);
    return Promise.all(t.parts.map(function (r) { return API.maintenance.options(r.part).then(function (d) { return d.tiers.optimal.best.price * (r.qty || 1); }); }))
      .then(function (parts) {
        var toCost = API.maintenance.worksPrice({ priceTO: 4600 }, t.items) + parts.reduce(function (s, x) { return s + x; }, 0);
        var osago = (load("osago.v1", null) || {}).price || 7840;
        var fs = window.AutoHubFuel ? window.AutoHubFuel.stats() : null;
        var fuelYear = fs && fs.perYear ? fs.perYear : 0;
        var lines = [["ТО-" + t.km.toLocaleString("ru-RU"), "по регламенту и ценам площадок", toCost], ["ОСАГО", "продление", osago],
          ["Шиномонтаж × 2", "весна и осень", 4800], ["Топливо", fuelYear ? (fs.perYearByKm ? "по цене км · 15 000 км в год" : "по вашему темпу заправок") : "добавьте заправки", fuelYear]];
        return { lines: lines, total: lines.reduce(function (s, l) { return s + (l[2] || 0); }, 0), toCost: toCost, toKm: t.km };
      });
  }

  /* ================= Экран «Баллы и копилка» ================= */
  function renderWallet() {
    var body = $("wlBody"); if (!body) return;
    var bal = Points.balance(), l = Points.ledger(), pig = load("piggy.v1", null);
    var html = '<div class="bd-hero"><div><span>Баллы на счёте</span><b style="font-size:34px">' + bal.toLocaleString("ru-RU") + "</b><span>1 балл = 1 ₽ · можно оплатить до 30% заказа</span></div></div>";
    if (pig) {
      var pct = Math.min(100, Math.round(pig.saved / pig.goal * 100));
      html += '<div class="to-card"><div class="to-row" style="gap:8px"><b>Копилка на ТО-' + pig.km.toLocaleString("ru-RU") + "</b><b>" + rub(pig.saved) + " из " + rub(pig.goal) + '</b></div><div class="to-bar"><div style="width:' + pct + '%;background:#C2410C"></div></div>' +
        '<span class="to-p">Деньги остаются у вас — это напоминание откладывать. Когда накопится, соберите ТО в приложении.</span>' +
        '<div class="tc-btns"><button class="btn-light" data-action="pig-add">Отложил 500 ₽</button><a href="#TO" class="btn-accent tc-btn">Собрать ТО</a></div></div>';
    } else {
      html += '<button class="to-card to-row link" data-action="piggy" style="text-align:left;font-family:inherit"><div><b>Копилка на ТО</b><span>напоминание откладывать понемногу к следующему ТО</span></div><span class="prow-go">›</span></button>';
    }
    html += '<div class="to-sec">КАК ПОЛУЧИТЬ ЕЩЁ</div><div class="wl-earn">' +
      [["Оценить сервис после ТО", "+100", "#TO"], ["Новое достижение", "+50", "#Achievements"], ["Новый уровень", "+200", "#Achievements"], ["3% от заказа ТО", "3%", "#TO"]]
        .map(function (x) { return '<a href="' + x[2] + '"><b>' + x[1] + "</b><span>" + x[0] + "</span></a>"; }).join("") + "</div>";
    html += '<div class="to-sec">ИСТОРИЯ</div><div class="kv">' + l.slice(0, 20).map(function (e) {
      return "<div><span>" + esc(e.title) + "<small>" + dShort(e.at) + "</small></span><b style=\"color:" + (e.amount > 0 ? "#0F6B3A" : "#C2410C") + '">' + (e.amount > 0 ? "+" : "−") + Math.abs(e.amount).toLocaleString("ru-RU") + "</b></div>";
    }).join("") + "</div>";
    body.innerHTML = html;
  }
  function startPiggy(goal, km) {
    if (!goal) { forecast().then(function (f) { startPiggy(f.toCost, f.toKm); }); return; }
    save("piggy.v1", { goal: Math.round(goal), km: km, saved: (load("piggy.v1", null) || {}).saved || 0 });
    if (location.hash === "#Wallet") renderWallet(); else location.hash = "#Wallet"; // тот же экран — просто перерисовать
    UI.toast("Копилка на ТО создана");
  }

  function init() {
    var b = $("s-Budget"), w = $("s-Wallet");
    if (b) b.addEventListener("click", function (e) {
      var p = e.target.closest("[data-period]"); if (p) { period = p.dataset.period; renderBudget(); return; }
      if (e.target.closest("[data-action=piggy]")) { var f = $("bdFoot"); startPiggy(+f.dataset.goal, +f.dataset.km); }
    });
    if (w) w.addEventListener("click", function (e) {
      if (e.target.closest("[data-action=piggy]")) startPiggy();
      if (e.target.closest("[data-action=pig-add]")) { var p = load("piggy.v1", null); p.saved += 500; save("piggy.v1", p); renderWallet(); UI.toast("Отложено. Так держать!"); }
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Budget") renderBudget(); if (location.hash === "#Wallet") renderWallet(); });
    window.addEventListener("autohub:car", function () { if (location.hash === "#Budget") renderBudget(); });
    renderBudget(); renderWallet();
  }
  window.AutoHubMoney = { init: init, expenses: expenses };
})();
