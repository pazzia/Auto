/* АвтоХаб: раздел «Всё для машины» в гараже и сводные карточки (уровень, ближайший срок).
 * Плитка показывается, только если экран есть в сборке; точка «новое» гаснет после первого захода.
 */
(function () {
  "use strict";

  var P = {
    fuel: '<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20"/><path d="M4 20h11"/><path d="M7 7h5v4H7z"/><path d="M14 9h1.5l2 2v5.5a1.5 1.5 0 0 0 3 0V8l-2-2"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/>',
    check: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 21h8M10 17h4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M10 8h3a2.5 2.5 0 0 1 0 5h-3V8zM9 16h4"/>',
    fine: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    tire: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
    sos: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.2"/>',
    passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
    family: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.2 1.3-4 3.5-4 1.5 0 2.5.7 2.5 2"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>'
  };
  // экран, подпись, иконка, новый раздел
  var TILES = [["Fuel", "Заправки", "fuel", 1], ["Docs", "Документы", "doc", 1], ["Checklists", "Чек-листы", "check", 1], ["DIY", "Сделай сам", "wrench", 1],
    ["Calc", "Калькуляторы", "calc", 1], ["BodyPhoto", "Фото кузова", "camera", 1], ["Achievements", "Достижения", "trophy", 1], ["Budget", "Бюджет", "chart", 0],
    ["Wallet", "Баллы", "coin", 0], ["Fines", "Штрафы", "fine", 0], ["Tires", "Шины", "tire", 0], ["Insurance", "Страховка", "shield", 0],
    ["SOS", "SOS", "sos", 0], ["CarPassport", "Паспорт", "passport", 0], ["Family", "Семья", "family", 0], ["Season", "Сезон", "calendar", 1]];

  function icon(k, c) { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + (c || "currentColor") + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[k] + "</svg>"; }
  function seen() { try { return JSON.parse(localStorage.getItem("autohub.seen.v1") || "{}"); } catch (e) { return {}; } }
  function markSeen(n) { var s = seen(); if (!s[n]) { s[n] = 1; try { localStorage.setItem("autohub.seen.v1", JSON.stringify(s)); } catch (e) {} } }
  function unpaidFines() { var p = {}; try { p = JSON.parse(localStorage.getItem("autohub.fines.v1") || "{}"); } catch (e) {} return ["f1", "f2"].filter(function (k) { return !p[k]; }).length; }

  function renderGrid() {
    var g = document.getElementById("s-Garage"); if (!g) return;
    var label = Array.prototype.filter.call(g.querySelectorAll("div"), function (d) { return d.textContent.trim() === "ВСЁ ДЛЯ МАШИНЫ"; })[0];
    var grid = label && label.nextElementSibling; if (!grid) return;
    grid.id = "hubGrid"; grid.className = "hub-grid"; grid.removeAttribute("style");
    var s = seen(), fines = unpaidFines();
    grid.innerHTML = TILES.filter(function (t) { return document.getElementById("s-" + t[0]); }).map(function (t) {
      var isNew = t[3] && !s[t[0]];
      var badge = t[0] === "Fines" && fines ? '<span class="hub-badge">' + fines + "</span>" : isNew ? '<span class="hub-new" aria-label="новое"></span>' : "";
      return '<a href="#' + t[0] + '" class="hub-tile">' + icon(t[2], isNew ? "#C2410C" : null) + "<span>" + t[1] + "</span>" + badge + "</a>";
    }).join("");
  }
  // Уровень (AUTO-19) — рядом с аватаром
  function renderLevel() {
    var g = document.getElementById("s-Garage"); if (!g || !window.AutoHubAch) return;
    var av = document.getElementById("garageAvatar"); if (!av) return;
    var chip = document.getElementById("levelChip");
    if (!chip) { chip = document.createElement("a"); chip.id = "levelChip"; chip.href = "#Achievements"; chip.className = "lvl-chip"; av.parentNode.insertBefore(chip, av); }
    var l = window.AutoHubAch.level();
    chip.setAttribute("aria-label", "Уровень " + l.n + ": " + l.name);
    chip.innerHTML = '<span class="lvl-n">' + l.n + "</span>" + l.short;
  }
  // Ближайший срок (AUTO-15) — карточкой под советом дня
  function renderDeadline() {
    var g = document.getElementById("s-Garage"); if (!g || !window.AutoHubDocs) return;
    var anchor = document.getElementById("quickRow") || document.getElementById("tipCard"); if (!anchor) return;
    var card = document.getElementById("deadlineCard");
    if (!card) { card = document.createElement("a"); card.id = "deadlineCard"; card.href = "#Docs"; card.className = "dl-card"; anchor.parentNode.insertBefore(card, anchor); }
    var d = window.AutoHubDocs.soon();
    card.hidden = !d.first;
    if (!d.first) return;
    card.classList.toggle("over", d.first.days < 0);
    card.innerHTML = '<span class="dl-ic">' + icon("bell", "#C2410C") + "</span><span class=\"dl-t\"><b>" + UI().esc(d.first.title) + " " + (d.first.days < 0 ? "просрочен" + (d.first.fem ? "а" : "") : "истекает через " + d.first.days + " " + plural(d.first.days)) + "</b>" +
      (d.more ? "<span>и ещё " + d.more + " " + (d.more === 1 ? "срок" : "срока") + " в этом месяце</span>" : "<span>напомним заранее</span>") + '</span><span class="prow-go">›</span>';
  }
  function plural(n) { n = Math.abs(n); var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? "день" : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? "дня" : "дней"; }
  function UI() { return window.AutoHubUI; }

  function render() { renderGrid(); renderLevel(); renderDeadline(); }
  function init() {
    window.addEventListener("hashchange", function () {
      var n = location.hash.slice(1).split("/")[0];
      if (TILES.some(function (t) { return t[0] === n; })) markSeen(n);
      if (n === "Garage") render();
    });
    render();
  }
  window.AutoHubHub = { init: init, render: render };
})();
