/* АвтоХаб: AUTO-15 «Сроки документов и аптечки».
 * Сроки хранятся на телефоне, напоминание — системным уведомлением за выбранное число дней (работает без интернета).
 * Дату диагностической карты и других документов пользователь вводит сам: обязательность зависит от машины.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var KINDS = [["Аптечка", 30], ["Огнетушитель", 30], ["ОСАГО", 30], ["Водительское удостоверение", 60], ["Диагностическая карта", 30], ["Другое", 14]];
  var MONF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem("autohub." + k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("autohub." + k, JSON.stringify(v)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function daysLeft(iso) { return Math.round((new Date(iso + "T00:00:00") - today()) / 864e5); }
  function dLong(iso) { var d = new Date(iso + "T12:00:00"); return d.getDate() + " " + MONF[d.getMonth()] + " " + d.getFullYear(); }
  function plural(n, a, b, c) { n = Math.abs(n); var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
  function human(n) {
    if (n < 0) return "срок истёк";
    if (n === 0) return "истекает сегодня";
    if (n < 60) return n + " " + plural(n, "день", "дня", "дней");
    var m = Math.round(n / 30); if (m < 24) return m + " " + plural(m, "месяц", "месяца", "месяцев");
    var y = Math.round(n / 365); return y + " " + plural(y, "год", "года", "лет");
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 8000 + Math.abs(h) % 900; }

  function list() {
    var l = load("docs.v1", null);
    if (!l) { // первый запуск: ОСАГО уже известно из раздела «Страховка»
      var o = load("osago.v1", null);
      l = [{ id: "d-osago", title: "ОСАГО", until: o ? "2027-10-24" : "2026-10-24", remind: 30, note: "из раздела «Страховка»" }];
      save("docs.v1", l);
    }
    return l.slice().sort(function (a, b) { return (a.until || "9") < (b.until || "9") ? -1 : 1; });
  }
  function schedule(d) {
    var D = window.AutoHubDevice; if (!D) return;
    var id = hash(d.id); D.cancel(id);
    if (!d.until) return;
    var at = new Date(d.until + "T10:00:00"); at.setDate(at.getDate() - (d.remind || 30));
    if (at > new Date()) D.schedule(id, at, "Скоро истекает: " + d.title, "Срок — до " + dLong(d.until) + ". Продлите заранее, чтобы не было штрафа.");
  }
  function status(n) { return n == null ? ["none", "добавьте срок"] : n < 0 ? ["over", human(n)] : n <= 30 ? ["soon", human(n)] : ["ok", human(n)]; }

  function render() {
    var body = $("dcBody"); if (!body) return;
    var l = list(), soonN = l.filter(function (d) { var n = d.until ? daysLeft(d.until) : null; return n != null && n <= 30; }).length;
    var html = soonN ? '<div class="dl-card static"><span class="dl-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg></span><span class="dl-t"><b>' + soonN + " " + plural(soonN, "срок", "срока", "сроков") + ' в ближайший месяц</b><span>Аптечку и огнетушитель можно купить в запчастях с доставкой</span></span></div>' : "";
    html += l.length ? '<div class="kv">' + l.map(function (d) {
      var n = d.until ? daysLeft(d.until) : null, st = status(n);
      return '<button class="dc-row" data-doc="' + d.id + '" data-action="edit"><span class="dc-ic ' + st[0] + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/></svg></span>' +
        '<span class="dc-t"><b>' + esc(d.title) + "</b><small>" + (d.until ? "до " + dLong(d.until) : "дата не указана") + " · напомним за " + d.remind + " " + plural(d.remind, "день", "дня", "дней") + (d.note ? " · " + esc(d.note) : "") + '</small></span><b class="dc-s ' + st[0] + '">' + st[1] + "</b></button>";
    }).join("") + "</div>" : '<div class="pk-empty"><b>Сроков пока нет</b><span>Добавьте аптечку, огнетушитель, права — напомним заранее.</span></div>';
    html += '<div class="to-note">Сроки хранятся на телефоне. Напоминание придёт уведомлением в 10:00, даже если приложение закрыто.</div>';
    body.innerHTML = html;
  }

  function sheet(doc) {
    var d = doc ? JSON.parse(JSON.stringify(doc)) : { id: "d" + Date.now().toString(36), title: "", until: "", remind: 30 };
    var isNew = !doc, kind = isNew ? "Аптечка" : (KINDS.some(function (k) { return k[0] === d.title; }) ? d.title : "Другое");
    UI.sheet({ title: isNew ? "Новый срок" : d.title,
      html: (isNew ? '<div class="pk-timers">' + KINDS.map(function (k) { return '<button data-kind="' + k[0] + '" data-action="k" class="' + (k[0] === kind ? "on" : "") + '">' + k[0] + "</button>"; }).join("") + "</div>" : "") +
        '<label class="fld" id="dcTitleWrap"' + (kind === "Другое" ? "" : " hidden") + '>Название<input id="dcTitle" value="' + esc(kind === "Другое" ? d.title : "") + '" placeholder="Например, пропуск на парковку" autocomplete="off"></label>' +
        '<label class="fld">Действует до<input id="dcDate" type="date" value="' + (d.until || "") + '"></label>' +
        '<div class="to-sec">НАПОМНИТЬ ЗА</div><div class="pk-timers">' + [7, 14, 30, 60].map(function (n) { return '<button data-rem="' + n + '" data-action="r" class="' + (d.remind === n ? "on" : "") + '">' + n + " дн.</button>"; }).join("") + "</div>" +
        '<span id="dcErr" class="err" hidden></span><button class="btn-accent" data-action="save">Сохранить</button>' + (isNew ? "" : '<button class="linkbtn" data-action="del" style="align-self:center">Удалить</button>'),
      onMount: function (b) {
        b.addEventListener("click", function (e) {
          var k = e.target.closest("[data-kind]");
          if (k) { kind = k.dataset.kind; b.querySelectorAll("[data-kind]").forEach(function (x) { x.classList.toggle("on", x === k); }); b.querySelector("#dcTitleWrap").hidden = kind !== "Другое";
            var def = KINDS.filter(function (x) { return x[0] === kind; })[0]; d.remind = def[1]; b.querySelectorAll("[data-rem]").forEach(function (x) { x.classList.toggle("on", +x.dataset.rem === d.remind); }); return; }
          var r = e.target.closest("[data-rem]");
          if (r) { d.remind = +r.dataset.rem; b.querySelectorAll("[data-rem]").forEach(function (x) { x.classList.toggle("on", x === r); }); return; }
          if (e.target.closest("[data-action=del]")) {
            save("docs.v1", list().filter(function (x) { return x.id !== d.id; })); window.AutoHubDevice.cancel(hash(d.id));
            UI.close(function () { render(); UI.toast("Срок удалён"); }); return;
          }
          if (!e.target.closest("[data-action=save]")) return;
          d.title = kind === "Другое" ? b.querySelector("#dcTitle").value.trim() : (isNew ? kind : d.title);
          d.until = b.querySelector("#dcDate").value;
          var err = !d.title ? "Напишите название." : !d.until ? "Укажите дату окончания." : "";
          if (err) { var er = b.querySelector("#dcErr"); er.textContent = err; er.hidden = false; return; }
          delete d.note;
          var l = list().filter(function (x) { return x.id !== d.id; }); l.push(d); save("docs.v1", l); schedule(d);
          UI.close(function () { render(); UI.toast("Напомним за " + d.remind + " дн. до окончания"); });
        });
      } });
  }

  /** Сроки в ближайшие 30 дней (для карточки в гараже). */
  function soon() {
    var l = list().filter(function (d) { return d.until; }).map(function (d) { return { title: d.title, days: daysLeft(d.until) }; })
      .filter(function (d) { return d.days <= 30; }).sort(function (a, b) { return a.days - b.days; });
    return { first: l[0] || null, more: Math.max(0, l.length - 1) };
  }

  function init() {
    var scr = $("s-Docs"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      if (e.target.closest("[data-action=add]")) { sheet(null); return; }
      var r = e.target.closest("[data-doc]"); if (r) sheet(list().filter(function (x) { return x.id === r.dataset.doc; })[0]);
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Docs") render(); });
    render();
  }
  window.AutoHubDocs = { init: init, soon: soon, human: human };
})();
