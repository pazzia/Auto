/* АвтоХаб: AUTO-14 «Журнал заправок и расход».
 * Ввод за 10 секунд: сумма, литры, пробег (цена литра и прирост пробега считаются сами).
 * Расход — между полными баками, цена километра, траты за месяц, график за полгода.
 * Пробег с заправки обновляет машину — ТО считается точнее. Без интернета.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var TYPES = ["АИ-92", "АИ-95", "АИ-98", "ДТ"];
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("autohub." + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function $(id) { return document.getElementById(id); }
  function num(v) { return parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0; }
  function rub(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function fmt1(n) { return n.toFixed(1).replace(".", ","); }
  function car() { return window.AutoHubCar.active(); }
  function all() { return load("fuel.v1", {}); }
  function list() { return (all()[car().id] || []).slice().sort(function (a, b) { return b.km - a.km || (b.date > a.date ? 1 : -1); }); }
  function saveList(l) { var a = all(); a[car().id] = l; if (!save("fuel.v1", a)) { l.forEach(function (x) { delete x.photo; }); a[car().id] = l; save("fuel.v1", a); } }

  /** Расход и цены по записям: расход только между полными баками. */
  function stats(entries) {
    var l = (entries || list()).slice().sort(function (a, b) { return a.km - b.km; });
    var cons = {}, pairs = [];
    var lastFull = null, litersSince = 0;
    l.forEach(function (e) {
      if (lastFull) litersSince += e.liters;
      if (e.full) {
        if (lastFull && e.km > lastFull.km) { var c = litersSince / (e.km - lastFull.km) * 100; cons[e.id] = c; pairs.push(c); }
        lastFull = e; litersSince = 0;
      }
    });
    var avg = pairs.length ? pairs.slice(-5).reduce(function (s, x) { return s + x; }, 0) / Math.min(5, pairs.length) : null;
    var kmSpan = l.length > 1 ? l[l.length - 1].km - l[0].km : 0;
    var spentSpan = l.slice(1).reduce(function (s, e) { return s + e.sum; }, 0); // топливо, потраченное на пройденные км
    var now = new Date(), month = l.filter(function (e) { var d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    var days = l.length > 1 ? Math.max(1, (new Date(l[l.length - 1].date) - new Date(l[0].date)) / 864e5) : 0;
    var chart = []; for (var i = 5; i >= 0; i--) {
      var m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      chart.push({ label: MON[m.getMonth()], cur: i === 0, sum: l.filter(function (e) { var d = new Date(e.date); return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear(); }).reduce(function (s, e) { return s + e.sum; }, 0) });
    }
    return { avg: avg, perKm: kmSpan ? spentSpan / kmSpan : null, month: month.reduce(function (s, e) { return s + e.sum; }, 0), monthCount: month.length,
      cons: cons, chart: chart, kmSpan: kmSpan, days: days,
      // Прогноз на год: по реальному темпу, если истории хотя бы месяц; иначе — по цене км и 15 000 км в год
      perYear: days >= 30 ? spentSpan / days * 365 : kmSpan ? spentSpan / kmSpan * 15000 : null, perYearByKm: days < 30, last: l[l.length - 1] || null, count: l.length };
  }

  function render() {
    var body = $("fuBody"); if (!body) return;
    var l = list(), s = stats(), c = car();
    $("fuSub").textContent = window.AutoHubCar.name(c) + " · расход по вашим чекам";
    if (!l.length) {
      body.innerHTML = '<div class="pk-empty"><span class="pk-big" aria-hidden="true">⛽</span><b>Записей пока нет</b><span>После заправки введите сумму, литры и пробег — это 10 секунд. Посчитаем реальный расход и цену километра, а пробег сам обновится для ТО.</span></div>';
      return;
    }
    var max = Math.max.apply(null, [1].concat(s.chart.map(function (x) { return x.sum; })));
    var html = '<div class="fu-hero"><div class="fu-stats">' +
      "<div><span>Расход</span><b>" + (s.avg ? fmt1(s.avg) : "—") + "</b><small>" + (s.avg ? "л на 100 км" : "нужно 2 полных бака") + "</small></div>" +
      "<div><span>Цена км</span><b>" + (s.perKm ? fmt1(s.perKm) + " ₽" : "—") + "</b><small>только топливо</small></div>" +
      '<div><span>' + MON[new Date().getMonth()] + "</span><b class=\"acc\">" + rub(s.month) + "</b><small>" + s.monthCount + " запр.</small></div></div>" +
      '<div class="fu-chart" aria-label="Траты на топливо по месяцам">' + s.chart.map(function (x) {
        return '<div><i style="height:' + Math.max(4, Math.round(x.sum / max * 100)) + '%"' + (x.cur ? ' class="cur"' : "") + '></i><span>' + x.label + "</span></div>";
      }).join("") + "</div></div>";
    html += '<div class="to-sec">ИСТОРИЯ</div><div class="kv">' + l.map(function (e) {
      var d = new Date(e.date);
      return '<div class="fu-row"><span><b>' + d.getDate() + " " + MON[d.getMonth()] + "</b><small>" + fmt1(e.liters) + " л · " + esc(e.type) + (e.full ? " · полный бак" : "") + '</small><small class="mono">' + e.km.toLocaleString("ru-RU") + " км</small></span>" +
        '<span class="r"><b>' + rub(e.sum) + '</b><small class="' + (s.cons[e.id] ? "ok" : "") + '">' + (s.cons[e.id] ? fmt1(s.cons[e.id]) + " л/100" : "—") + '</small><button class="linkbtn" data-del="' + e.id + '" data-action="del" aria-label="Удалить запись">Удалить</button></span></div>';
    }).join("") + "</div>";
    body.innerHTML = html;
  }

  function addSheet() {
    var c = car(), last = list()[0], type = (last && last.type) || "АИ-95";
    UI.sheet({ title: "Новая заправка",
      html: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="fld">Сумма, ₽<input id="fuSum" inputmode="decimal" placeholder="2 450" autocomplete="off"></label>' +
        '<label class="fld">Литры<input id="fuLit" inputmode="decimal" placeholder="42,5" autocomplete="off"><span id="fuPpl" class="fu-hint"></span></label></div>' +
        '<label class="fld">Пробег, км<input id="fuKm" inputmode="numeric" placeholder="' + (c.mileage || "") + '" autocomplete="off"><span id="fuKmHint" class="fu-hint"></span></label>' +
        '<div class="pk-timers">' + TYPES.map(function (t) { return '<button data-type="' + t + '" data-action="t" class="' + (t === type ? "on" : "") + '">' + t + "</button>"; }).join("") + "</div>" +
        '<label class="to-points"><input type="checkbox" id="fuFull" checked><span><b>Полный бак</b><small>нужно для точного расхода</small></span></label>' +
        '<button class="btn-light" data-action="receipt" style="height:48px" id="fuPhotoBtn">Сфотографировать чек</button>' +
        '<span id="fuErr" class="err" hidden></span><button class="btn-accent" data-action="save">Сохранить</button>',
      onMount: function (b) {
        var photo = null;
        function hints() {
          var s = num(b.querySelector("#fuSum").value), l = num(b.querySelector("#fuLit").value), k = num(b.querySelector("#fuKm").value);
          b.querySelector("#fuPpl").textContent = s && l ? fmt1(s / l) + " ₽ за литр" : "";
          var prev = Math.max(c.mileage || 0, last ? last.km : 0);
          b.querySelector("#fuKmHint").textContent = k && prev && k > prev ? "+" + (k - prev).toLocaleString("ru-RU") + " км с прошлого раза" : "";
        }
        b.addEventListener("input", hints);
        b.addEventListener("click", function (e) {
          var t = e.target.closest("[data-type]");
          if (t) { type = t.dataset.type; b.querySelectorAll("[data-type]").forEach(function (x) { x.classList.toggle("on", x === t); }); return; }
          if (e.target.closest("[data-action=receipt]")) {
            window.AutoHubDevice.takePhoto().then(function (d) { if (d) { photo = d; b.querySelector("#fuPhotoBtn").textContent = "Чек сфотографирован ✓"; } });
            return;
          }
          if (!e.target.closest("[data-action=save]")) return;
          var sum = num(b.querySelector("#fuSum").value), lit = num(b.querySelector("#fuLit").value), km = Math.round(num(b.querySelector("#fuKm").value));
          var err = !sum ? "Укажите сумму." : !lit ? "Укажите литры." : lit > 200 ? "Проверьте литры." : !km ? "Укажите пробег — по нему считаем расход и ТО." :
            (last && km < last.km) ? "Пробег меньше, чем в прошлой записи (" + last.km.toLocaleString("ru-RU") + " км)." : "";
          if (err) { var er = b.querySelector("#fuErr"); er.textContent = err; er.hidden = false; return; }
          var l = list(); l.push({ id: "f" + Date.now().toString(36), date: new Date().toISOString(), sum: sum, liters: lit, km: km, type: type, full: b.querySelector("#fuFull").checked, photo: photo });
          l.slice(10).forEach(function (x) { delete x.photo; }); // фото чеков — только у 10 последних, чтобы хватило памяти
          saveList(l);
          var upd = km > (c.mileage || 0);
          if (upd) window.AutoHubCar.update(c.id, { mileage: km });
          UI.close(function () { render(); UI.toast(upd ? "Пробег обновлён — ТО пересчитано" : "Заправка сохранена"); });
        });
      } });
  }

  function init() {
    var scr = $("s-Fuel"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      if (e.target.closest("[data-action=add]")) { addSheet(); return; }
      var d = e.target.closest("[data-del]");
      if (d && window.confirm("Удалить эту заправку?")) { saveList(list().filter(function (x) { return x.id !== d.dataset.del; })); render(); }
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Fuel") render(); });
    window.addEventListener("autohub:car", function () { if (location.hash === "#Fuel") render(); });
    render();
  }
  window.AutoHubFuel = { init: init, stats: function () { return stats(); }, count: function () { return list().length; } };
})();
