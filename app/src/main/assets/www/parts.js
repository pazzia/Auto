/* АвтоХаб: запчасти — поиск, результаты, цены продавцов, сравнение.
 * Экраны свёрстаны в макете; здесь их содержимое пересобирается из AutoHubApi.parts (заглушка в режиме mock).
 */
(function () {
  "use strict";

  var API = window.AutoHubApi, UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var ACC = "#C2410C";
  var st = {
    query: "масляный фильтр", cat: null, kit: false,
    sortDesc: false, stock: false, fast: false, orig: false,
    items: [], compare: ["p-hk-26300", "p-mann-w811"], partId: "p-mann-w811", offerSort: "total", watch: {}, onlyDiff: false
  };
  function rub(n) { return Number(n).toLocaleString("ru-RU") + " ₽"; }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
  function root(n) { var s = document.getElementById("s-" + n); return s && s.firstElementChild; }
  function carName() { var c = window.AutoHubCar && window.AutoHubCar.active(); return c ? [c.make, c.model].filter(Boolean).join(" ") : "ваш автомобиль"; }
  function chipStyle(b, on) {
    b.style.background = on ? "#17191C" : "#FFFFFF"; b.style.color = on ? "#FFFFFF" : "#17191C";
    b.style.border = on ? "none" : "1px solid #E2DED6"; b.setAttribute("aria-pressed", String(on));
  }
  function whenText(d) { return d === 0 ? "сегодня" : d === 1 ? "завтра" : d + " " + plural(d, "день", "дня", "дней"); }

  /* ================= Главная «Запчасти» ================= */
  function initMain() {
    var r = root("Main"); if (!r) return;
    var q = r.querySelector("#q");
    function go(opts) {
      st.query = opts.query != null ? opts.query : ""; st.cat = opts.cat || null; st.kit = !!opts.kit;
      st.stock = st.fast = st.orig = false; // новый поиск — фильтры сначала
      location.hash = "#Results";
    }
    q.setAttribute("enterkeyhint", "search");
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); q.blur(); go({ query: q.value.trim() }); } });
    // Иконка лупы — тоже поиск
    var box = q.parentNode; box.style.cursor = "text";
    box.firstElementChild.addEventListener("click", function () { go({ query: q.value.trim() }); });
    var cats = { "Фильтры": "filters", "Тормоза": "brakes", "Подвеска": "suspension", "Масла": "oils", "Электрика": "electrics", "Все": "" };
    r.querySelectorAll("button").forEach(function (b) {
      var t = b.textContent.trim();
      if (t in cats) { b.dataset.action = "cat"; b.addEventListener("click", function () { go({ cat: cats[t] }); }); }
      if (b.getAttribute("aria-label") === "Сканировать артикул") {
        b.dataset.action = "scan";
        b.addEventListener("click", function () {
          UI.sheet({ title: "Сканер артикула",
            html: '<div class="scanbox"><div class="scanframe"></div><span>Наведите камеру на штрихкод или артикул на упаковке</span></div>' +
              '<p class="sheet-text">Камера в прототипе не подключена — можно сымитировать скан.</p>' +
              '<button class="btn-dark" data-action="fake-scan">Сымитировать скан · W 811/80</button>',
            onMount: function (body) {
              body.querySelector("[data-action=fake-scan]").addEventListener("click", function () {
                UI.close(function () { q.value = "W 811/80"; go({ query: "W 811/80" }); });
              });
            } });
        });
      }
    });
    var kit = r.querySelector('a[href="#Results"]');
    if (kit) kit.addEventListener("click", function () { st.kit = true; st.cat = null; st.query = ""; st.stock = st.fast = st.orig = false; });
  }

  /* ================= Результаты ================= */
  var res = {};
  function initResults() {
    var r = root("Results"); if (!r) return;
    var head = r.children[0];
    res.title = head.children[0].children[1];
    res.chips = head.children[1].querySelectorAll("button");
    res.count = head.children[2];
    res.list = r.children[1];
    res.bar = r.children[2];
    var keys = ["sort", "stock", "fast", "orig"];
    res.chips.forEach(function (b, i) {
      b.dataset.action = "chip";
      b.addEventListener("click", function () {
        var k = keys[i];
        if (k === "sort") st.sortDesc = !st.sortDesc; else st[k] = !st[k];
        renderResults();
      });
    });
    res.list.addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-cmp]"); if (!cb) return;
      var id = cb.dataset.cmp, i = st.compare.indexOf(id);
      if (cb.checked && i < 0) {
        st.compare.push(id);
        if (st.compare.length > 2) { st.compare.shift(); UI.toast("Сравниваем две детали — первую отметку сняли"); }
      } else if (!cb.checked && i >= 0) st.compare.splice(i, 1);
      drawResults();
    });
    res.list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-offers]"); if (a) st.partId = a.dataset.offers;
    });
    var cmp = res.bar.querySelector('a[href="#Compare"]');
    cmp.addEventListener("click", function (e) {
      if (st.compare.length < 2) { e.preventDefault(); UI.toast("Отметьте две детали «К сравнению»"); }
    });
  }
  function load() {
    res.list.innerHTML = '<div class="loading">Ищем в каталогах магазинов…</div>';
    return API.parts.search({ query: st.query, cat: st.cat, kit: st.kit }).then(function (d) { st.items = d.items; drawResults(); });
  }
  function renderResults() {
    res.chips[0].textContent = st.sortDesc ? "Цена ↓" : "Цена ↑";
    chipStyle(res.chips[0], true);
    chipStyle(res.chips[1], st.stock); chipStyle(res.chips[2], st.fast); chipStyle(res.chips[3], st.orig);
    drawResults();
  }
  function drawResults() {
    var title = st.kit ? "Комплект к ТО" : st.cat ? API.parts.categories[st.cat] : (st.query || "Все запчасти");
    res.title.textContent = title;
    var items = st.items.filter(function (p) {
      return (!st.stock || p.days <= 1) && (!st.fast || p.days <= 2) && (!st.orig || p.original);
    }).sort(function (a, b) { return st.sortDesc ? b.priceMin - a.priceMin : a.priceMin - b.priceMin; });
    var offers = items.reduce(function (n, p) { return n + p.sellers; }, 0);
    res.count.innerHTML = items.length
      ? '<b style="color: #17191C">' + items.length + " " + plural(items.length, "деталь", "детали", "деталей") + "</b> " + plural(items.length, "подходит", "подходят", "подходят") + " к " + esc(carName()) + " · " + offers + " " + plural(offers, "предложение", "предложения", "предложений")
      : "Ничего не нашлось";
    if (!items.length) {
      res.list.innerHTML = '<div class="empty"><b>По запросу ничего нет</b><span>Попробуйте другое название или артикул, либо снимите фильтры.</span><a href="#Main" class="btn-light" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Изменить поиск</a></div>';
    } else {
      res.list.innerHTML = items.map(function (p) {
        var on = st.compare.indexOf(p.id) >= 0;
        return '<div style="background: #FFFFFF; border: ' + (on ? "1.5px solid " + ACC : "1px solid #E2DED6") + '; border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 12px">' +
          '<div style="display: flex; gap: 12px"><div class="photo">' + esc(p.brand.split(/[\s/-]/)[0]) + '</div>' +
          '<div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">' +
          '<div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap"><span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: ' + (p.original ? "#17191C; color: #FFFFFF" : "#EDEAE3; color: #17191C") + '">' + (p.original ? "ОРИГИНАЛ" : "АНАЛОГ") + '</span><span style="font-family: \'JetBrains Mono\', monospace; font-size: 12px; color: #5B5F66">' + esc(p.article) + "</span></div>" +
          '<div style="font-weight: 700; font-size: 15px; line-height: 1.3">' + esc(p.name + " " + p.brand) + "</div>" +
          '<div style="font-size: 12px; color: #0F6B3A; font-weight: 600">✓ Подходит к ' + esc(carName()) + " · " + whenText(p.days) + "</div></div></div>" +
          '<div style="display: flex; align-items: flex-end; justify-content: space-between">' +
          '<div><div style="font-size: 12px; color: #5B5F66">' + p.sellers + " " + plural(p.sellers, "продавец", "продавца", "продавцов") + '</div><div style="font-size: 20px; font-weight: 700">' + p.priceMin.toLocaleString("ru-RU") + " – " + rub(p.priceMax) + "</div></div>" +
          '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; min-height: 44px"><input type="checkbox" data-cmp="' + p.id + '"' + (on ? " checked" : "") + ' style="width: 20px; height: 20px; accent-color: ' + ACC + '">К сравнению</label></div>' +
          '<a href="#Offers" data-offers="' + p.id + '" style="height: 44px; border-radius: 12px; background: #F3F1EC; color: #17191C; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; text-decoration: none">Сравнить цены продавцов</a></div>';
      }).join("");
    }
    var n = st.compare.length, bar = res.bar.querySelector("span");
    if (bar) bar.textContent = n + " " + plural(n, "деталь выбрана", "детали выбрано", "деталей выбрано");
    var a = res.bar.querySelector('a[href="#Compare"]');
    if (a) a.style.opacity = n < 2 ? ".5" : "1";
  }

  /* ================= Цены продавцов ================= */
  var off = {};
  function initOffers() {
    var r = root("Offers"); if (!r) return;
    off.watch = r.querySelector('button[aria-label="Следить за ценой"]');
    off.head = r.children[1];
    off.sum = r.children[2];
    off.sorts = r.children[3].querySelectorAll("button");
    off.list = r.children[4];
    off.watch.dataset.action = "watch";
    off.watch.addEventListener("click", function () {
      st.watch[st.partId] = !st.watch[st.partId];
      drawWatch();
      UI.toast(st.watch[st.partId] ? "Сообщим, когда цена снизится" : "Больше не следим за ценой");
    });
    var modes = ["total", "fast", "rel"];
    off.sorts.forEach(function (b, i) {
      b.dataset.action = "sort"; b.style.padding = "0 6px"; b.style.whiteSpace = "nowrap";
      b.addEventListener("click", function () { st.offerSort = modes[i]; drawOffers(); });
    });
    off.list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-buy]"); if (!b) return;
      e.preventDefault();
      window.AutoHubCart.addPart(st.partId, b.dataset.buy);
      b.textContent = "✓ В корзине";
    });
  }
  function drawWatch() {
    var on = !!st.watch[st.partId];
    off.watch.lastChild.textContent = on ? "Слежу за ценой" : "Следить за ценой";
    off.watch.style.borderColor = on ? ACC : "#E2DED6"; off.watch.style.color = on ? ACC : "#17191C";
  }
  var offData = null;
  function loadOffers() {
    off.list.innerHTML = '<div class="loading">Собираем цены продавцов…</div>';
    return API.parts.offers(st.partId).then(function (d) { offData = d; drawOffers(); });
  }
  function drawOffers() {
    if (!offData) return;
    var p = offData.part, o = offData.offers.slice();
    off.head.children[0].textContent = p.brand + " · " + p.article;
    off.head.children[1].textContent = p.name;
    var totals = o.map(function (x) { return x.total; }), best = Math.min.apply(null, totals), worst = Math.max.apply(null, totals);
    var vals = off.sum.firstElementChild.children;
    vals[0].lastElementChild.textContent = rub(best); vals[1].lastElementChild.textContent = rub(worst); vals[2].lastElementChild.textContent = rub(worst - best);
    off.sum.lastElementChild.textContent = "Цены с доставкой до: Красногорск, [адрес] · демо";
    var modes = ["total", "fast", "rel"];
    off.sorts.forEach(function (b, i) {
      var on = modes[i] === st.offerSort;
      b.style.background = on ? "#FFFFFF" : "transparent"; b.style.border = on ? "1.5px solid #17191C" : "1px solid #E2DED6";
      b.style.color = on ? "#17191C" : "#5B5F66"; b.style.fontWeight = on ? "700" : "600";
    });
    o.sort(function (a, b) {
      if (st.offerSort === "fast") return a.days - b.days || a.total - b.total;
      if (st.offerSort === "rel") return b.reliability - a.reliability || a.total - b.total;
      return a.total - b.total;
    });
    var cheapestTag = Math.min.apply(null, o.map(function (x) { return x.price; }));
    var inCart = function () { return false; };
    off.list.innerHTML = o.map(function (x, i) {
      var top = i === 0, relColor = x.reliability >= 90 ? "#0F6B3A" : "#9A3412";
      var badge = top ? (st.offerSort === "fast" ? "БЫСТРЕЕ ВСЕГО" : st.offerSort === "rel" ? "НАДЁЖНЕЕ ВСЕГО" : "ЛУЧШИЙ ИТОГ") : "";
      var note = x.price === cheapestTag && x.total !== best ? "Самый низкий ценник, но с доставкой дороже на " + rub(x.total - best) : x.reliability < 80 ? "Часто отменяет заказы — берите, если не спешите" : "";
      return '<div style="background: #FFFFFF; border: ' + (top ? "1.5px solid " + ACC : "1px solid #E2DED6") + '; border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px">' +
        (badge ? '<div style="display: flex; justify-content: space-between; align-items: center"><span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; background: ' + ACC + '; color: #FFFFFF">' + badge + "</span></div>" : "") +
        '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px">' +
        '<div style="display: flex; flex-direction: column; gap: 3px"><span style="font-weight: 700; font-size: 16px">' + esc(x.sellerName) + '</span><span style="font-size: 13px; color: #5B5F66">' + esc(x.stock) + " · " + whenText(x.days) + '</span><span style="font-size: 12px; font-weight: 700; color: ' + relColor + '">Надёжность ' + x.reliability + "%</span></div>" +
        '<div style="text-align: right; flex-shrink: 0"><div style="font-size: 20px; font-weight: 700">' + rub(x.total) + '</div><div style="font-size: 12px; color: #5B5F66">' + rub(x.price) + " + доставка " + rub(x.delivery) + "</div></div></div>" +
        (note ? '<div style="font-size: 12px; color: #9A3412">' + esc(note) + "</div>" : "") +
        '<button data-buy="' + x.seller + '" data-action="buy" style="height: 40px; border-radius: 10px; border: none; font-weight: 700; font-size: 14px; background: ' + (top ? ACC + "; color: #FFFFFF" : "#F3F1EC; color: #17191C") + '">В корзину · ' + rub(x.price) + "</button></div>";
    }).join("") + '<div style="font-size: 12px; color: #5B5F66; padding: 0 4px">Надёжность — доля заказов, выполненных без отмены и возврата за 90 дней. Цены демонстрационные.</div>';
    drawWatch();
  }

  /* ================= Сравнение ================= */
  var cmp = {};
  function initCompare() {
    var r = root("Compare"); if (!r) return;
    cmp.cb = r.children[0].querySelector('input[type="checkbox"]');
    cmp.body = r.children[1];
    cmp.foot = r.children[2];
    cmp.cb.addEventListener("change", function () { st.onlyDiff = cmp.cb.checked; drawCompare(); });
    cmp.foot.addEventListener("click", function (e) { var a = e.target.closest("[data-offers]"); if (a) st.partId = a.dataset.offers; });
  }
  var cmpParts = [];
  function loadCompare() {
    var ids = st.compare.length === 2 ? st.compare : ["p-hk-26300", "p-mann-w811"];
    return Promise.all(ids.map(function (id) { return API.parts.get(id); })).then(function (ps) { cmpParts = ps; drawCompare(); });
  }
  function drawCompare() {
    if (cmpParts.length < 2) return;
    var a = cmpParts[0], b = cmpParts[1];
    var cheaper = a.priceMin <= b.priceMin ? 0 : 1;
    var G = "display: grid; grid-template-columns: 96px minmax(0, 1fr) minmax(0, 1fr); gap: 8px";
    // Строка: подпись, значения, индекс лучшего (или -1)
    function row(label, va, vb, better) {
      var same = String(va) === String(vb);
      if (st.onlyDiff && same) return "";
      function cell(v, i) {
        var win = !same && better === i;
        return '<span style="font-weight: ' + (win ? "700; color: " + ACC : "600") + '">' + esc(v) + (win ? " ✓" : "") + "</span>";
      }
      return '<div style="' + G + '; padding: 12px; border-top: 1px solid #EFECE6; align-items: center; font-size: 14px"><span style="font-size: 12px; color: #5B5F66">' + esc(label) + "</span>" + cell(va, 0) + cell(vb, 1) + "</div>";
    }
    function group(title, rows) {
      var body = rows.join("");
      if (!body) return "";
      return '<div style="background: #FFFFFF; border: 1px solid #E2DED6; border-radius: 16px; overflow: hidden"><div style="padding: 10px 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #5B5F66; background: #FAF9F6">' + title + "</div>" + body + "</div>";
    }
    var lower = function (x, y) { return x < y ? 0 : y < x ? 1 : -1; }, higher = function (x, y) { return x > y ? 0 : y > x ? 1 : -1; };
    var prices = [
      row("Мин. цена", rub(a.priceMin), rub(b.priceMin), lower(a.priceMin, b.priceMin)),
      row("Средняя цена", rub(a.avg), rub(b.avg), lower(a.avg, b.avg)),
      row("Продавцов", a.sellers, b.sellers, higher(a.sellers, b.sellers)),
      row("Быстрее всего", whenText(a.days), whenText(b.days), lower(a.days, b.days)),
      row("Рейтинг продавцов", "★ " + a.rating, "★ " + b.rating, higher(a.rating, b.rating))
    ];
    var keys = Object.keys(a.specs); Object.keys(b.specs).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var specs = [row("Совместимость", "✓ " + carName(), "✓ " + carName(), -1), row("Тип", a.original ? "оригинал" : "аналог", b.original ? "оригинал" : "аналог", -1)]
      .concat(keys.map(function (k) { return row(k, a.specs[k] || "—", b.specs[k] || "—", -1); }));
    function head(p, i) {
      var win = i === cheaper;
      return '<div style="background: #FFFFFF; border: ' + (win ? "1.5px solid " + ACC : "1px solid #E2DED6") + '; border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 6px">' +
        '<div class="photo" style="width: auto; height: 60px">' + esc(p.brand.split(/[\s/-]/)[0]) + "</div>" +
        '<span style="font-size: 10px; font-weight: 700; color: ' + (win ? ACC : "#5B5F66") + '">' + (win ? "ВЫГОДНЕЕ" : p.original ? "ОРИГИНАЛ" : "АНАЛОГ") + "</span>" +
        '<span style="font-weight: 700; font-size: 13px; line-height: 1.25">' + esc(p.brand) + "</span>" +
        '<span style="font-family: \'JetBrains Mono\', monospace; font-size: 11px; color: #5B5F66">' + esc(p.article) + "</span></div>";
    }
    var groups = group("ЦЕНЫ И ДОСТАВКА", prices) + group("ХАРАКТЕРИСТИКИ", specs);
    cmp.body.innerHTML = '<div style="' + G + '"><div></div>' + head(a, 0) + head(b, 1) + "</div>" +
      (groups || '<div class="empty"><b>Различий нет</b><span>Детали совпадают по всем параметрам. Снимите «Только различия», чтобы увидеть все строки.</span></div>');
    var links = cmp.foot.querySelectorAll("a");
    if (links.length === 2) {
      links[0].dataset.offers = a.id; links[0].textContent = "Цены " + a.brand.split("-")[0];
      links[1].dataset.offers = b.id; links[1].textContent = "Выбрать " + b.brand.split("-")[0];
    }
  }

  function onHash() {
    var h = location.hash.split("/")[0];
    if (h === "#Results" && res.list) { renderResults(); load(); }
    if (h === "#Offers" && off.list) loadOffers();
    if (h === "#Compare" && cmp.body) { cmp.cb.checked = st.onlyDiff; loadCompare(); }
  }
  function init() {
    initMain(); initResults(); initOffers(); initCompare();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("autohub:car", function () { if (location.hash === "#Results") drawResults(); });
    onHash();
  }
  window.AutoHubParts = { init: init, state: st };
})();
