/* АвтоХаб: вход, регистрация и личный кабинет.
 * Прототип: подходят любые непустые логин и пароль, профиль хранится на телефоне.
 * В кабинете — данные пользователя, управление машинами, сервисы, настройки, выход и номер сборки.
 */
(function () {
  "use strict";

  var UI = window.AutoHubUI;
  var esc = function (s) { return UI.esc(s); };
  var KEY = "autohub.session.v1", SET = "autohub.settings.v1";
  var BUILD = window.AUTOHUB_BUILD || "";

  function session() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function saveSession(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function settings() { try { return JSON.parse(localStorage.getItem(SET) || "null") || { push: true, to: true, fines: true, city: "Красногорск" }; } catch (e) { return { push: true, to: true, fines: true, city: "Красногорск" }; } }
  function saveSettings(v) { try { localStorage.setItem(SET, JSON.stringify(v)); } catch (e) {} }
  function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("") || "?"; }
  function $(id) { return document.getElementById(id); }

  /* ---------- Доступ: без входа — только приветствие ---------- */
  function guard() {
    var h = (location.hash || "#Garage").slice(1).split("/")[0];
    if (!session() && h !== "Welcome") { history.replaceState(null, "", "#Welcome"); return "Welcome"; }
    if (session() && h === "Welcome") { history.replaceState(null, "", "#Garage"); return "Garage"; }
    return null;
  }

  /* ---------- Приветствие ---------- */
  var mode = "login";
  function initWelcome() {
    var scr = $("s-Welcome"); if (!scr) return;
    $("welcomeBuild").textContent = "АвтоХаб · сборка " + BUILD;
    scr.addEventListener("click", function (e) {
      var t = e.target.closest("[data-auth]");
      if (t) {
        mode = t.dataset.auth;
        scr.querySelectorAll("[data-auth]").forEach(function (b) { b.classList.toggle("on", b === t); b.setAttribute("aria-selected", String(b === t)); });
        $("aNameWrap").hidden = mode !== "reg";
        $("aGo").textContent = mode === "reg" ? "Создать аккаунт" : "Войти";
        $("aPass").setAttribute("autocomplete", mode === "reg" ? "new-password" : "current-password");
        $("aErr").hidden = true;
      }
    });
    $("aShow").addEventListener("click", function () {
      var p = $("aPass"), show = p.type === "password";
      p.type = show ? "text" : "password"; this.textContent = show ? "Скрыть" : "Показать";
    });
    function submit() {
      var login = $("aLogin").value.trim(), pass = $("aPass").value, name = $("aName").value.trim(), err = $("aErr");
      var msg = !login ? "Введите телефон или e-mail." : !pass ? "Введите пароль." : mode === "reg" && !name ? "Как вас зовут? Укажите имя." : "";
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      err.hidden = true;
      var isMail = login.indexOf("@") > 0;
      var prev = session() || {};
      var s = {
        name: name || prev.name || (isMail ? login.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : "Автовладелец"),
        email: isMail ? login : (prev.email || ""), phone: isMail ? (prev.phone || "") : login,
        since: prev.since || new Date().toISOString().slice(0, 10), id: "u" + Date.now().toString(36)
      };
      var btn = $("aGo"); btn.disabled = true; btn.textContent = mode === "reg" ? "Создаём аккаунт…" : "Входим…";
      setTimeout(function () {
        saveSession(s); btn.disabled = false; btn.textContent = mode === "reg" ? "Создать аккаунт" : "Войти";
        $("aPass").value = "";
        // Новому пользователю — сразу добавить свою машину, чтобы ТО считалось по ней
        var hasOwn = window.AutoHubCar && window.AutoHubCar.cars().some(function (c) { return !c.demo; });
        if (mode === "reg" && !hasOwn && window.AutoHubCar) window.AutoHubCar.startOnboarding(); else location.hash = "#Garage";
        UI.toast(mode === "reg" ? "Аккаунт создан. Добро пожаловать, " + s.name.split(" ")[0] + "!" : "С возвращением, " + s.name.split(" ")[0]);
        renderAvatar();
      }, 500);
    }
    $("aGo").addEventListener("click", submit);
    [$("aLogin"), $("aPass"), $("aName")].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); }); });
  }

  /* ---------- Личный кабинет ---------- */
  // Координаты городов — точка отсчёта для «сервисов рядом» (в рабочей версии — геокодер адреса)
  var CITY_POS = { "Москва": [55.751, 37.617], "Красногорск": [55.8215, 37.3302], "Химки": [55.889, 37.445], "Одинцово": [55.678, 37.278],
    "Мытищи": [55.911, 37.730], "Балашиха": [55.796, 37.938], "Подольск": [55.431, 37.545], "Королёв": [55.922, 37.854], "Люберцы": [55.676, 37.893],
    "Истра": [55.915, 36.861], "Долгопрудный": [55.933, 37.514] };
  var CITIES = Object.keys(CITY_POS);
  function location_() {
    var st = settings(), p = CITY_POS[st.city] || CITY_POS["Красногорск"];
    return { city: st.city, address: st.address || "", lat: p[0], lng: p[1], label: st.city };
  }
  /** Шторка «Мой адрес»: город и улица. cb — после сохранения. */
  function editAddress(cb) {
    var st = settings();
    UI.sheet({ title: "Мой адрес", html: '<p class="sheet-text" style="font-size:13px;color:#5B5F66">По адресу подбираем ближайшие автосервисы и считаем доставку.</p>' +
      '<label class="fld">Город<select id="adCity">' + CITIES.map(function (c) { return '<option' + (c === st.city ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
      '<label class="fld">Улица и дом<input id="adStreet" autocomplete="street-address" placeholder="ул. Ленина, 5" value="' + esc(st.address || "") + '"></label>' +
      '<button class="btn-accent" data-action="save-addr" style="height:52px">Сохранить</button>',
      onMount: function (b) {
        b.querySelector("[data-action=save-addr]").addEventListener("click", function () {
          st.city = b.querySelector("#adCity").value; st.address = b.querySelector("#adStreet").value.trim(); saveSettings(st);
          UI.close(function () { UI.toast("Адрес сохранён"); if (window.AutoHubServices && window.AutoHubServices.relocate) window.AutoHubServices.relocate(); if (cb) cb(); });
        });
      } });
  }
  function row(href, icon, title, sub, right) {
    return '<a href="' + href + '" class="prow"><span class="prow-ic">' + icon + '</span><span class="prow-txt"><b>' + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</span>" +
      (right ? '<span class="prow-r">' + esc(right) + "</span>" : "") + '<span class="prow-go">›</span></a>';
  }
  function toggle(key, title, sub, on) {
    return '<label class="prow tgl"><span class="prow-txt"><b>' + esc(title) + "</b><span>" + esc(sub) + '</span></span><input type="checkbox" role="switch" data-set="' + key + '"' + (on ? " checked" : "") + "><span class=\"sw\" aria-hidden=\"true\"></span></label>";
  }
  function renderProfile() {
    var body = $("profileBody"); if (!body) return;
    var s = session() || {}, st = settings(), C = window.AutoHubCar;
    var cars = C ? C.cars() : [], active = C ? C.active() : null, own = cars.filter(function (c) { return !c.demo; });
    var hist = 0; try { var h = JSON.parse(localStorage.getItem("autohub.history.v1") || "{}"); Object.keys(h).forEach(function (k) { hist += h[k].length; }); } catch (e) {}
    var plus = null; try { plus = JSON.parse(localStorage.getItem("autohub.plus.v1") || "null"); } catch (e) {}
    var pts = window.AutoHubTO ? window.AutoHubTO.points() : 1240;
    var since = s.since ? new Date(s.since + "T12:00:00").toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) : "";
    var html =
      '<div class="pcard"><span class="pav">' + esc(initials(s.name)) + '</span><div class="pinfo"><b>' + esc(s.name || "Без имени") + "</b>" +
      "<span>" + esc(s.email || "e-mail не указан") + "</span><span>" + esc(s.phone || "телефон не указан") + "</span>" +
      '<span class="pmeta">' + esc(st.city) + (since ? " · с нами с " + esc(since) : "") + "</span></div></div>" +
      '<div class="pstats"><div><b>' + own.length + "</b><span>машин</span></div><div><b>" + hist + '</b><span>записей</span></div><div><b>' + pts.toLocaleString("ru-RU") + '</b><span>баллов</span></div></div>' +

      '<div class="psec">МОИ МАШИНЫ</div><div class="pcars">' +
      (own.length ? own.map(function (c) {
        var v = C.view(c), k = C.statusKind(c);
        return '<div class="pcar' + (active && c.id === active.id ? " on" : "") + '"><span class="sdot ' + k + '" aria-hidden="true"></span>' +
          '<div class="pcar-txt"><b>' + esc(v.name) + "</b><span>" + esc([c.plate ? C.plate(c.plate, c.region) : "без номера", v.mileage].join(" · ")) + "</span></div>" +
          (active && c.id === active.id ? '<span class="pcar-main">основная</span>' : "") +
          '<button class="dc-more light" data-car-menu="' + esc(c.id) + '" data-action="car-menu" aria-label="Действия: ' + esc(v.name) + '">⋯</button></div>';
      }).join("") : '<div class="pempty">Машин пока нет — в гараже показана демо-машина.</div>') +
      '<a href="#AddCar" class="padd"><span>+</span>Добавить автомобиль<small>госномер, VIN или марка</small></a></div>' +

      '<div class="psec">СЕРВИСЫ</div><div class="pgroup">' +
      row("#Subscription", "★", "АвтоХаб Плюс", plus ? "активна до " + plus.until : "тариф «Базовый»", "") +
      row("#Wallet", "₽", "Баллы и копилка", pts.toLocaleString("ru-RU") + " баллов · 1 балл = 1 ₽", "") +
      row("#History", "≡", "История обслуживания", "визиты, покупки, заказ-наряды", "") +
      row("#Family", "♥", "Семейный гараж", "доступ для близких", "") +
      row("#CarPassport", "▣", "Паспорт автомобиля", "история для продажи", "") +
      row("#Warranty", "✓", "Гарантии", "работы и запчасти", "") + "</div>" +

      '<div class="psec">НАСТРОЙКИ</div><div class="pgroup">' +
      toggle("push", "Пуш-уведомления", "записи, заказы, акции", st.push) +
      toggle("to", "Напоминания о ТО", "по пробегу и сроку", st.to) +
      toggle("fines", "Новые штрафы", "проверка каждый день", st.fines) +
      '<button class="prow" data-action="city"><span class="prow-txt"><b>Мой адрес</b><span>' + esc(st.city + (st.address ? ", " + st.address : "") + " · для сервисов рядом") + '</span></span><span class="prow-go">›</span></button>' +
      '<div class="prow"><span class="prow-txt"><b>Данные</b><span>' + (window.AutoHubApi && window.AutoHubApi.mode === "mock" ? "демо-режим: заглушки API" : "реальные источники") + "</span></span></div></div>" +

      '<div class="pgroup">' +
      '<button class="prow" data-action="export"><span class="prow-txt"><b>Выгрузить мои данные</b><span>машины, история, настройки</span></span><span class="prow-go">›</span></button>' +
      '<button class="prow" data-action="logout"><span class="prow-txt"><b style="color:#C2410C">Выйти</b></span></button>' +
      '<button class="prow" data-action="delete"><span class="prow-txt"><b style="color:#9A3412">Удалить аккаунт</b><span>все данные на телефоне будут стёрты</span></span></button></div>' +

      '<div class="buildinfo">АвтоХаб · сборка ' + esc(BUILD) + (window.AutoHubApi && window.AutoHubApi.mode === "mock" ? " · демо-данные" : "") + "<br>© 2026 АвтоХаб</div>";
    body.innerHTML = html;
  }

  function carMenu(id) {
    var C = window.AutoHubCar, c = C.cars().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    var v = C.view(c), isMain = C.active().id === id;
    UI.sheet({ title: v.name,
      html: (isMain ? "" : '<button class="pick" data-act="main" data-action="m"><span class="pick-ic">★</span><span class="pick-txt"><b>Сделать основной</b><span>будет выбрана в гараже и поиске</span></span></button>') +
        '<button class="pick" data-act="mileage" data-action="m"><span class="pick-ic">км</span><span class="pick-txt"><b>Обновить пробег</b><span>сейчас: ' + esc(v.mileage) + "</span></span></button>" +
        '<button class="pick" data-act="delete" data-action="m"><span class="pick-ic" style="background:#FCEBDF;color:#9A3412">×</span><span class="pick-txt"><b>Убрать из гаража</b><span>история этой машины будет удалена</span></span></button>',
      onMount: function (b) {
        b.addEventListener("click", function (e) {
          var t = e.target.closest("[data-act]"); if (!t) return;
          var act = t.dataset.act;
          UI.close(function () {
            if (act === "main") { C.setActive(id); UI.toast(v.name + " — основная машина"); }
            if (act === "mileage") {
              var val = window.prompt("Текущий пробег, км", c.mileage || ""), n = parseInt(String(val || "").replace(/\D/g, ""), 10);
              if (n) C.update(id, { mileage: n });
            }
            if (act === "delete" && window.confirm("Убрать " + v.name + " из гаража?")) { C.remove(id); UI.toast("Автомобиль убран из гаража"); }
            renderProfile();
          });
        });
      } });
  }

  function editProfile() {
    var s = session() || {};
    UI.sheet({ title: "Мои данные",
      html: '<label class="fld">Имя и фамилия<input id="eName" autocomplete="name" value="' + esc(s.name || "") + '"></label>' +
        '<label class="fld">E-mail<input id="eMail" type="email" autocomplete="email" value="' + esc(s.email || "") + '"></label>' +
        '<label class="fld">Телефон<input id="ePhone" type="tel" autocomplete="tel" value="' + esc(s.phone || "") + '"></label>' +
        '<span id="eErr" class="err" hidden></span><button class="btn-accent" data-action="save-p" style="height:52px">Сохранить</button>',
      onMount: function (b) {
        b.querySelector("[data-action=save-p]").addEventListener("click", function () {
          var name = b.querySelector("#eName").value.trim(), mail = b.querySelector("#eMail").value.trim();
          if (!name) { var er = b.querySelector("#eErr"); er.textContent = "Имя не может быть пустым."; er.hidden = false; return; }
          if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { var er2 = b.querySelector("#eErr"); er2.textContent = "Проверьте e-mail: нужен вид name@mail.ru."; er2.hidden = false; return; }
          s.name = name; s.email = mail; s.phone = b.querySelector("#ePhone").value.trim(); saveSession(s);
          UI.close(function () { renderProfile(); renderAvatar(); UI.toast("Данные сохранены"); });
        });
      } });
  }

  function initProfile() {
    var scr = $("s-Profile"); if (!scr) return;
    $("pEdit").addEventListener("click", editProfile);
    scr.addEventListener("change", function (e) {
      var t = e.target.closest("[data-set]"); if (!t) return;
      var st = settings(); st[t.dataset.set] = t.checked; saveSettings(st);
      UI.toast(t.checked ? "Включено" : "Выключено");
    });
    scr.addEventListener("click", function (e) {
      var m = e.target.closest("[data-car-menu]"); if (m) { carMenu(m.getAttribute("data-car-menu")); return; }
      var b = e.target.closest("button[data-action]"); if (!b) return;
      var a = b.dataset.action;
      if (a === "city") editAddress(renderProfile);
      if (a === "export") {
        var dump = {}; Object.keys(localStorage).filter(function (k) { return k.indexOf("autohub.") === 0; }).forEach(function (k) { try { dump[k] = JSON.parse(localStorage.getItem(k)); } catch (x) {} });
        var txt = JSON.stringify(dump, null, 2);
        UI.sheet({ title: "Мои данные", html: '<pre class="dump">' + esc(txt.slice(0, 4000)) + (txt.length > 4000 ? "\n…" : "") + '</pre><button class="btn-dark" data-action="copy">Скопировать</button>',
          onMount: function (bd) { bd.querySelector("[data-action=copy]").addEventListener("click", function () {
            (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { UI.toast("Скопировано"); }, function () { UI.toast("Копирование недоступно"); });
          }); } });
      }
      if (a === "logout" && window.confirm("Выйти из аккаунта? Машины и история останутся на телефоне.")) {
        localStorage.removeItem(KEY); location.hash = "#Welcome"; UI.toast("Вы вышли из аккаунта");
      }
      if (a === "delete" && window.confirm("Удалить аккаунт и все данные на этом телефоне? Отменить нельзя.")) {
        Object.keys(localStorage).filter(function (k) { return k.indexOf("autohub.") === 0; }).forEach(function (k) { localStorage.removeItem(k); });
        location.hash = "#Welcome"; setTimeout(function () { location.reload(); }, 50);
      }
    });
    window.addEventListener("hashchange", function () { if (location.hash === "#Profile") renderProfile(); });
    window.addEventListener("autohub:car", function () { if (location.hash === "#Profile") renderProfile(); });
    renderProfile();
  }

  /* ---------- Кнопки перехода в кабинет ---------- */
  var PROFILE_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg>';
  function addNavTab() {
    document.querySelectorAll("nav").forEach(function (nav) {
      if (nav.querySelector('a[href="#Profile"]')) return;
      nav.style.gridTemplateColumns = "repeat(5, minmax(0, 1fr))";
      var tpl = nav.querySelector('a:not([style*="#C2410C"])') || nav.querySelector("a");
      var a = tpl.cloneNode(false);
      a.href = "#Profile"; a.innerHTML = PROFILE_ICON + "Профиль";
      var inProfile = !!nav.closest("#s-Profile");
      a.style.color = inProfile ? "#C2410C" : "#5B5F66"; a.style.fontWeight = inProfile ? "700" : "600";
      if (inProfile) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
  }
  function renderAvatar() {
    var g = $("s-Garage"); if (!g) return;
    var add = g.querySelector('a[href="#AddCar"], a#garageAvatar'); if (!add) return;
    add.id = "garageAvatar"; add.href = "#Profile"; add.setAttribute("aria-label", "Личный кабинет");
    add.innerHTML = '<span class="gav">' + esc(initials((session() || {}).name)) + "</span>";
    add.style.background = "#17191C"; add.style.border = "none";
  }

  function init() {
    addNavTab(); renderAvatar(); initWelcome(); initProfile();
  }
  window.AutoHubAuth = { init: init, guard: guard, session: session, location: location_, editAddress: editAddress };
})();
