/* АвтоХаб: AUTO-16 «Сделай сам за 5 минут». Пошаговые инструкции без интернета.
 * Только безопасные операции; тормоза, подушки безопасности, топливная система, ксенон — в сервис.
 * Тексты проверяет механик перед публикацией (AUTO-26).
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var DIPSTICK = '<svg viewBox="0 0 300 150" role="img" aria-label="Щуп уровня масла с отметками MIN и MAX"><circle cx="50" cy="48" r="20" fill="none" stroke="#E8A317" stroke-width="10"/><path d="M50 68v12" stroke="#E8A317" stroke-width="10" stroke-linecap="round"/><path d="M50 80h212" stroke="#17191C" stroke-width="6" stroke-linecap="round"/><path d="M198 80h52" stroke="#8A6A2F" stroke-width="10" stroke-linecap="round"/><path d="M204 66v28M246 66v28" stroke="#C2410C" stroke-width="3"/><text x="204" y="112" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="13" fill="#17191C">MIN</text><text x="246" y="112" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="13" fill="#17191C">MAX</text><text x="225" y="138" text-anchor="middle" font-family="Manrope, sans-serif" font-size="13" font-weight="700" fill="#0F6B3A">между метками — норма</text></svg>';
  var ICON = {
    drop: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5z"/>',
    washer: '<path d="M3 18c2.5-6 15.5-6 18 0"/><path d="M12 13V8M12 13c.5-3 2.5-5 5-6M12 13c-.5-3-2.5-5-5-6"/>',
    tire: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    bulb: '<path d="M9 17h6M10 20h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3z"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    wiper: '<path d="M3 18c2.5-6 15.5-6 18 0"/><path d="M12 18l6-9"/>'
  };
  // id, название, категория, сложность, время, что нужно, иконка, шаги [текст, подсказка, картинка]
  var GUIDES = [
    { id: "oil", title: "Проверить уровень масла", cat: "Жидкости", level: "Легко", time: "5 минут", need: "нужна тряпка", icon: "drop", parts: "масло", steps: [
      ["Поставьте машину на ровное место и заглушите двигатель. Подождите 5–10 минут, чтобы масло стекло вниз.", "На горячем двигателе осторожно: детали под капотом горячие."],
      ["Откройте капот: рычаг обычно слева внизу под рулём, затем защёлка под передним краем капота. Зафиксируйте капот упором.", ""],
      ["Найдите щуп — ручку, обычно жёлтую или оранжевую, часто с символом масленки. Выньте, протрите тряпкой и вставьте обратно до упора.", "", DIPSTICK],
      ["Снова выньте щуп и посмотрите на след масла: он должен быть между метками MIN и MAX.", "Масло очень тёмное или пахнет гарью — скажите об этом на ближайшем ТО."],
      ["Ниже MIN — долейте масло той же марки через горловину с символом масленки. Понемногу, по 200–300 мл, каждый раз проверяя щупом. Выше MAX не заливайте.", "Уровень быстро падает снова — запишитесь в сервис."]] },
    { id: "washer", title: "Долить омывайку", cat: "Жидкости", level: "Легко", time: "3 минуты", need: "канистра омывайки", icon: "washer", steps: [
      ["Откройте капот и найдите бачок с крышкой, на которой нарисовано стекло с фонтанчиком. Крышка обычно синяя.", "Не перепутайте с бачком антифриза или тормозной жидкости — у них другие значки."],
      ["Зимой берите незамерзающую жидкость, рассчитанную на температуру ниже, чем бывает у вас: например, до −20 °C или −30 °C.", ""],
      ["Залейте жидкость до горловины и закройте крышку.", ""],
      ["Проверьте: нажмите на подрулевой рычаг — омыватель должен брызгать на стекло.", "Жидкость есть, но не брызгает — возможно, замёрзли форсунки или перегорел моторчик."]] },
    { id: "tires", title: "Подкачать шины", cat: "Колёса", level: "Легко", time: "10 минут", need: "насос или компрессор на заправке", icon: "tire", steps: [
      ["Узнайте норму давления: она на табличке в проёме двери водителя или на лючке бензобака.", "При полной загрузке норма выше — она тоже указана на табличке."],
      ["Проверяйте на холодных шинах — до поездки или после 2–3 км спокойной езды.", ""],
      ["Открутите колпачок ниппеля и плотно прижмите наконечник манометра или насоса.", ""],
      ["Подкачайте до нормы и проверьте ещё раз манометром.", ""],
      ["Закрутите колпачок и повторите для всех колёс. Раз в сезон проверяйте и запаску.", "Давление в одном колесе снова падает за день-два — вероятно прокол, нужен шиномонтаж."]] },
    { id: "bulb", title: "Заменить лампу ближнего света", cat: "Свет", level: "Средне", time: "15 минут", need: "перчатки, новая лампа", icon: "bulb", parts: "лампа", steps: [
      ["Узнайте тип лампы: он написан в руководстве к машине или на цоколе старой лампы (например, H4 или H7).", "Ксеноновые и светодиодные фары — только в сервисе: там высокое напряжение."],
      ["Выключите фары и зажигание. Откройте капот.", ""],
      ["Найдите заднюю часть фары и снимите защитную крышку.", "Если к фаре не подобраться без снятия деталей — лучше поменять лампу в сервисе."],
      ["Отсоедините разъём, отожмите фиксатор и аккуратно выньте лампу.", ""],
      ["Новую лампу не трогайте за стекло голыми пальцами — жир с кожи сокращает её срок службы. Держите за цоколь, в перчатках.", ""],
      ["Установите лампу, фиксатор, разъём и крышку в обратном порядке. Включите фары и проверьте.", "Лампы лучше менять парой: вторая обычно скоро перегорает тоже."]] },
    { id: "jump", title: "Прикурить от другой машины", cat: "Электрика", level: "Средне", time: "10 минут", need: "провода для прикуривания", icon: "bolt", steps: [
      ["Заглушите обе машины. Проверьте свой аккумулятор: если он вздулся, треснул, подтекает или замёрз — не прикуривайте, вызовите техпомощь.", "Зажимы проводов не должны касаться друг друга."],
      ["Красный зажим — на «плюс» (+) вашего разряженного аккумулятора.", ""],
      ["Второй красный зажим — на «плюс» (+) аккумулятора машины-донора.", ""],
      ["Чёрный зажим — на «минус» (−) аккумулятора донора.", ""],
      ["Второй чёрный зажим — на неокрашенный металл двигателя вашей машины, подальше от аккумулятора.", "Так искра при подключении будет вдали от аккумулятора."],
      ["Заведите машину-донора и подождите 3–5 минут. Затем заводите свою: не дольше 10 секунд за попытку.", ""],
      ["Снимайте провода в обратном порядке: чёрный с вашей машины, чёрный с донора, красный с донора, красный с вашей. Проездите 30–40 минут, чтобы аккумулятор подзарядился.", "Не заводится после двух-трёх попыток — вызовите техпомощь."]] },
    { id: "wipers", title: "Заменить щётки стеклоочистителя", cat: "Кузов", level: "Легко", time: "5 минут", need: "новые щётки нужной длины", icon: "wiper", parts: "щётки стеклоочистителя", steps: [
      ["Узнайте длину щёток: в руководстве к машине или по старой щётке. Водительская обычно длиннее пассажирской.", ""],
      ["Отведите поводок от стекла. Положите на стекло сложенное полотенце — если поводок сорвётся, он не ударит по стеклу.", ""],
      ["Нажмите на фиксатор в месте крепления и сдвиньте старую щётку вдоль поводка.", ""],
      ["Установите новую щётку до щелчка и аккуратно опустите поводок на стекло.", "Проверьте работу на мокром стекле: щётка не должна оставлять полос."]] }
  ];
  var CATS = ["Всё", "Жидкости", "Колёса", "Свет", "Электрика", "Кузов"];
  var cat = "Всё", cur = null, step = 0;
  function $(id) { return document.getElementById(id); }
  function icon(k, c) { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="' + (c || "currentColor") + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>"; }
  function done() { return (UI.events().diy_done || { ids: {} }).ids; }

  function renderList() {
    $("dyH1").textContent = "Сделай сам за 5 минут"; $("dySub").textContent = "пошагово, с картинками, без интернета"; $("dyFoot").hidden = true;
    var d = done();
    $("dyBody").innerHTML = '<div class="pk-timers">' + CATS.map(function (c) { return '<button data-cat="' + c + '" data-action="c" class="' + (c === cat ? "on" : "") + '">' + c + "</button>"; }).join("") + "</div>" +
      '<div class="kv">' + GUIDES.filter(function (g) { return cat === "Всё" || g.cat === cat; }).map(function (g) {
        return '<a class="dy-row" href="#DIY/' + g.id + '"><span class="dy-ic">' + icon(g.icon) + '</span><span class="dy-t"><b>' + esc(g.title) + (d[g.id] ? ' <em>✓ сделано</em>' : "") + '</b><small class="' + (g.level === "Легко" ? "easy" : "mid") + '">' + g.level + " · " + g.time + " · " + esc(g.need) + '</small></span><span class="prow-go">›</span></a>';
      }).join("") + "</div>" +
      '<div class="dy-warn"><b>Тормоза, подушки безопасности, топливную систему и ксенон — только в сервисе.</b> Здесь только то, что безопасно сделать самому.</div>';
  }
  function renderStep() {
    var g = cur, s = g.steps[step], last = step === g.steps.length - 1;
    $("dyH1").textContent = g.title; $("dySub").textContent = "Шаг " + (step + 1) + " из " + g.steps.length + " · " + g.time;
    $("dyBody").innerHTML = '<div class="dy-prog">' + g.steps.map(function (_, i) { return "<i" + (i <= step ? ' class="on"' : "") + "></i>"; }).join("") + "</div>" +
      '<div class="dy-pic">' + (s[2] || '<span class="dy-num">' + (step + 1) + "</span>" + icon(g.icon, "#C2410C")) + "</div>" +
      '<p class="dy-text">' + esc(s[0]) + "</p>" + (s[1] ? '<div class="dy-tip">' + esc(s[1]) + "</div>" : "") +
      (last && g.parts ? '<button class="btn-light" data-go="parts:' + esc(g.parts) + '" data-action="go">Подобрать: ' + esc(g.parts) + "</button>" : "") +
      '<button class="linkbtn" data-action="ask" style="align-self:flex-start">Не получается? Спросить AI-механика</button>';
    var f = $("dyFoot"); f.hidden = false;
    f.innerHTML = '<div class="tc-btns"><button class="btn-light" data-action="prev" style="height:54px">' + (step ? "Назад" : "К списку") + '</button><button class="btn-accent" data-action="next">' + (last ? "Готово" : "Дальше") + "</button></div>";
    $("dyBody").scrollTop = 0;
  }
  function route() {
    var m = /^#DIY\/(\w+)/.exec(location.hash);
    var g = m && GUIDES.filter(function (x) { return x.id === m[1]; })[0];
    if (g) { if (cur !== g) { cur = g; step = 0; } renderStep(); } else { cur = null; renderList(); }
  }
  function init() {
    var scr = $("s-DIY"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cat]"); if (c) { cat = c.dataset.cat; renderList(); return; }
      var a = e.target.closest("[data-action]"); if (!a || !cur) return;
      switch (a.dataset.action) {
        case "prev": if (step) { step--; renderStep(); } else location.hash = "#DIY"; break;
        case "next":
          if (step < cur.steps.length - 1) { step++; renderStep(); }
          else { UI.track("diy_done", cur.id); UI.toast("Отлично, сделано своими руками!"); location.hash = "#DIY"; }
          break;
        case "ask": if (window.AutoHubMechanic) window.AutoHubMechanic.ask(cur.title + ": не получается, шаг " + (step + 1)); break;
        case "go": if (window.AutoHubIcons) window.AutoHubIcons.go(a.dataset.go); break;
      }
    });
    window.addEventListener("hashchange", function () { if (location.hash.indexOf("#DIY") === 0) route(); });
    route();
  }
  window.AutoHubDIY = { init: init, guides: function () { return GUIDES; } };
})();
