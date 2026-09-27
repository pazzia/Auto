/* АвтоХаб: экран «Автосервисы» — список и статическая карта Подмосковья.
 * Данные: AutoHubApi.services.list (заглушка в режиме mock).
 * Карта: web/map/podmoskovye.svg, встраивается в страницу как <template id="map-podmoskovye">.
 * Проекция карты: x = (lon - lon0) * kx, y = (lat0 - lat) * ky (единица — 1 км), параметры в data-* SVG.
 */
(function () {
  "use strict";

  var ACC = "#C2410C", INK = "#17191C", MUTED = "#5B5F66", LINE = "#E2DED6";
  var SVGNS = "http://www.w3.org/2000/svg";
  var state = { items: [], origin: null, selected: null, filters: { online: true }, view: "map" };
  var small = null, full = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtKm(k) { return (k < 10 ? k.toFixed(1) : Math.round(k)).toString().replace(".", ",") + " км"; }
  function fmtRub(n) { return Number(n).toLocaleString("ru-RU") + " ₽"; }

  /* ================= Карта ================= */
  function MapView(host, opts) {
    var tpl = document.getElementById("map-podmoskovye");
    this.opts = opts || {};
    this.host = host;
    this.svg = tpl.content.firstElementChild.cloneNode(true);
    this.svg.removeAttribute("width"); this.svg.removeAttribute("height");
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    var d = this.svg.dataset;
    this.p = { lon0: +d.lon0, lat0: +d.lat0, kx: +d.kx, ky: +d.ky };
    this.pins = document.createElementNS(SVGNS, "g");
    this.svg.appendChild(this.pins);
    host.appendChild(this.svg);
    this.vb = { cx: 164, cy: 139, w: 120 };
  }
  MapView.prototype.xy = function (lat, lng) {
    return { x: (lng - this.p.lon0) * this.p.kx, y: (this.p.lat0 - lat) * this.p.ky };
  };
  MapView.prototype.size = function () {
    var r = this.host.getBoundingClientRect();
    return { w: r.width || 358, h: r.height || 180 };
  };
  MapView.prototype.fit = function (points, padPx) {
    if (!points.length) return;
    var s = this.size(), pad = padPx == null ? 36 : padPx;
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var bw = Math.max(maxX - minX, 6), bh = Math.max(maxY - minY, 6);
    var k = Math.min((s.w - 2 * pad) / bw, (s.h - 2 * pad) / bh);
    this.vb = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: s.w / k };
    this.render();
  };
  MapView.prototype.zoom = function (f) {
    this.vb.w = Math.max(12, Math.min(420, this.vb.w / f));
    this.render();
  };
  MapView.prototype.panPx = function (dx, dy) {
    var k = this.size().w / this.vb.w;
    this.vb.cx -= dx / k; this.vb.cy -= dy / k;
    this.vb.cx = Math.max(-40, Math.min(375, this.vb.cx));
    this.vb.cy = Math.max(-40, Math.min(352, this.vb.cy));
    this.render();
  };
  MapView.prototype.render = function () {
    var s = this.size(), w = this.vb.w, h = w * s.h / s.w, k = s.w / w;
    this.k = k;
    this.svg.setAttribute("viewBox", [this.vb.cx - w / 2, this.vb.cy - h / 2, w, h].map(function (v) { return v.toFixed(2); }).join(" "));
    // Подписи держат постоянный размер на экране; мелкие города — только при приближении
    var towns = this.svg.querySelector(".map-towns"), roads = this.svg.querySelector(".map-roads");
    if (towns) {
      towns.setAttribute("font-size", (11 / k).toFixed(3));
      towns.querySelectorAll("g[data-rank]").forEach(function (g) {
        var r = +g.getAttribute("data-rank");
        g.style.display = (r === 2 && k < 3.2) ? "none" : "";
        var t = g.querySelector("text"), c = g.querySelector("circle");
        if (c) c.setAttribute("r", (2.2 / k).toFixed(3));
        if (t && t.hasAttribute("data-dx")) {
          if (!t.dataset.x0) { t.dataset.x0 = t.getAttribute("x"); t.dataset.y0 = t.getAttribute("y"); }
          t.setAttribute("x", (+t.dataset.x0 + 4 / k).toFixed(2));
          t.setAttribute("y", (+t.dataset.y0 - 4 / k).toFixed(2));
        }
        if (t && t.hasAttribute("data-fs")) t.setAttribute("font-size", (+t.getAttribute("data-fs") / k).toFixed(3));
      });
    }
    if (roads) {
      roads.setAttribute("font-size", (9 / k).toFixed(3));
      roads.style.display = k < 2 ? "none" : "";
    }
    this.drawPins();
  };
  MapView.prototype.drawPins = function () {
    var self = this, k = this.k || 1, g = this.pins;
    while (g.firstChild) g.removeChild(g.firstChild);
    var sel = state.selected;
    state.items.slice().sort(function (a, b) { return (a.id === sel) - (b.id === sel); }).forEach(function (s) {
      var p = self.xy(s.lat, s.lng), on = s.id === sel;
      var label = "★ " + s.ratingGis.toFixed(1), wpx = 50, hpx = 26;
      var pin = document.createElementNS(SVGNS, "g");
      pin.setAttribute("data-sid", s.id);
      pin.style.cursor = "pointer";
      pin.innerHTML =
        '<path d="M' + p.x + " " + p.y + " l" + (-5 / k) + " " + (-8 / k) + " h" + (10 / k) + ' z" fill="' + (on ? ACC : INK) + '"/>' +
        '<rect x="' + (p.x - wpx / 2 / k) + '" y="' + (p.y - (hpx + 7) / k) + '" width="' + (wpx / k) + '" height="' + (hpx / k) +
        '" rx="' + (hpx / 2 / k) + '" fill="' + (on ? ACC : INK) + '" stroke="#FFFFFF" stroke-width="1.5" vector-effect="non-scaling-stroke"/>' +
        '<text x="' + p.x + '" y="' + (p.y - (7 + hpx / 2 - 4.2) / k) + '" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="700" font-size="' +
        (12 / k) + '" fill="#FFFFFF" style="stroke:none">' + label + "</text>";
      g.appendChild(pin);
    });
    if (state.origin) {
      var u = self.xy(state.origin.lat, state.origin.lng);
      var me = document.createElementNS(SVGNS, "g");
      me.innerHTML = '<circle cx="' + u.x + '" cy="' + u.y + '" r="' + (14 / k) + '" fill="#1D4ED8" opacity="0.15"/>' +
        '<circle cx="' + u.x + '" cy="' + u.y + '" r="' + (7 / k) + '" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="3" vector-effect="non-scaling-stroke"/>';
      g.appendChild(me);
    }
  };
  MapView.prototype.points = function () {
    var self = this, pts = state.items.map(function (s) { return self.xy(s.lat, s.lng); });
    if (state.origin) pts.push(self.xy(state.origin.lat, state.origin.lng));
    return pts;
  };
  MapView.prototype.focus = function (sid) {
    var s = state.items.filter(function (x) { return x.id === sid; })[0];
    if (!s) return;
    var p = this.xy(s.lat, s.lng);
    this.vb.cx = p.x; this.vb.cy = p.y;
    this.render();
  };

  /* ---------- Жесты: перетаскивание, колесо, тап по метке ---------- */
  function bindGestures(view, onTapPin, onTapEmpty) {
    var el = view.svg, drag = null, pts = {};
    el.addEventListener("pointerdown", function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pts).length === 1) drag = { x: e.clientX, y: e.clientY, moved: 0, target: e.target };
      else drag = null;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", function (e) {
      var prev = pts[e.pointerId]; if (!prev) return;
      var ids = Object.keys(pts);
      if (ids.length === 2) { // щипок
        var other = pts[ids[0] == e.pointerId ? ids[1] : ids[0]];
        var d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (d0 > 0) view.zoom(d1 / d0);
      } else if (drag && view.opts.pannable) {
        drag.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
        view.panPx(e.clientX - prev.x, e.clientY - prev.y);
      } else if (drag) {
        drag.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      }
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    });
    function up(e) {
      delete pts[e.pointerId];
      if (drag && drag.moved < 8) {
        var pin = drag.target.closest && drag.target.closest("[data-sid]");
        if (pin) onTapPin(pin.getAttribute("data-sid")); else if (onTapEmpty) onTapEmpty();
      }
      drag = null;
    }
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", function (e) { delete pts[e.pointerId]; drag = null; });
    if (view.opts.pannable) {
      el.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    }
  }

  /* ================= Список ================= */
  function badge(s) {
    if (!s.priceTO) return '<span style="padding: 3px 8px; border-radius: 6px; background: #EFECE6; font-weight: 600">Шиномонтаж и хранение</span>';
    if (s.priceVerdict === "high")
      return '<span style="padding: 3px 8px; border-radius: 6px; background: #FCEBDF; color: #9A3412; font-weight: 700">ТО ' + fmtRub(s.priceTO) + " · выше рынка на " + s.priceDiffPct + "%</span>";
    if (s.priceVerdict === "low")
      return '<span style="padding: 3px 8px; border-radius: 6px; background: #DDF0E4; color: #0F6B3A; font-weight: 700">ТО ' + fmtRub(s.priceTO) + " · ниже рынка на " + Math.abs(s.priceDiffPct) + "%</span>";
    return '<span style="padding: 3px 8px; border-radius: 6px; background: #DDF0E4; color: #0F6B3A; font-weight: 700">ТО ' + fmtRub(s.priceTO) + " · цена в норме</span>";
  }
  function card(s) {
    var on = s.id === state.selected;
    return '<div data-card="' + s.id + '" style="background: #FFFFFF; border: ' + (on ? "1.5px solid " + ACC : "1px solid " + LINE) +
      '; border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px">' +
      '<div style="display: flex; flex-direction: column; gap: 3px"><span style="font-weight: 700; font-size: 16px">' + esc(s.name) + "</span>" +
      '<span style="font-size: 13px; color: ' + MUTED + '">' + fmtKm(s.distanceKm) + " · " + esc(s.town) + ", " + esc(s.address) + " · " + esc(s.hours) + "</span></div>" +
      '<span style="font-weight: 700; font-size: 15px; white-space: nowrap">★ ' + s.ratingGis.toFixed(1) + "</span></div>" +
      '<div style="display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px">' + badge(s) +
      '<span style="padding: 3px 8px; border-radius: 6px; background: #EFECE6; font-weight: 600">2ГИС ' + s.ratingGis.toFixed(1) + " · " + s.reviewsGis + " отз.</span>" +
      '<span style="padding: 3px 8px; border-radius: 6px; background: #EFECE6; font-weight: 600">Яндекс ' + s.ratingYa.toFixed(1) + " · " + s.reviewsYa + " отз.</span></div>" +
      '<div style="display: flex; justify-content: space-between; align-items: center">' +
      '<div><div style="font-size: 12px; color: ' + MUTED + '">' + (s.online ? "Ближайшее окно" : "Запись по телефону") + "</div>" +
      '<div style="font-weight: 700; font-size: 15px' + (s.today ? "; color: #0F6B3A" : "") + '">' + esc(s.next) + "</div></div>" +
      (s.online
        ? '<a href="#ServiceBooking" data-book="' + s.id + '" style="height: 44px; padding: 0 18px; border-radius: 12px; background: ' + (on ? ACC : "#F3F1EC") +
          "; color: " + (on ? "#FFFFFF" : INK) + '; font-weight: 700; font-size: 14px; display: flex; align-items: center; text-decoration: none">Записаться</a>'
        : '<button style="height: 44px; padding: 0 18px; border-radius: 12px; background: #F3F1EC; color: ' + INK + '; border: none; font-weight: 700; font-size: 14px">Позвонить</button>') +
      "</div></div>";
  }

  // Выбранный сервис передаём экрану записи
  function remember(id) {
    var s = state.items.filter(function (x) { return x.id === id; })[0];
    try { sessionStorage.setItem("autohub.service", id); if (s) sessionStorage.setItem("autohub.serviceObj", JSON.stringify(s)); } catch (x) {}
  }

  /* ================= Экран ================= */
  var ui = {};
  function setSeg(btn, on) {
    btn.style.background = on ? "#FFFFFF" : "transparent";
    btn.style.fontWeight = on ? "700" : "600";
    btn.style.color = on ? INK : MUTED;
  }
  function setChip(btn, on) {
    btn.style.background = on ? INK : "#FFFFFF";
    btn.style.color = on ? "#FFFFFF" : INK;
    btn.style.border = on ? "none" : "1px solid " + LINE;
  }
  function renderList() {
    var box = ui.list;
    if (!state.items.length) {
      box.innerHTML = '<div style="padding: 24px 8px; text-align: center; color: ' + MUTED + '; font-size: 14px">Под фильтры ничего не нашлось. Снимите один из фильтров.</div>';
      return;
    }
    box.innerHTML = state.items.map(card).join("") +
      '<div style="font-size: 12px; color: ' + MUTED + '; padding: 0 4px">Цены и рейтинги демонстрационные · ' + esc(ui.source || "") + "</div>";
  }
  function select(sid, scroll) {
    state.selected = sid;
    renderList();
    if (small) small.drawPins();
    if (full) { full.drawPins(); renderSheet(); }
    if (scroll) {
      var el = ui.list.querySelector('[data-card="' + sid + '"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  function applyView() {
    setSeg(ui.segMap, state.view === "map");
    setSeg(ui.segList, state.view === "list");
    ui.mapBox.style.display = state.view === "map" ? "" : "none";
    if (state.view === "map" && small) small.fit(small.points());
  }
  function load() {
    ui.list.innerHTML = '<div style="padding: 24px 8px; text-align: center; color: ' + MUTED + '; font-size: 14px">Ищем сервисы рядом…</div>';
    var f = state.filters;
    return window.AutoHubApi.services.list({ lat: state.origin && state.origin.lat, lng: state.origin && state.origin.lng,
      online: f.online, to: f.to, today: f.today, tires: f.tires }).then(function (r) {
      state.items = r.items; state.origin = r.origin || state.origin; ui.source = r.source;
      if (!state.items.some(function (s) { return s.id === state.selected; })) state.selected = state.items[0] ? state.items[0].id : null;
      renderList();
      if (small) small.fit(small.points());
      if (full) { full.drawPins(); renderSheet(); }
    }, function (e) {
      state.items = []; ui.list.innerHTML = '<div style="padding: 24px 8px; text-align: center; color: #9A3412; font-size: 14px">' +
        (e.code === "not_configured" ? "Бэкенд не подключён. Откройте прототип в демо-режиме." : "Не удалось загрузить сервисы. Попробуйте ещё раз.") + "</div>";
    });
  }

  /* ---------- Полноэкранная карта (#Services/map) ---------- */
  function renderSheet() {
    if (!ui.sheet) return;
    var s = state.items.filter(function (x) { return x.id === state.selected; })[0];
    ui.sheet.innerHTML = s ? card(s) : "";
    ui.sheet.style.display = s ? "" : "none";
  }
  function openFull() {
    if (location.hash !== "#Services/map") location.hash = "#Services/map";
  }
  function buildFull() {
    var root = ui.root;
    var ov = document.createElement("div");
    ov.className = "mapfull";
    ov.innerHTML =
      '<div class="mapfull-canvas"></div>' +
      '<div class="mapfull-top"><button data-action="close" aria-label="Закрыть карту" class="mapbtn">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div class="mapfull-title">Подмосковье<span>схема для прототипа, не для навигации</span></div></div>' +
      '<div class="mapfull-zoom"><button data-action="zin" aria-label="Приблизить" class="mapbtn">+</button>' +
      '<button data-action="zout" aria-label="Отдалить" class="mapbtn">−</button>' +
      '<button data-action="me" aria-label="Где я" class="mapbtn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>' +
      '<button data-action="all" aria-label="Вся область" class="mapbtn" style="font-size:11px">МО</button></div>' +
      '<div class="mapfull-sheet"></div>';
    root.appendChild(ov);
    ui.full = ov; ui.sheet = ov.querySelector(".mapfull-sheet");
    full = new MapView(ov.querySelector(".mapfull-canvas"), { pannable: true });
    bindGestures(full, function (sid) { select(sid, false); }, null);
    ov.addEventListener("click", function (e) {
      var bk = e.target.closest("[data-book]");
      if (bk) { remember(bk.getAttribute("data-book")); return; }
      var b = e.target.closest("button[data-action]"); if (!b) return;
      var a = b.dataset.action;
      if (a === "close") history.back();
      else if (a === "zin") full.zoom(1.5);
      else if (a === "zout") full.zoom(1 / 1.5);
      else if (a === "all") { full.vb = { cx: 167, cy: 156, w: 340 }; full.render(); }
      else if (a === "me" && state.origin) { var p = full.xy(state.origin.lat, state.origin.lng); full.vb.cx = p.x; full.vb.cy = p.y; full.vb.w = Math.min(full.vb.w, 40); full.render(); }
    });
  }
  function syncHash() {
    // Экран показывает app.js в своём обработчике hashchange — размеры считаем в следующем кадре
    requestAnimationFrame(function () {
      var want = location.hash === "#Services/map";
      if (want) {
        if (!ui.full) buildFull();
        ui.full.style.display = "block";
        full.fit(full.points(), 50);
        if (state.selected) full.focus(state.selected);
        renderSheet();
      } else {
        if (ui.full) ui.full.style.display = "none";
        if (location.hash === "#Services" && small && state.view === "map") small.fit(small.points());
      }
    });
  }

  function init() {
    var scr = document.getElementById("s-Services");
    if (!scr || !window.AutoHubApi || !document.getElementById("map-podmoskovye")) return;
    var root = scr.firstElementChild;
    ui.root = root;
    var header = root.children[0];
    ui.mapBox = root.children[1];
    ui.list = root.children[2];
    var segs = header.children[0].querySelectorAll("button");
    ui.segMap = segs[0]; ui.segList = segs[1];
    header.children[1].style.overflowX = "auto";
    header.children[1].style.scrollbarWidth = "none";
    var chips = header.children[1].querySelectorAll("button");
    var keys = ["online", "to", "today", "tires"];
    chips.forEach(function (b, i) {
      b.dataset.action = "filter"; b.dataset.key = keys[i];
      setChip(b, !!state.filters[keys[i]]);
      b.setAttribute("aria-pressed", String(!!state.filters[keys[i]]));
      b.addEventListener("click", function () {
        var k = b.dataset.key; state.filters[k] = !state.filters[k];
        setChip(b, state.filters[k]); b.setAttribute("aria-pressed", String(state.filters[k]));
        load();
      });
    });
    ui.segMap.dataset.action = "view"; ui.segList.dataset.action = "view";
    ui.segMap.addEventListener("click", function () { state.view = "map"; applyView(); });
    ui.segList.addEventListener("click", function () { state.view = "list"; applyView(); });

    // Карта вместо заглушки из макета
    ui.mapBox.innerHTML = "";
    ui.mapBox.style.cursor = "pointer";
    ui.mapBox.setAttribute("aria-label", "Карта автосервисов, нажмите, чтобы развернуть");
    small = new MapView(ui.mapBox, { pannable: false });
    var hint = document.createElement("div");
    hint.textContent = "Развернуть";
    hint.style.cssText = "position:absolute;right:10px;bottom:10px;height:28px;padding:0 10px;border-radius:999px;background:#FFFFFF;border:1px solid " + LINE + ";font-size:12px;font-weight:700;display:flex;align-items:center;pointer-events:none";
    ui.mapBox.appendChild(hint);
    bindGestures(small, function (sid) { select(sid, true); }, openFull);

    ui.list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-book]");
      if (a) { remember(a.getAttribute("data-book")); return; }
      var c = e.target.closest("[data-card]");
      if (c && !e.target.closest("a,button")) select(c.getAttribute("data-card"), false);
    });

    window.addEventListener("hashchange", syncHash);
    window.addEventListener("resize", function () { if (small && location.hash.indexOf("#Services") === 0) small.render(); if (full && ui.full && ui.full.style.display !== "none") full.render(); });

    // Точка отсчёта — адрес из личного кабинета
    var here = window.AutoHubAuth ? Promise.resolve(window.AutoHubAuth.location()) : window.AutoHubApi.userPosition();
    here.then(function (pos) { state.origin = pos; }).then(load).then(function () {
      applyView(); syncHash();
    });
  }

  function relocate() { if (window.AutoHubAuth) { state.origin = window.AutoHubAuth.location(); load(); } }
  window.AutoHubServices = { init: init, relocate: relocate };
})();
