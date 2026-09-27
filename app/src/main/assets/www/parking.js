/* АвтоХаб: AUTO-2 «Где я припарковался».
 * Запоминает точку по GPS (работает без интернета), фото места, этаж/заметку, таймер парковки
 * с системным напоминанием. Поиск: расстояние и стрелка-компас; маршрут — в приложении карт телефона.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI, DEV = window.AutoHubDevice;
  var esc = function (s) { return UI.esc(s); };
  var KEY = "parking.v1", LOG = "parking.log.v1", REMIND_ID = 7101, REMIND_END = 7102;
  var DIRS = ["на север", "на северо-восток", "на восток", "на юго-восток", "на юг", "на юго-запад", "на запад", "на северо-запад"];
  var draft = null, stopWatch = null, stopHeading = null, me = null, heading = null, tick = null;

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) {
    try { localStorage.setItem("autohub." + k, JSON.stringify(v)); return true; }
    catch (e) { UI.toast("Не хватает памяти для фото — сохраним без него"); return false; }
  }
  function $(id) { return document.getElementById(id); }
  function spot() { return load(KEY, null); }
  function dur(ms) {
    var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
    return h ? h + " ч " + (m % 60) + " мин" : m + " мин";
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 5) * 5 + " м" : (m / 1000).toFixed(1).replace(".", ",") + " км"; }
  function clock(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  /* ---------- Отметить место ---------- */
  function startMark() {
    draft = { at: Date.now(), lat: null, lng: null, accuracy: null, photo: null, floor: "", note: "", minutes: 0, status: "locating" };
    render();
    DEV.getLocation().then(function (p) {
      if (!draft) return;
      draft.lat = p.lat; draft.lng = p.lng; draft.accuracy = Math.round(p.accuracy || 0); draft.status = p.stale ? "stale" : "ok"; render();
    }, function (e) { if (!draft) return; draft.status = "error"; draft.error = e.message; render(); });
  }
  function saveMark() {
    var s = { at: draft.at, lat: draft.lat, lng: draft.lng, accuracy: draft.accuracy, photo: draft.photo,
      floor: $("pkFloor").value.trim(), note: $("pkNote").value.trim(),
      until: draft.minutes ? draft.at + draft.minutes * 60000 : null,
      car: window.AutoHubCar ? window.AutoHubCar.name(window.AutoHubCar.active()) : "" };
    if (!save(KEY, s)) { s.photo = null; save(KEY, s); }
    scheduleReminders(s);
    draft = null;
    UI.toast("Место сохранено" + (s.lat == null ? " без координат" : ""));
    render(); renderGarage();
  }
  function scheduleReminders(s) {
    DEV.cancel(REMIND_ID); DEV.cancel(REMIND_END);
    if (!s.until) return;
    var left = s.until - Date.now();
    if (left > 11 * 60000) DEV.schedule(REMIND_ID, s.until - 10 * 60000, "Парковка заканчивается через 10 минут", "Продлите оплату или переставьте машину" + (s.note ? " · " + s.note : ""));
    if (left > 0) DEV.schedule(REMIND_END, s.until, "Время парковки вышло", "Машина стоит с " + clock(s.at) + ". Продлите оплату, чтобы не получить штраф.");
  }
  function pickUp() {
    var s = spot(); if (!s) return;
    var log = load(LOG, []); log.unshift({ at: s.at, left: Date.now(), note: s.note, floor: s.floor, lat: s.lat, lng: s.lng });
    save(LOG, log.slice(0, 5));
    localStorage.removeItem("autohub." + KEY);
    DEV.cancel(REMIND_ID); DEV.cancel(REMIND_END);
    stopFinding(); render(); renderGarage();
    UI.toast("Хорошей дороги!");
  }

  /* ---------- Поиск машины: расстояние и стрелка ---------- */
  function startFinding() {
    var s = spot(); if (!s || s.lat == null || stopWatch) return;
    stopWatch = DEV.watchLocation(function (p) { me = p; drawFinder(); });
    stopHeading = DEV.watchHeading(function (h) { heading = h; drawFinder(); });
  }
  function stopFinding() {
    if (stopWatch) stopWatch(); if (stopHeading) stopHeading();
    stopWatch = stopHeading = null; me = null; heading = null;
  }
  function drawFinder() {
    var s = spot(), box = $("pkFinder"); if (!s || !box) return;
    if (!me) { box.innerHTML = '<div class="pk-arrow wait">…</div><div class="pk-dist"><b>Ищем вас</b><span>ловим сигнал GPS</span></div>'; return; }
    var d = DEV.distance(me, s), br = DEV.bearing(me, s);
    if (d < 15) { box.innerHTML = '<div class="pk-arrow here">✓</div><div class="pk-dist"><b>Вы рядом с машиной</b><span>' + esc(s.floor || s.note || "осмотритесь вокруг") + "</span></div>"; return; }
    var rot = heading == null ? br : br - heading;
    box.innerHTML = '<div class="pk-arrow" style="transform:rotate(' + Math.round(rot) + 'deg)" aria-hidden="true"><svg width="54" height="54" viewBox="0 0 24 24"><path d="M12 2l6 18-6-4-6 4z" fill="currentColor"/></svg></div>' +
      '<div class="pk-dist"><b>' + fmtDist(d) + "</b><span>" + (heading == null ? "идите " + DIRS[Math.round(br / 45) % 8] + " · стрелка — относительно севера" : "идите по стрелке") + "</span></div>";
  }

  /* ---------- Экран ---------- */
  function render() {
    var body = $("pkBody"), foot = $("pkFoot"); if (!body) return;
    clearInterval(tick);
    if (draft) {
      var st = draft.status;
      var where = st === "locating" ? '<div class="pk-loc wait"><b>Определяем место…</b><span>ловим спутники, интернет не нужен</span></div>'
        : st === "error" ? '<div class="pk-loc err"><b>Координаты не определились</b><span>' + esc(draft.error) + '</span><button class="linkbtn" data-pk="retry" data-action="pk">Попробовать ещё раз</button></div>'
        : '<div class="pk-loc ok"><b>Место определено' + (st === "stale" ? " (последняя точка)" : "") + "</b><span>точность ±" + draft.accuracy + " м · " + clock(draft.at) + "</span></div>";
      body.innerHTML = where +
        '<button class="pk-photo" data-pk="photo" data-action="pk">' + (draft.photo ? '<img src="' + draft.photo + '" alt="Фото места"><span>Переснять</span>' : '<span class="pk-cam">📷</span><b>Сфотографировать место</b><span>номер места, колонну или вывеску рядом</span>') + "</button>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="fld">Этаж / ряд<input id="pkFloor" placeholder="-2, ряд C" autocomplete="off" value="' + esc(draft.floor) + '"></label>' +
        '<label class="fld">Заметка<input id="pkNote" placeholder="у ТЦ, вход 3" autocomplete="off" value="' + esc(draft.note) + '"></label></div>' +
        '<div class="to-sec">ТАЙМЕР ПАРКОВКИ</div><div class="pk-timers">' + [[0, "Без таймера"], [30, "30 мин"], [60, "1 ч"], [120, "2 ч"], [180, "3 ч"]].map(function (t) {
          return '<button class="' + (draft.minutes === t[0] ? "on" : "") + '" data-min="' + t[0] + '" data-action="pk">' + t[1] + "</button>";
        }).join("") + "</div>" +
        (draft.minutes ? '<div class="to-note">Напомним за 10 минут до конца и когда время выйдет — даже если приложение закрыто.</div>' : "");
      foot.innerHTML = '<button class="btn-accent" data-pk="save" data-action="pk"' + (st === "locating" ? " disabled" : "") + ">" + (st === "error" ? "Сохранить без координат" : "Сохранить место") + '</button><button class="linkbtn" data-pk="cancel" data-action="pk">Отмена</button>';
      foot.hidden = false;
      return;
    }
    var s = spot();
    if (!s) {
      var log = load(LOG, []);
      body.innerHTML = '<div class="pk-empty"><span class="pk-big">🅿️</span><b>Машина не отмечена</b><span>Когда припаркуетесь в незнакомом месте — нажмите кнопку. Приложение запомнит точку по GPS, фото и этаж, а потом приведёт обратно.</span></div>' +
        (log.length ? '<div class="to-sec">НЕДАВНИЕ ПАРКОВКИ</div><div class="kv">' + log.map(function (l) {
          var d = new Date(l.at);
          return "<div><span>" + d.getDate() + "." + ("0" + (d.getMonth() + 1)).slice(-2) + ", " + clock(l.at) + "–" + clock(l.left) + "</span><b>" + esc(l.floor || l.note || "без заметки") + "</b></div>";
        }).join("") + "</div>" : "");
      foot.innerHTML = '<button class="btn-accent" data-pk="mark" data-action="pk">Я припарковался здесь</button>';
      foot.hidden = false;
      stopFinding();
      return;
    }
    var left = s.until ? s.until - Date.now() : null;
    body.innerHTML = '<div class="pk-card"><div class="pk-card-h"><div><b>Стоит ' + dur(Date.now() - s.at) + '</b><span>с ' + clock(s.at) + (s.car ? " · " + esc(s.car) : "") + "</span></div>" +
        (s.accuracy != null ? '<span class="to-mk">±' + s.accuracy + " м</span>" : "") + "</div>" +
        (s.photo ? '<img class="pk-img" src="' + s.photo + '" alt="Фото места парковки">' : "") +
        (s.floor || s.note ? '<div class="pk-meta">' + (s.floor ? "<span>Этаж / ряд: <b>" + esc(s.floor) + "</b></span>" : "") + (s.note ? "<span>" + esc(s.note) + "</span>" : "") + "</div>" : "") + "</div>" +
      (s.until ? '<div class="pk-timer' + (left <= 10 * 60000 ? " soon" : "") + '"><div><b>' + (left > 0 ? "Осталось " + dur(left) : "Время вышло " + dur(-left) + " назад") + "</b><span>оплачено до " + clock(s.until) + '</span></div><button class="btn-light" data-pk="extend" data-action="pk">+30 мин</button></div>' : "") +
      (s.lat != null ? '<div class="pk-finder" id="pkFinder"></div><button class="btn-light" data-pk="map" data-action="pk" style="height:48px">Маршрут в картах</button>'
        : '<div class="to-note">Координаты не сохранились — ориентируйтесь по фото и заметке.</div>');
    foot.innerHTML = '<button class="btn-dark" data-pk="done" data-action="pk">Я забрал машину</button>';
    foot.hidden = false;
    if (s.lat != null) { drawFinder(); if (location.hash === "#Parking") startFinding(); }
    if (s.until) tick = setInterval(function () { if (location.hash === "#Parking") render(); }, 30000);
  }

  function onClick(e) {
    var b = e.target.closest("[data-pk],[data-min]"); if (!b) return;
    if (b.dataset.min != null) { keepInputs(); draft.minutes = +b.dataset.min; render(); return; }
    switch (b.dataset.pk) {
      case "mark": startMark(); break;
      case "retry": keepInputs(); draft.status = "locating"; render(); startMarkRetry(); break;
      case "photo": keepInputs(); DEV.takePhoto().then(function (d) { if (d && draft) { draft.photo = d; render(); } }); break;
      case "save": saveMark(); break;
      case "cancel": draft = null; render(); break;
      case "extend":
        var s = spot(); s.until = Math.max(s.until, Date.now()) + 30 * 60000; save(KEY, s); scheduleReminders(s); render();
        UI.toast("Продлили до " + clock(s.until)); break;
      case "map": var p = spot(); DEV.openMap(p.lat, p.lng, "Моя машина"); break;
      case "done": pickUp(); break;
    }
  }
  function keepInputs() { if (!draft) return; var f = $("pkFloor"), n = $("pkNote"); if (f) draft.floor = f.value; if (n) draft.note = n.value; }
  function startMarkRetry() {
    DEV.getLocation().then(function (p) { if (!draft) return; draft.lat = p.lat; draft.lng = p.lng; draft.accuracy = Math.round(p.accuracy || 0); draft.status = "ok"; render(); },
      function (e) { if (!draft) return; draft.status = "error"; draft.error = e.message; render(); });
  }

  /* ---------- Быстрые кнопки в гараже ---------- */
  function renderGarage() {
    var g = document.getElementById("s-Garage"); if (!g) return;
    var row = document.getElementById("quickRow");
    if (!row) {
      var anchor = document.getElementById("tipCard") || document.getElementById("toCard"); if (!anchor) return;
      row = document.createElement("div"); row.id = "quickRow"; row.className = "quick3";
      anchor.parentNode.insertBefore(row, anchor);
    }
    var s = spot();
    row.innerHTML =
      '<a href="#Parking" class="q3"><span class="q3-ic">🅿️</span><b>Где машина</b><span>' + (s ? "стоит " + dur(Date.now() - s.at) : "запомнить место") + "</span></a>" +
      '<a href="#Icons" class="q3"><span class="q3-ic">⚠️</span><b>Значки</b><span>что горит на панели</span></a>' +
      '<a href="#Mechanic" class="q3"><span class="q3-ic">💬</span><b>AI-механик</b><span>спросить о машине</span></a>';
  }

  function init() {
    var scr = $("s-Parking"); if (!scr) return;
    scr.addEventListener("click", onClick);
    window.addEventListener("hashchange", function () {
      if (location.hash === "#Parking") render();
      else stopFinding();
      if (location.hash === "#Garage") renderGarage();
    });
    render(); renderGarage();
  }
  window.AutoHubParking = { init: init, spot: spot };
})();
