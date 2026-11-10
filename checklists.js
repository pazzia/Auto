/* АвтоХаб: AUTO-17 «Чек-листы поездок и сезонов». Отметки сохраняются до сброса. Без интернета. */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var LISTS = [
    { id: "trip", name: "Дальняя дорога", title: "Перед дальней дорогой", groups: [
      ["ДОКУМЕНТЫ", ["Права и СТС", "Полис ОСАГО (электронный — в телефоне)"]],
      ["МАШИНА", ["Уровень масла", "Омывающая жидкость", "Давление в шинах, включая запаску", "Запаска, домкрат и баллонный ключ", "Все фары и поворотники работают"]],
      ["В САЛОНЕ", ["Аптечка, знак аварийной остановки, огнетушитель", "Зарядка для телефона", "Вода и перекус"]]] },
    { id: "winter", name: "К зиме", title: "Подготовка к зиме", groups: [
      ["ШИНЫ И ЖИДКОСТИ", ["Зимние шины (глубина протектора не меньше 4 мм)", "Незамерзающая омывайка", "Антифриз — уровень в норме"]],
      ["ЭЛЕКТРИКА", ["Аккумулятор проверен", "Щётки стеклоочистителя без полос"]],
      ["ЗИМНИЙ НАБОР", ["Щётка-скребок", "Провода для прикуривания", "Трос", "Незамерзайка для замков"]]] },
    { id: "used", name: "Осмотр б/у", title: "Осмотр б/у машины при покупке", groups: [
      ["ДОКУМЕНТЫ", ["VIN в документах совпадает с машиной", "Продавец — собственник по документам", "Проверка по VIN: ДТП, залоги, ограничения"]],
      ["КУЗОВ", ["Одинаковые зазоры между деталями", "Нет следов перекраса и ржавчины", "Все стёкла с одинаковой маркировкой"]],
      ["ТЕХНИКА", ["Двигатель заводится на холодную без стука", "Нет ошибок на панели после запуска", "Тормоза без биения и увода", "Осмотр в сервисе перед покупкой"]]] },
    { id: "summer", name: "К лету", title: "Подготовка к лету", groups: [
      ["ШИНЫ", ["Летние шины — протектор не меньше 1,6 мм", "Давление по табличке"]],
      ["КОМФОРТ", ["Кондиционер холодит", "Салонный фильтр заменён", "Летняя омывайка"]],
      ["КУЗОВ", ["Мойка днища после зимы", "Сколы на кузове закрашены"]]] }
  ];
  var cur = "trip";
  function load() { try { return JSON.parse(localStorage.getItem("autohub.checklists.v1") || "{}"); } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem("autohub.checklists.v1", JSON.stringify(v)); } catch (e) {} }
  function items(l) { var a = []; l.groups.forEach(function (g, gi) { g[1].forEach(function (t, i) { a.push(gi + "-" + i); }); }); return a; }

  function render() {
    var body = document.getElementById("clBody"); if (!body) return;
    var l = LISTS.filter(function (x) { return x.id === cur; })[0], st = load()[cur] || {}, all = items(l);
    var n = all.filter(function (k) { return st[k]; }).length, pct = Math.round(n / all.length * 100);
    var html = '<div class="pk-timers" role="tablist">' + LISTS.map(function (x) { return '<button role="tab" aria-selected="' + (x.id === cur) + '" data-list="' + x.id + '" data-action="l" class="' + (x.id === cur ? "on" : "") + '">' + x.name + "</button>"; }).join("") + "</div>" +
      '<div class="to-card"><div class="to-row" style="gap:8px"><b>' + esc(l.title) + '</b><b style="color:#0F6B3A">' + n + " из " + all.length + '</b></div><div class="to-bar"><div style="width:' + pct + '%;background:#0F6B3A"></div></div>' +
      (n === all.length ? '<span class="to-p" style="color:#0F6B3A;font-weight:700">Всё готово — хорошей дороги!</span>' : "") + "</div>";
    l.groups.forEach(function (g, gi) {
      html += '<div class="to-sec">' + g[0] + '</div><div class="kv">' + g[1].map(function (t, i) {
        var k = gi + "-" + i, on = !!st[k];
        return '<label class="sn-task"><input type="checkbox" data-item="' + k + '"' + (on ? " checked" : "") + '><span class="' + (on ? "done" : "") + '"><b>' + esc(t) + "</b></span></label>";
      }).join("") + "</div>";
    });
    body.innerHTML = html;
  }
  function init() {
    var scr = document.getElementById("s-Checklists"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      var t = e.target.closest("[data-list]"); if (t) { cur = t.dataset.list; render(); return; }
      if (e.target.closest("[data-action=reset]")) { var s = load(); delete s[cur]; save(s); render(); UI.toast("Отметки сброшены"); }
    });
    scr.addEventListener("change", function (e) {
      var c = e.target.closest("[data-item]"); if (!c) return;
      var s = load(); s[cur] = s[cur] || {}; s[cur][c.dataset.item] = c.checked; save(s);
      var l = LISTS.filter(function (x) { return x.id === cur; })[0];
      if (items(l).every(function (k) { return s[cur][k]; })) { UI.track("checklist_done", cur); UI.toast("Чек-лист пройден целиком!"); }
      render();
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Checklists") render(); });
    render();
  }
  window.AutoHubChecklists = { init: init };
})();
