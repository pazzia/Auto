/* АвтоХаб: веб-приложение (PWA) — установка из браузера и работа без интернета.
 * В Android-приложении (WebView, file://) модуль ничего не делает.
 *  • сервис-воркер sw.js кэширует приложение: после первого открытия оно запускается офлайн;
 *  • «Установить приложение»: Chrome, Edge, Android — системное окно установки;
 *    iPhone и iPad (Safari) — подсказка «Поделиться → На экран „Домой“».
 */
(function () {
  "use strict";

  var native = !!window.NativeHttp || location.protocol === "file:";
  var deferred = null; // событие beforeinstallprompt
  function standalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function isIOS() {
    var ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  /** "prompt" — можно показать системное окно; "ios" — установка через меню Safari; "manual" — через меню браузера; null — уже установлено или не веб. */
  function installMode() {
    if (native || standalone()) return null;
    if (deferred) return "prompt";
    if (isIOS()) return "ios";
    return "manual";
  }
  function install() {
    var UI = window.AutoHubUI, mode = installMode();
    if (mode === "prompt") {
      var ev = deferred; deferred = null;
      ev.prompt();
      (ev.userChoice || Promise.resolve({})).then(function (r) { if (r && r.outcome === "accepted" && UI) UI.toast("АвтоХаб устанавливается"); refresh(); });
      return;
    }
    if (!UI) return;
    if (mode === "ios") {
      UI.sheet({ title: "Установить на iPhone", html:
        '<p class="sheet-text">Откройте эту страницу в Safari и добавьте её на экран «Домой» — АвтоХаб будет запускаться как обычное приложение.</p>' +
        '<div class="kv"><div><span>1</span><b>Кнопка «Поделиться» внизу экрана</b></div><div><span>2</span><b>«На экран „Домой“»</b></div><div><span>3</span><b>«Добавить»</b></div></div>' +
        '<button class="btn-dark" data-close="1" data-action="close">Понятно</button>' });
    } else if (mode === "manual") {
      UI.sheet({ title: "Установить приложение", html:
        '<p class="sheet-text">Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран». В Chrome и Edge на компьютере значок установки — справа в адресной строке.</p>' +
        '<button class="btn-dark" data-close="1" data-action="close">Понятно</button>' });
    }
  }
  function refresh() {
    var mode = installMode();
    Array.prototype.forEach.call(document.querySelectorAll("[data-pwa-install]"), function (el) { el.hidden = !mode; });
    if (window.AutoHubAuth && window.AutoHubAuth.renderProfile && location.hash === "#Profile") window.AutoHubAuth.renderProfile();
  }

  function init() {
    if (native) return;
    document.addEventListener("click", function (e) { if (e.target.closest("[data-action=pwa-install]")) install(); });
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; refresh(); });
    window.addEventListener("appinstalled", function () { deferred = null; refresh(); if (window.AutoHubUI) window.AutoHubUI.toast("АвтоХаб установлен"); });
    refresh();
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(function () {});
    // Новая сборка взяла управление: сообщаем, а не перезагружаем — вдруг человек заполняет форму
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hadController && window.AutoHubUI) window.AutoHubUI.toast("Вышло обновление — закройте и откройте приложение");
      hadController = true;
    });
  }

  window.AutoHubPWA = { init: init, installMode: installMode, install: install, standalone: standalone };
})();
