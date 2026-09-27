/* АвтоХаб: AUTO-20 «Фото-состояние кузова».
 * Шесть кадров по шаблону (спереди, сзади, слева, справа, салон, одометр) с датой, временем и городом —
 * доказательство при спорах после сервиса, мойки или аренды. Камера — через нативный мост (AUTO-2).
 * Хранятся 3 последние съёмки, чтобы хватило памяти телефона.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var SHOTS = [
    ["front", "Спереди", '<rect x="18" y="22" width="64" height="30" rx="8"/><path d="M26 22l6-12h36l6 12"/><circle cx="30" cy="38" r="5"/><circle cx="70" cy="38" r="5"/><path d="M40 44h20"/>'],
    ["back", "Сзади", '<rect x="18" y="22" width="64" height="30" rx="8"/><path d="M26 22l6-12h36l6 12"/><path d="M24 34h12M64 34h12"/><rect x="40" y="38" width="20" height="8" rx="2"/>'],
    ["left", "Слева", '<path d="M8 40v-8l10-4 12-12h30l14 12 16 4v8z"/><circle cx="28" cy="42" r="7"/><circle cx="76" cy="42" r="7"/>'],
    ["right", "Справа", '<path d="M92 40v-8l-10-4-12-12H40L26 28l-16 4v8z"/><circle cx="72" cy="42" r="7"/><circle cx="24" cy="42" r="7"/>'],
    ["inside", "Салон", '<rect x="22" y="12" width="56" height="36" rx="6"/><circle cx="50" cy="30" r="10"/><path d="M40 30h20M50 20v20"/>'],
    ["odo", "Одометр", '<path d="M20 44a30 30 0 1 1 60 0"/><path d="M50 44l14-16"/><rect x="36" y="30" width="28" height="9" rx="2"/>']
  ];
  var PURPOSES = ["Перед сервисом", "Перед мойкой", "Перед арендой", "Другое"];
  var MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var purpose = "Перед сервисом";
  function load() { try { return JSON.parse(localStorage.getItem("autohub.bodyphoto.v1") || "[]"); } catch (e) { return []; } }
  function save(v) { try { localStorage.setItem("autohub.bodyphoto.v1", JSON.stringify(v)); return true; } catch (e) { UI.toast("Не хватает памяти телефона — удалите старую съёмку"); return false; } }
  function $(id) { return document.getElementById(id); }
  function stamp(t) { var d = new Date(t); return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() + ", " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function outline(path) { return '<svg viewBox="0 0 100 56" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>"; }
  function active() { var s = load(); return s.filter(function (x) { return !x.done; })[0] || null; }

  function render() {
    var body = $("bpBody"), foot = $("bpFoot"); if (!body) return;
    var a = active(), sets = load().filter(function (x) { return x.done; });
    if (!a) {
      body.innerHTML = '<div class="to-note" style="font-size:14px">Сфотографируйте машину по шаблону перед сервисом, мойкой или арендой. На каждом кадре — дата, время и место: если появится царапина, будет чем доказать.</div>' +
        '<div class="to-sec">ДЛЯ ЧЕГО СЪЁМКА</div><div class="pk-timers">' + PURPOSES.map(function (p) { return '<button data-purpose="' + p + '" data-action="p" class="' + (p === purpose ? "on" : "") + '">' + p + "</button>"; }).join("") + "</div>" +
        (sets.length ? '<div class="to-sec">ПРОШЛЫЕ СЪЁМКИ</div><div class="kv">' + sets.map(function (s) {
          return '<button class="dc-row" data-set="' + s.id + '" data-action="open"><span class="dc-t"><b>' + esc(s.purpose) + "</b><small>" + stamp(s.at) + " · " + esc(s.place) + '</small></span><b class="dc-s ok">' + Object.keys(s.shots).length + " фото</b></button>";
        }).join("") + "</div>" : "");
      foot.hidden = false; foot.innerHTML = '<button class="btn-accent" data-action="start">Начать съёмку · 6 кадров</button>';
      return;
    }
    var n = Object.keys(a.shots).length, next = SHOTS.filter(function (s) { return !a.shots[s[0]]; })[0];
    body.innerHTML = '<div class="to-card to-row"><div><b>' + esc(a.purpose) + '</b><span class="mono">' + stamp(a.at) + " · " + esc(a.place) + '</span></div><b style="color:#C2410C">' + n + " из 6</b></div>" +
      '<div class="bp-grid">' + SHOTS.map(function (s) {
        var img = a.shots[s[0]], now = next && next[0] === s[0];
        if (img) return '<button class="bp-slot done" data-shot="' + s[0] + '" data-action="shot" aria-label="' + s[1] + ': переснять"><img src="' + img + '" alt=""><span>' + s[1] + " ✓</span></button>";
        return '<button class="bp-slot' + (now ? " now" : "") + '" data-shot="' + s[0] + '" data-action="shot">' + outline(s[2]) + "<span>" + s[1] + (now ? " — снять" : "") + "</span></button>";
      }).join("") + "</div>" +
      '<button class="linkbtn" data-action="cancel" style="align-self:center">Отменить съёмку</button>';
    foot.hidden = false;
    foot.innerHTML = next ? '<button class="btn-accent" data-shot="' + next[0] + '" data-action="shot">Снять: ' + next[1].toLowerCase() + " · " + (n + 1) + " из 6</button>" : '<button class="btn-dark" data-action="finish">Сохранить съёмку</button>';
  }
  function shoot(key) {
    window.AutoHubDevice.takePhoto().then(function (d) {
      if (!d) return;
      var sets = load(), a = sets.filter(function (x) { return !x.done; })[0]; if (!a) return;
      a.shots[key] = d; if (save(sets)) render();
    });
  }
  function gallery(id) {
    var s = load().filter(function (x) { return x.id === id; })[0]; if (!s) return;
    UI.sheet({ title: s.purpose + " · " + stamp(s.at),
      html: '<div class="bp-grid">' + SHOTS.filter(function (x) { return s.shots[x[0]]; }).map(function (x) {
        return '<div class="bp-slot done"><img src="' + s.shots[x[0]] + '" alt="' + x[1] + '"><span>' + x[1] + "</span></div>"; }).join("") + "</div>" +
        '<p class="ic-note">' + esc(s.place) + " · " + stamp(s.at) + '</p><button class="linkbtn" data-action="del" style="align-self:center">Удалить съёмку</button>',
      onMount: function (b) { b.querySelector("[data-action=del]").addEventListener("click", function () {
        if (!window.confirm("Удалить эту съёмку?")) return;
        save(load().filter(function (x) { return x.id !== id; })); UI.close(render);
      }); } });
  }
  function init() {
    var scr = $("s-BodyPhoto"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      var p = e.target.closest("[data-purpose]"); if (p) { purpose = p.dataset.purpose; render(); return; }
      var sh = e.target.closest("[data-shot]"); if (sh) { shoot(sh.dataset.shot); return; }
      var o = e.target.closest("[data-set]"); if (o) { gallery(o.dataset.set); return; }
      var a = e.target.closest("[data-action]"); if (!a) return;
      if (a.dataset.action === "start") {
        var place = window.AutoHubAuth ? window.AutoHubAuth.location().city : "";
        var sets = load().filter(function (x) { return x.done; }).slice(-2); // вместе с новой — не больше трёх
        sets.push({ id: "b" + Date.now().toString(36), at: Date.now(), purpose: purpose, place: place, shots: {}, done: false });
        if (save(sets)) render();
      }
      if (a.dataset.action === "cancel" && window.confirm("Отменить съёмку? Снятые кадры удалятся.")) { save(load().filter(function (x) { return x.done; })); render(); }
      if (a.dataset.action === "finish") {
        var all = load(), cur = all.filter(function (x) { return !x.done; })[0]; cur.done = true; save(all);
        UI.track("photos_done", cur.id); UI.toast("Съёмка сохранена"); render();
      }
    });
    window.addEventListener("hashchange", function () {
      if (location.hash === "#BodyPhoto") { var pre = sessionStorage.getItem("autohub.photoPurpose"); if (pre) { purpose = pre; sessionStorage.removeItem("autohub.photoPurpose"); } render(); }
    });
    render();
  }
  window.AutoHubBodyPhoto = { init: init };
})();
