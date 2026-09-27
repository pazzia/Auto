/* АвтоХаб: AUTO-18 «Калькуляторы автомобилиста»: поездка (и делёж с попутчиками), транспортный налог, штраф за превышение.
 * Подставляют данные пользователя: расход и цену литра из журнала заправок (AUTO-14), мощность из данных машины. Без интернета.
 * Ставки налога и суммы штрафов — справочные, их нужно сверять с официальными источниками.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var tab = "trip", st = { dist: "", round: true, cons: "", price: "", people: 1, hp: "", months: 12, region: "mo", limit: 60, speed: "" };
  // Ставки транспортного налога, ₽ за л.с.: [до л.с. включительно, ставка]
  var RATES = {
    mo: { name: "Московская область", rows: [[100, 10], [150, 34], [200, 49], [250, 75], [99999, 150]] },
    msk: { name: "Москва", rows: [[100, 12], [125, 25], [150, 35], [175, 45], [200, 50], [225, 65], [250, 75], [99999, 150]] }
  };
  function $(id) { return document.getElementById(id); }
  function num(v) { return parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0; }
  function rub(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function f1(n) { return (Math.round(n * 10) / 10).toString().replace(".", ","); }
  function defaults() {
    var fs = window.AutoHubFuel && window.AutoHubFuel.stats(), c = window.AutoHubCar.active();
    var last = fs && fs.last;
    return { cons: fs && fs.avg ? [f1(fs.avg), "из журнала заправок"] : ["7,5", "примерно, добавьте заправки"],
      price: last ? [f1(last.sum / last.liters), "последняя заправка"] : ["57", "примерно"],
      hp: (/(\d{2,3})\s*л\.?\s*с/.exec(c.engine || "") || [])[1] || "" };
  }
  function field(id, label, val, hint, mode) {
    return '<label class="fld">' + label + '<input id="' + id + '" inputmode="' + (mode || "decimal") + '" value="' + UI.esc(val) + '" autocomplete="off">' + (hint ? '<span class="fu-hint">' + UI.esc(hint) + "</span>" : "") + "</label>";
  }
  function render() {
    var body = $("ccBody"); if (!body) return;
    var d = defaults();
    var html = '<div class="pk-timers" role="tablist">' + [["trip", "Поездка"], ["tax", "Налог"], ["fine", "Штраф"]].map(function (t) {
      return '<button role="tab" aria-selected="' + (t[0] === tab) + '" data-tab="' + t[0] + '" data-action="t" class="' + (t[0] === tab ? "on" : "") + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (tab === "trip") {
      html += field("cDist", "Расстояние в одну сторону, км", st.dist, "", "numeric") +
        '<label class="to-points"><input type="checkbox" id="cRound"' + (st.round ? " checked" : "") + '><span><b>Туда и обратно</b></span></label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + field("cCons", "Расход, л/100 км", st.cons || d.cons[0], d.cons[1]) + field("cPrice", "Цена литра, ₽", st.price || d.price[0], d.price[1]) + "</div>" +
        '<div class="cc-people"><span><b>Сколько человек едет</b><small>поделим бензин поровну</small></span><div class="qty"><button data-p="-1" data-action="p" aria-label="Меньше">−</button><span>' + st.people + '</span><button data-p="1" data-action="p" aria-label="Больше">+</button></div></div>' +
        '<div class="cc-res" id="cRes"></div>';
    } else if (tab === "tax") {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + field("cHp", "Мощность, л.с.", st.hp || d.hp, st.hp || !d.hp ? "" : "из данных машины", "numeric") + field("cMonths", "Месяцев владения", st.months, "в этом году", "numeric") + "</div>" +
        '<label class="fld">Регион регистрации<select id="cRegion">' + Object.keys(RATES).map(function (k) { return '<option value="' + k + '"' + (k === st.region ? " selected" : "") + ">" + RATES[k].name + "</option>"; }).join("") + "</select></label>" +
        '<div class="cc-res" id="cRes"></div><div class="to-note">Справочно: ставки региона могут меняться — точную сумму налоговая пришлёт в уведомлении. Для машин дороже 10 млн ₽ действует повышающий коэффициент.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + field("cLimit", "Ограничение, км/ч", st.limit, "", "numeric") + field("cSpeed", "Ваша скорость, км/ч", st.speed, "", "numeric") + "</div>" +
        '<div class="cc-res" id="cRes"></div><div class="to-note">Справочно, по статье 12.9 КоАП для штрафов с камер. Суммы могут измениться — проверяйте постановление. Скидка 50% действует при оплате в течение 20 дней, кроме повторных нарушений.</div>';
    }
    body.innerHTML = html;
    calc();
  }
  function calc() {
    var r = $("cRes"); if (!r) return;
    if (tab === "trip") {
      st.dist = $("cDist").value; st.round = $("cRound").checked; st.cons = $("cCons").value; st.price = $("cPrice").value;
      var km = num(st.dist) * (st.round ? 2 : 1), l = km * num(st.cons) / 100, cost = l * num(st.price);
      r.innerHTML = km ? "<span>Бензин на " + km.toLocaleString("ru-RU") + " км</span><b>≈ " + rub(cost) + "</b><span>" + f1(l) + " л</span>" +
        (st.people > 1 ? '<div class="cc-split"><span>Если едете ' + st.people + ' чел.</span><b>по ' + rub(cost / st.people) + " с человека</b></div>" : "")
        : "<span>Введите расстояние — посчитаем стоимость бензина</span>";
    } else if (tab === "tax") {
      st.hp = $("cHp").value; st.months = $("cMonths").value; st.region = $("cRegion").value;
      var hp = num(st.hp), m = Math.min(12, Math.max(1, num(st.months) || 12)), rows = RATES[st.region].rows;
      var rate = (rows.filter(function (x) { return hp <= x[0]; })[0] || rows[rows.length - 1])[1];
      r.innerHTML = hp ? "<span>Транспортный налог за год · " + RATES[st.region].name + "</span><b>≈ " + rub(hp * rate * m / 12) + "</b><span>" + hp + " л.с. × " + rate + " ₽" + (m < 12 ? " × " + m + "/12 мес" : "") + "</span>"
        : "<span>Укажите мощность — она есть в СТС</span>";
    } else {
      st.limit = $("cLimit").value; st.speed = $("cSpeed").value;
      var over = num(st.speed) - num(st.limit), fine = over <= 20 ? 0 : over <= 40 ? 500 : over <= 60 ? 1000 : over <= 80 ? 2000 : 5000;
      r.innerHTML = !num(st.speed) ? "<span>Введите скорость — подскажем штраф</span>"
        : over <= 20 ? "<span>Превышение " + Math.max(0, over) + " км/ч</span><b>Штрафа нет</b><span>до 20 км/ч сверх ограничения — без штрафа</span>"
        : "<span>Превышение на " + over + " км/ч</span><b>" + rub(fine) + "</b><span>со скидкой 50% — " + rub(fine / 2) + (over > 80 ? " · инспектор может лишить прав на 4–6 месяцев" : "") + "</span>";
    }
  }
  function init() {
    var scr = $("s-Calc"); if (!scr) return;
    scr.addEventListener("input", calc);
    scr.addEventListener("change", calc);
    scr.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; render(); return; }
      var p = e.target.closest("[data-p]"); if (p) { st.people = Math.max(1, Math.min(8, st.people + +p.dataset.p)); calc(); p.parentNode.querySelector("span").textContent = st.people; }
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Calc") render(); });
    render();
  }
  window.AutoHubCalc = { init: init };
})();
