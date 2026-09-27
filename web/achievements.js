/* АвтоХаб: AUTO-19 «Достижения и уровни».
 * Достижения засчитываются по реальным действиям в приложении (ТО, заправки, чек-листы, «Сделай сам», фото, отзывы).
 * За новое достижение +50 баллов, за новый уровень +200 (журнал баллов AUTO-29). Без интернета.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var LEVELS = [[0, "Новичок", "Новичок"], [100, "Внимательный водитель", "Внимательный"], [300, "Заботливый владелец", "Заботливый"], [600, "Надёжный водитель", "Надёжный"], [1000, "Мастер гаража", "Мастер"]];
  var P = {
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', flame: '<path d="M12 21c-4 0-6.5-2.8-6.5-6.3 0-3.8 3.2-5.7 3.7-9.7 2.5 1.6 3.3 3.8 3.3 5.5 1-.6 1.6-1.8 1.8-3 2.3 2 4.2 4.6 4.2 7.2 0 3.5-2.5 6.3-6.5 6.3z"/>',
    fuel: '<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20"/><path d="M4 20h11"/><path d="M14 9h1.5l2 2v5.5a1.5 1.5 0 0 0 3 0V8l-2-2"/>',
    shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>', check: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
  };
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("autohub." + k, JSON.stringify(v)); } catch (e) {} }
  function ev(n) { return (UI.events()[n] || { count: 0 }).count; }
  function month(d) { d = d || new Date(); return d.getFullYear() * 12 + d.getMonth(); }

  /* ---------- Серия: пробег обновлялся каждый месяц ---------- */
  function trackMileage() {
    var c = window.AutoHubCar && window.AutoHubCar.active(); if (!c || !c.mileage || c.demo) return;
    var m = load("ach.mileage.v1", {}), rec = m[c.id] || { km: c.mileage, months: {} };
    if (c.mileage > rec.km || !Object.keys(rec.months).length) rec.months[month()] = 1;
    rec.km = c.mileage; m[c.id] = rec; save("ach.mileage.v1", m);
  }
  function streak() {
    var m = load("ach.mileage.v1", {}), months = {};
    Object.keys(m).forEach(function (k) { Object.keys(m[k].months).forEach(function (x) { months[x] = 1; }); });
    var cur = month(), s = 0, start = months[cur] ? cur : cur - 1; // серия не прерывается, пока текущий месяц не закончился
    while (months[start - s]) s++;
    return { months: s, thisMonth: !!months[cur] };
  }

  /* ---------- Достижения: id, название, иконка, как получить, [сейчас, нужно], ссылка ---------- */
  function badges() {
    var orders = load("orders.v1", {}), done = 0, rated = 0;
    Object.keys(orders).forEach(function (k) { if (orders[k].stage >= 4) done++; if (orders[k].rated) rated++; });
    var finesPaid = load("fines.v1", {}), unpaid = ["f1", "f2"].filter(function (k) { return !finesPaid[k]; }).length;
    var s = (load("session.v1", {}) || {}).since, days = s ? Math.floor((Date.now() - new Date(s + "T12:00:00")) / 864e5) : 0;
    return [
      ["to", "ТО вовремя", "ok", "пройдите ТО через приложение", [Math.min(done, 1), 1], "#TO"],
      ["streak", "Серия пробега", "flame", "обновляйте пробег 3 месяца подряд", [Math.min(streak().months, 3), 3], "#Fuel"],
      ["fuel", "Журнал заправок", "fuel", "10 заправок в журнале", [Math.min(window.AutoHubFuel ? window.AutoHubFuel.count() : 0, 10), 10], "#Fuel"],
      ["fines", "Штрафы закрыты", "shield", "оплатите все штрафы", [unpaid ? 0 : 1, 1], "#Fines"],
      ["checklist", "Готов к дороге", "check", "пройдите чек-лист целиком", [Math.min(ev("checklist_done"), 1), 1], "#Checklists"],
      ["diy", "Сделал сам", "wrench", "3 инструкции «Сделай сам»", [Math.min(ev("diy_done"), 3), 3], "#DIY"],
      ["review", "Честный отзыв", "star", "оцените сервис после ТО", [Math.min(rated, 1), 1], "#TO"],
      ["photo", "Под защитой", "camera", "сделайте фото кузова", [Math.min(ev("photos_done"), 1), 1], "#BodyPhoto"],
      ["parking", "Паркуюсь с умом", "pin", "3 раза отметьте парковку", [Math.min(load("parking.log.v1", []).length, 3), 3], "#Parking"],
      ["year", "Год с АвтоХабом", "cal", "пользуйтесь приложением год", [Math.min(days, 365), 365], "#Garage"]
    ].map(function (b) { return { id: b[0], title: b[1], icon: b[2], how: b[3], cur: b[4][0], need: b[4][1], href: b[5], got: b[4][0] >= b[4][1] }; });
  }
  function score(list) { return list.filter(function (b) { return b.got; }).length * 100 + streak().months * 20; }
  function level() {
    var sc = score(badges()), i = LEVELS.length - 1; while (i > 0 && sc < LEVELS[i][0]) i--;
    var next = LEVELS[i + 1];
    return { n: i + 1, name: LEVELS[i][1], short: LEVELS[i][2], score: sc, next: next ? next[0] : null, prev: LEVELS[i][0], nextName: next ? next[1] : null };
  }

  /** Проверить новые достижения и уровень; начислить баллы. */
  function check() {
    var st = load("ach.v1", { unlocked: {}, level: 1 }), list = badges(), fresh = [];
    list.forEach(function (b) { if (b.got && !st.unlocked[b.id]) { st.unlocked[b.id] = Date.now(); fresh.push(b); } });
    fresh.forEach(function (b) { if (window.AutoHubPoints) window.AutoHubPoints.add(50, "Достижение «" + b.title + "»"); });
    var l = level();
    if (l.n > st.level) { if (window.AutoHubPoints) window.AutoHubPoints.add(200 * (l.n - st.level), "Новый уровень: " + l.name); st.level = l.n; UI.toast("Новый уровень: " + l.name + " · +200 баллов"); }
    else if (fresh.length) UI.toast(fresh.length === 1 ? "Новое достижение: " + fresh[0].title + " · +50 баллов" : "Новых достижений: " + fresh.length + " · +" + fresh.length * 50 + " баллов");
    save("ach.v1", st);
    if (fresh.length && window.AutoHubHub) window.AutoHubHub.render();
  }

  function icon(k, c) { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[k] + "</svg>"; }
  function render() {
    var body = document.getElementById("acBody"); if (!body) return;
    var l = level(), s = streak(), list = badges();
    var pct = l.next ? Math.round((l.score - l.prev) / (l.next - l.prev) * 100) : 100;
    var html = '<div class="ac-level"><div class="ac-top"><span class="ac-n">' + l.n + '</span><span><b>' + esc(l.name) + "</b><small>" +
      (l.next ? "до уровня «" + esc(l.nextName) + "» — " + (l.next - l.score) + " очков · +200 баллов" : "максимальный уровень") + '</small></span></div><div class="to-bar"><div style="width:' + pct + '%"></div></div></div>' +
      '<a class="ac-streak" href="#Fuel"><span>' + icon("flame", "#C2410C") + "</span><span><b>" + (s.months ? "Серия: пробег " + s.months + " мес. подряд" : "Начните серию пробега") + "</b><small>" +
      (s.thisMonth ? "в этом месяце уже обновлён — отлично" : s.months ? "обновите пробег в этом месяце, чтобы не прервать · +20 очков" : "обновляйте пробег каждый месяц: через заправку или вручную") + "</small></span></a>" +
      '<div class="ac-grid">' + list.map(function (b) {
        return '<button class="ac-b' + (b.got ? " got" : "") + '" data-badge="' + b.id + '" data-action="b"><span class="ac-ic">' + icon(b.icon, b.got ? "#FFFFFF" : "#9A958B") + "</span><b>" + esc(b.title) + "</b><small>" +
          (b.got ? "получено" : b.need > 1 ? b.cur + " из " + b.need : esc(b.how)) + "</small>" + (!b.got && b.need > 1 ? '<i><em style="width:' + Math.round(b.cur / b.need * 100) + '%"></em></i>' : "") + "</button>";
      }).join("") + "</div>";
    body.innerHTML = html;
  }
  function init() {
    var scr = document.getElementById("s-Achievements"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      var b = e.target.closest("[data-badge]"); if (!b) return;
      var x = badges().filter(function (y) { return y.id === b.dataset.badge; })[0];
      UI.sheet({ title: x.title, html: '<p class="sheet-text">' + (x.got ? "Получено! Спасибо, что заботитесь о машине." : "Как получить: " + esc(x.how) + ".") + "</p>" +
        (x.need > 1 && !x.got ? '<p class="ic-note">Прогресс: ' + x.cur + " из " + x.need + "</p>" : "") + '<p class="ic-note">За достижение — 50 баллов, за новый уровень — 200.</p>' +
        (x.got ? "" : '<a class="btn-accent" href="' + x.href + '" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Перейти</a>') });
    });
    function refresh() { trackMileage(); check(); if (location.hash === "#Achievements") render(); }
    window.addEventListener("autohub:event", refresh);
    window.addEventListener("autohub:car", refresh);
    window.addEventListener("hashchange", function () { if (location.hash === "#Achievements" || location.hash === "#Garage") refresh(); });
    trackMileage(); check(); render();
  }
  window.AutoHubAch = { init: init, level: level, check: check };
})();
