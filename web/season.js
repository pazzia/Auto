/* АвтоХаб: AUTO-21 «Сезонный календарь и совет дня».
 * Дела на каждый месяц (средняя полоса России) с отметками и совет дня по сезону. Без интернета:
 * погоду не запрашиваем, советы привязаны к месяцу. Совет дня показывается в гараже.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  // [дело, подсказка, ссылка]
  var TASKS = [
    [["Мыть машину от реагентов раз в 2 недели", "особенно днище и арки", ""], ["Держать бак заполненным хотя бы наполовину", "меньше конденсата в мороз", ""], ["Проверить давление в шинах после сильных морозов", "на холоде оно падает", "#Tires"]],
    [["Помыть днище и арки от реагентов", "", ""], ["Проверить аккумулятор", "в сервисе это бесплатно на ТО", "#Services"], ["Заменить щётки, если оставляют полосы", "", "#DIY/wipers"]],
    [["Проверить протектор летних шин", "до переобувки", "#Tires"], ["Помыть машину после зимы", "осмотрите кузов на сколы", "#BodyPhoto"], ["Записаться на шиномонтаж заранее", "в апреле очереди", "#Tires"]],
    [["Переобуться, когда днём стабильно выше +5…+7 °C", "", "#Tires"], ["Заменить салонный фильтр", "весной много пыльцы", "#TO"], ["Проверить кондиционер", "до жары", "#Services"]],
    [["Залить летнюю омывайку", "", "#DIY/washer"], ["Пройти чек-лист перед дачным сезоном", "", "#Checklists"], ["Проверить кондиционер", "", "#Services"]],
    [["Проверить уровень антифриза", "на холодном двигателе", ""], ["Не оставлять детей и животных в машине", "салон нагревается очень быстро", ""], ["Проверить давление при полной загрузке", "норма на табличке в проёме двери", "#DIY/tires"]],
    [["Чек-лист перед дальней дорогой", "", "#Checklists"], ["Проверить запаску и домкрат", "", "#Checklists"], ["Проверить кондиционер", "", "#Services"]],
    [["Проверить все лампы", "темнеет раньше", "#DIY/bulb"], ["Заменить щётки стеклоочистителя", "к осенним дождям", "#DIY/wipers"], ["Проверить тормозные колодки", "", "#TO"]],
    [["Проверить фары и лампы", "", "#DIY/bulb"], ["Купить незамерзающую омывайку", "до первых заморозков", "#DIY/washer"], ["Записаться на шиномонтаж заранее", "в октябре очереди", "#Tires"]],
    [["Переобуться, когда днём стабильно ниже +5…+7 °C", "", "#Tires"], ["Залить незамерзающую омывайку", "", "#DIY/washer"], ["Проверить аккумулятор перед морозами", "", "#Services"], ["Заменить щётки стеклоочистителя", "если оставляют полосы", "#DIY/wipers"]],
    [["Собрать зимний набор", "щётка-скребок, провода для прикуривания, трос", "#Checklists"], ["Обработать уплотнители дверей силиконом", "двери не примёрзнут", ""], ["Проверить давление в шинах", "похолодало — оно падает", "#DIY/tires"]],
    [["Держать бак заполненным хотя бы наполовину", "", ""], ["Проверить омывайку: зимняя, не ниже −20 °C", "", "#DIY/washer"], ["Знать, как прикурить машину", "пошаговая инструкция", "#DIY/jump"]]
  ];
  // Советы по сезонам: [заголовок, текст, ссылка]
  var TIPS = {
    winter: [["Прогрев — в движении", "Достаточно 1–3 минут на месте, дальше плавно в движении: так двигатель прогревается мягче.", "#Mechanic"],
      ["Реагенты едят кузов", "Мойте днище и арки раз в две недели, особенно после оттепели.", "#Season"],
      ["Аккумулятор не любит мороз", "Если стартер крутит вяло — проверьте АКБ до сильных холодов.", "#DIY/jump"]],
    spring: [["Когда менять резину", "Когда днём стабильно выше +5…+7 °C и ночью без заморозков.", "#Tires"],
      ["Ямы после зимы", "После сильного удара проверьте развал-схождение: машину может уводить.", "#Mechanic"],
      ["Салонный фильтр весной", "Пыльца забивает его быстрее — замените, если в салоне пахнет.", "#TO"]],
    summer: [["Жара и антифриз", "Следите за стрелкой температуры в пробках. Растёт — остановитесь.", "#Icons/temp"],
      ["Давление при загрузке", "С полным багажником давление поднимают — норма на табличке в проёме двери.", "#DIY/tires"],
      ["Дальняя дорога", "Пройдите чек-лист — он занимает 5 минут.", "#Checklists"]],
    autumn: [["Похолодало — давление падает", "На холоде давление в шинах снижается. Проверьте и подкачайте до нормы.", "#DIY/tires"],
      ["Темнеет раньше", "Обойдите машину и проверьте все лампы — это 2 минуты.", "#DIY/bulb"],
      ["Щётки и незамерзайка", "Замените щётки, если оставляют полосы, и залейте зимнюю омывайку.", "#DIY/wipers"]]
  };
  function season(m) { return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn"; }
  function load() { try { return JSON.parse(localStorage.getItem("autohub.season.v1") || "{}"); } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem("autohub.season.v1", JSON.stringify(v)); } catch (e) {} }
  function key(y, m, i) { return y + "-" + m + "-" + i; }

  /** Совет дня для гаража. */
  function tip() {
    var now = new Date(), list = TIPS[season(now.getMonth())], day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    var t = list[day % list.length];
    return { title: t[0], text: t[1], href: t[2], label: "СОВЕТ ДНЯ · " + MONTHS[now.getMonth()].toUpperCase() };
  }

  var open = {};
  function render() {
    var body = document.getElementById("snBody"); if (!body) return;
    var now = new Date(), y = now.getFullYear(), m = now.getMonth(), done = load(), t = tip();
    var tasks = TASKS[m], n = tasks.filter(function (_, i) { return done[key(y, m, i)]; }).length;
    var html = '<a class="sn-tip" href="' + t.href + '"><span>' + t.label + "</span><b>" + esc(t.title) + "</b><small>" + esc(t.text) + "</small></a>" +
      '<div class="sn-head"><b>' + MONTHS[m] + '</b><span>' + n + " из " + tasks.length + " сделано</span></div>" +
      '<div class="kv">' + tasks.map(function (x, i) {
        var on = !!done[key(y, m, i)];
        return '<label class="sn-task"><input type="checkbox" data-task="' + i + '"' + (on ? " checked" : "") + '><span class="' + (on ? "done" : "") + '"><b>' + esc(x[0]) + "</b>" + (x[1] ? "<small>" + esc(x[1]) + "</small>" : "") + "</span>" +
          (x[2] ? '<a href="' + x[2] + '" class="sn-go" aria-label="Перейти: ' + esc(x[0]) + '">›</a>' : "") + "</label>";
      }).join("") + '</div><div class="to-sec">ДАЛЬШЕ</div>';
    for (var k = 1; k <= 3; k++) {
      var mm = (m + k) % 12, list = TASKS[mm];
      html += '<div class="kv"><button class="sn-month" data-month="' + mm + '" data-action="m" aria-expanded="' + !!open[mm] + '"><span><b>' + MONTHS[mm] + "</b><small>" + list.length + " дела · " + esc(list.map(function (x) { return x[0].split(/[,(]/)[0].toLowerCase(); }).slice(0, 2).join(", ")) + '</small></span><span class="prow-go">' + (open[mm] ? "⌃" : "›") + "</span></button>" +
        (open[mm] ? list.map(function (x) { return '<div><span>' + esc(x[0]) + (x[1] ? "<small>" + esc(x[1]) + "</small>" : "") + "</span></div>"; }).join("") : "") + "</div>";
    }
    body.innerHTML = html;
  }
  function init() {
    var scr = document.getElementById("s-Season"); if (!scr) return;
    scr.addEventListener("change", function (e) {
      var c = e.target.closest("[data-task]"); if (!c) return;
      var now = new Date(), d = load(); d[key(now.getFullYear(), now.getMonth(), c.dataset.task)] = c.checked; save(d); render();
      if (c.checked) UI.toast("Отмечено");
    });
    scr.addEventListener("click", function (e) { var b = e.target.closest("[data-month]"); if (b) { open[b.dataset.month] = !open[b.dataset.month]; render(); } });
    window.addEventListener("hashchange", function () { if (location.hash === "#Season") render(); });
    render();
  }
  window.AutoHubSeason = { init: init, tip: tip };
})();
