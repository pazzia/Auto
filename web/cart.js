/* АвтоХаб: корзина.
 * Позиции сгруппированы по продавцам, «+» и «−» меняют количество, при нуле позиция зачёркивается
 * (её можно вернуть «+» или убрать совсем). Подсказка «собрать у одного продавца» считается от текущего состава.
 * Оформление в MVP недоступно — показываем объяснение.
 * Состав хранится на телефоне (localStorage). Цены демонстрационные.
 */
(function () {
  "use strict";

  var KEY = "autohub.cart.v2";
  var API = window.AutoHubApi;
  var SELLERS = API.parts.sellers;
  function itemFor(partId, seller, qty) {
    var p = API.parts.find(partId); if (!p) return null;
    return { key: p.id, name: p.name + " " + p.brand, article: p.article, seller: seller, qty: qty || 1, prices: API.parts.priceTable(p.id) };
  }
  function demoItems() { return [itemFor("p-mann-w811", "A"), itemFor("p-hk-28113", "A"), itemFor("p-hk-oil", "B")]; }

  var esc = function (s) { return window.AutoHubUI.esc(s); };
  function rub(n) { return Number(n).toLocaleString("ru-RU") + " ₽"; }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }

  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.items) return v; } catch (e) {}
    return { items: demoItems() };
  }
  var cart = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }

  function lineKey(it) { return it.key + "@" + it.seller; }
  function active() { return cart.items.filter(function (i) { return i.qty > 0; }); }
  function totals(items, sellerOverride) {
    var goods = 0, used = {};
    items.forEach(function (i) {
      var s = sellerOverride || i.seller;
      goods += i.prices[s] * i.qty; used[s] = true;
    });
    var sellers = Object.keys(used), delivery = sellers.reduce(function (sum, s) { return sum + SELLERS[s].delivery; }, 0);
    return { goods: goods, delivery: delivery, total: goods + delivery, sellers: sellers,
      count: items.reduce(function (n, i) { return n + i.qty; }, 0) };
  }
  // Лучший вариант собрать всё у одного продавца
  function bestSingle() {
    var items = active(), cur = totals(items);
    if (cur.sellers.length < 2) return null;
    var best = null;
    Object.keys(SELLERS).forEach(function (s) {
      if (!items.every(function (i) { return i.prices[s] != null; })) return;
      var t = totals(items, s);
      if (t.total < cur.total && (!best || t.total < best.total)) best = { seller: s, total: t.total, save: cur.total - t.total };
    });
    return best;
  }

  function add(item) {
    var ex = cart.items.filter(function (i) { return lineKey(i) === lineKey(item); })[0];
    if (ex) ex.qty = Math.max(1, ex.qty + 1);
    else cart.items.push(Object.assign({ qty: 1 }, item));
    save(); render();
  }
  function change(lk, d) {
    var it = cart.items.filter(function (i) { return lineKey(i) === lk; })[0]; if (!it) return;
    it.qty = Math.max(0, Math.min(99, it.qty + d));
    save(); render();
  }
  function applySingle(s) {
    var merged = {};
    cart.items.forEach(function (i) {
      if (i.qty > 0 && i.prices[s] != null) {
        var k = i.key;
        if (merged[k]) merged[k].qty += i.qty; else merged[k] = Object.assign({}, i, { seller: s });
      }
    });
    var rest = cart.items.filter(function (i) { return i.qty === 0; });
    cart.items = Object.keys(merged).map(function (k) { return merged[k]; }).concat(rest);
    save(); render();
    window.AutoHubUI.toast("Всё собрано у продавца «" + SELLERS[s].name + "»");
  }
  function removeZero() { cart.items = active(); save(); render(); }

  /* ---------- Отрисовка ---------- */
  function row(it, last) {
    var zero = it.qty === 0, lk = esc(lineKey(it)), strike = zero ? "text-decoration: line-through; color: #9A958B;" : "";
    return '<div class="cartrow' + (zero ? " zero" : "") + '" style="padding: 12px 12px 12px 14px; display: flex; gap: 8px; align-items: center' + (last ? "" : "; border-bottom: 1px solid #EFECE6") + '">' +
      '<div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px"><span style="font-weight: 600; font-size: 14px; ' + strike + '">' + esc(it.name) + "</span>" +
      '<span style="font-family: \'JetBrains Mono\', monospace; font-size: 11px; color: #5B5F66; ' + (zero ? "text-decoration: line-through" : "") + '">' + esc(it.article) +
      (zero ? "" : " · " + rub(it.prices[it.seller]) + "/шт") + "</span></div>" +
      '<div class="qty"><button data-action="dec" data-line="' + lk + '" aria-label="Меньше"' + (zero ? " disabled" : "") + ">−</button>" +
      '<span aria-live="polite">' + it.qty + "</span>" +
      '<button data-action="inc" data-line="' + lk + '" aria-label="' + (zero ? "Вернуть в заказ" : "Больше") + '">+</button></div>' +
      '<span style="width: 62px; text-align: right; font-weight: 700; flex-shrink: 0; ' + strike + '">' + rub(it.prices[it.seller] * Math.max(it.qty, zero ? 1 : it.qty)) + "</span></div>";
  }

  function render() {
    var list = document.getElementById("cartList"); if (!list) return;
    var items = active(), t = totals(items), best = bestSingle();
    document.getElementById("cartSub").textContent = cart.items.length
      ? t.count + " " + plural(t.count, "деталь", "детали", "деталей") + " · " + t.sellers.length + " " + plural(t.sellers.length, "продавец", "продавца", "продавцов")
      : "пока пусто";

    if (!cart.items.length) {
      list.innerHTML = '<div style="margin: auto 0; padding: 24px 8px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center">' +
        '<div style="font-weight: 700; font-size: 17px">Корзина пуста</div>' +
        '<div style="font-size: 14px; color: #5B5F66">Найдите детали для своей машины — сравним цены с доставкой.</div>' +
        '<a href="#Main" style="height: 48px; padding: 0 20px; border-radius: 14px; background: #17191C; color: #FFFFFF; font-weight: 700; display: flex; align-items: center; text-decoration: none">Искать запчасти</a>' +
        '<button data-action="demo" class="linkbtn">Вернуть демо-набор</button></div>';
    } else {
      var html = "";
      if (best) {
        html += '<div style="background: #FCEBDF; border-radius: 16px; padding: 14px; display: flex; gap: 12px; align-items: center">' +
          '<div style="width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; background: #C2410C; color: #FFFFFF; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6 4 4 6-8"/><path d="M15 7h5v5"/></svg></div>' +
          '<div style="flex-grow: 1; font-size: 13px; line-height: 1.4"><b style="font-size: 14px">Соберите заказ у одного продавца</b><br>' + esc(SELLERS[best.seller].name) + " — дешевле на " + rub(best.save) + " с учётом доставки</div>" +
          '<button data-action="single" data-seller="' + best.seller + '" style="height: 44px; padding: 0 12px; border-radius: 10px; background: #FFFFFF; border: none; font-size: 13px; font-weight: 700; color: #9A3412">Применить</button></div>';
      }
      Object.keys(SELLERS).forEach(function (s) {
        var lines = cart.items.filter(function (i) { return i.seller === s; });
        if (!lines.length) return;
        var live = lines.some(function (i) { return i.qty > 0; });
        html += '<div style="background: #FFFFFF; border: 1px solid #E2DED6; border-radius: 16px; overflow: hidden">' +
          '<div style="padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; background: #FAF9F6; border-bottom: 1px solid #EFECE6">' +
          '<span style="font-weight: 700; font-size: 15px">' + esc(SELLERS[s].name) + '</span><span style="font-size: 12px; color: #5B5F66">' +
          (live ? esc(SELLERS[s].when) + " · " + rub(SELLERS[s].delivery) : "не входит в заказ") + "</span></div>" +
          lines.map(function (it, i) { return row(it, i === lines.length - 1); }).join("") + "</div>";
      });
      if (cart.items.some(function (i) { return i.qty === 0; }))
        html += '<button data-action="clean" class="linkbtn" style="align-self: center">Убрать вычеркнутые позиции</button>';
      list.innerHTML = html;
    }

    var sum = document.getElementById("cartSum");
    var n = t.sellers.length;
    sum.innerHTML = cart.items.length ?
      '<div style="display: flex; justify-content: space-between; font-size: 13px; color: #5B5F66"><span>Товары ' + rub(t.goods) + "</span><span>Доставка" + (n > 1 ? " (" + n + " " + plural(n, "продавец", "продавца", "продавцов") + ")" : "") + " " + rub(t.delivery) + "</span></div>" +
      '<div style="display: flex; justify-content: space-between; align-items: baseline"><span style="font-weight: 700; font-size: 16px">Итого</span><span style="font-family: Unbounded, \'Arial Black\', sans-serif; font-weight: 700; font-size: 22px">' + rub(t.total) + "</span></div>" +
      '<button data-action="checkout" class="btn-accent"' + (n ? "" : " disabled") + ">" + (n > 1 ? "Оформить у " + n + " " + plural(n, "продавца", "продавцов", "продавцов") : "Оформить заказ") + "</button>"
      : "";
    sum.style.display = cart.items.length ? "" : "none";
    renderBadges(t.count);
  }

  function renderBadges(count) {
    document.querySelectorAll('nav a[href="#Cart"]').forEach(function (a) {
      var b = a.querySelector(".navbadge");
      if (!b) { b = document.createElement("span"); b.className = "navbadge"; a.style.position = "relative"; a.appendChild(b); }
      b.textContent = count > 99 ? "99+" : String(count);
      b.hidden = !count;
    });
  }

  function init() {
    var scr = document.getElementById("s-Cart"); if (!scr) return;
    scr.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-action]"); if (!b) return;
      var a = b.dataset.action;
      if (a === "inc") change(b.dataset.line, 1);
      else if (a === "dec") change(b.dataset.line, -1);
      else if (a === "single") applySingle(b.dataset.seller);
      else if (a === "clean") removeZero();
      else if (a === "demo") { cart = { items: demoItems() }; save(); render(); }
      else if (a === "checkout") {
        window.AutoHubUI.dialog("Оформление появится после MVP",
          "Это MVP-прототип АвтоХаба: заказать запчасти пока нельзя, магазины ещё не подключены. " +
          "Состав корзины сохранится на телефоне — когда подключим магазины, заказ можно будет оформить здесь же.", "Понятно");
      }
    });
    render();
  }

  /** Добавить деталь из каталога у выбранного продавца. */
  function addPart(partId, seller) {
    var it = itemFor(partId, seller); if (!it) return;
    add(it);
    window.AutoHubUI.toast("В корзине: " + it.name + " · " + SELLERS[seller].name);
  }
  function count() { return active().reduce(function (n, i) { return n + i.qty; }, 0); }

  window.AutoHubCart = { init: init, add: add, addPart: addPart, render: render, count: count };
})();
