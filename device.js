/* АвтоХаб: возможности телефона — координаты, фото, напоминания, маршрут в картах.
 * В Android-приложении — через нативный мост NativeDevice (MainActivity.kt),
 * в браузере — через стандартные API. Интернет для координат не нужен: GPS работает без сети.
 */
(function () {
  "use strict";

  var seq = 0, geoCbs = {}, photoCbs = {}, notifyCbs = {};
  window.__nativeGeoCb = function (id, ok, lat, lng, acc, err) {
    var cb = geoCbs[id]; delete geoCbs[id]; if (cb) cb(ok, { lat: lat, lng: lng, accuracy: acc }, err);
  };
  window.__nativePhotoCb = function (id, dataUrl) { var cb = photoCbs[id]; delete photoCbs[id]; if (cb) cb(dataUrl); };
  window.__nativeNotifyCb = function (id, enabled) { var cb = notifyCbs[id]; delete notifyCbs[id]; if (cb) cb(!!enabled); };
  var native = function () { return window.NativeDevice; };

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  var GEO_MSG = {
    denied: "Нет доступа к геолокации. Разрешите его в настройках телефона.",
    off: "Геолокация выключена. Включите её в шторке телефона.",
    timeout: "Не удалось поймать спутники. Выйдите на открытое место и попробуйте ещё раз.",
    unsupported: "Этот браузер не умеет определять местоположение."
  };

  /** Текущие координаты → Promise<{lat, lng, accuracy, stale}> */
  function getLocation() {
    return new Promise(function (resolve, reject) {
      if (native() && native().getLocation) {
        var id = "g" + (++seq);
        geoCbs[id] = function (ok, pos, e) {
          if (ok) { pos.stale = e === "stale"; resolve(pos); } else reject(err(e || "timeout", GEO_MSG[e] || GEO_MSG.timeout));
        };
        native().getLocation(id);
        return;
      }
      if (!navigator.geolocation) return reject(err("unsupported", GEO_MSG.unsupported));
      navigator.geolocation.getCurrentPosition(function (p) {
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      }, function (e) {
        var code = e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "off";
        reject(err(code, GEO_MSG[code]));
      }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 60000 });
    });
  }

  /** Отслеживание координат (для поиска машины). Возвращает функцию остановки. */
  function watchLocation(onPos) {
    if (native() && native().getLocation) {
      var stop = false;
      (function tick() {
        if (stop) return;
        getLocation().then(onPos, function () {}).then(function () { if (!stop) setTimeout(tick, 4000); });
      })();
      return function () { stop = true; };
    }
    if (!navigator.geolocation) return function () {};
    var w = navigator.geolocation.watchPosition(function (p) {
      onPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
    }, function () {}, { enableHighAccuracy: true, maximumAge: 3000 });
    return function () { navigator.geolocation.clearWatch(w); };
  }

  // Уменьшаем фото, чтобы оно поместилось в память телефона (localStorage)
  function shrink(dataUrl, maxSide) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  /** Фото с камеры → Promise<dataURL|null> */
  function takePhoto() {
    return new Promise(function (resolve) {
      if (native() && native().takePhoto) {
        var id = "p" + (++seq);
        photoCbs[id] = function (d) { resolve(d ? shrink(d, 640) : null); };
        native().takePhoto(id);
        return;
      }
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return resolve(null);
        var r = new FileReader(); r.onload = function () { resolve(shrink(r.result, 640)); }; r.readAsDataURL(f);
      };
      inp.click();
    });
  }

  /* ---------- Уведомления-напоминания ---------- */

  /** Покажет ли телефон напоминание (без вопросов пользователю) → Promise<boolean>.
   *  В приложении: Android 13+ — выдано ли разрешение; везде — не выключены ли уведомления в настройках. */
  function notificationsEnabled() {
    var n = native();
    if (n && n.notificationsEnabled) { try { return Promise.resolve(!!n.notificationsEnabled()); } catch (e) { return Promise.resolve(false); } }
    return Promise.resolve(!!(window.Notification && Notification.permission === "granted"));
  }

  /** То же, но если разрешения нет и спросить можно — спрашивает (системный диалог) → Promise<boolean>. */
  function requestNotifications() {
    var n = native();
    if (n && n.requestNotifications) {
      return new Promise(function (resolve) {
        var id = "n" + (++seq);
        notifyCbs[id] = resolve;
        try { n.requestNotifications(id); } catch (e) { delete notifyCbs[id]; resolve(false); }
      });
    }
    if (n) return notificationsEnabled();
    if (!window.Notification) return Promise.resolve(false);
    if (Notification.permission !== "default") return Promise.resolve(Notification.permission === "granted");
    return new Promise(function (resolve) {
      var done = function (p) { resolve(p === "granted"); };
      try { var r = Notification.requestPermission(done); if (r && r.then) r.then(done, function () { resolve(false); }); }
      catch (e) { resolve(false); }
    });
  }

  /** Точные будильники разрешены (Android 12+: «Будильники и напоминания»). Без них напоминание может опоздать на несколько минут. */
  function exactAlarms() {
    var n = native();
    if (n && n.exactAlarmsAllowed) { try { return !!n.exactAlarmsAllowed(); } catch (e) { return false; } }
    return true;
  }

  var timers = {};
  // setTimeout дольше 2^31−1 мс (~24,8 дня) в браузере срабатывает сразу — длинное ожидание взводится частями
  var MAX_DELAY = 2147483647;
  function arm(id, ms, fire) {
    var left = ms - Date.now();
    timers[id] = setTimeout(function () {
      if (ms - Date.now() > 0) arm(id, ms, fire); else { delete timers[id]; fire(); }
    }, Math.min(Math.max(0, left), MAX_DELAY));
  }

  /** Напоминание в момент at (Date или мс). В приложении — системное уведомление (переживает перезагрузку),
   *  в браузере — пока вкладка открыта. Вызывающим можно не ждать результат; если нужно предупредить
   *  пользователя — Promise<{scheduled, notifications, exact}>:
   *    notifications=false — уведомления запрещены, напоминание не придёт;
   *    exact=false — точные будильники запрещены, напоминание может прийти на несколько минут позже. */
  function schedule(id, at, title, text) {
    var ms = +at, n = native();
    if (n && n.schedule) {
      var mode = "";
      try { mode = n.schedule(id, String(ms), title, text) || ""; } catch (e) { mode = ""; }
      return requestNotifications().then(function (on) {
        return { scheduled: !!mode, notifications: on, exact: mode === "exact" };
      });
    }
    clearTimeout(timers[id]);
    arm(id, ms, function () {
      if (window.Notification && Notification.permission === "granted") new Notification(title, { body: text });
      else if (window.AutoHubUI) window.AutoHubUI.dialog(title, text, "Понятно");
    });
    // В браузере диалог в странице показывается и без разрешения — напоминание «придёт», пока вкладка открыта
    return requestNotifications().then(function (on) { return { scheduled: true, notifications: on, exact: true }; });
  }
  function cancel(id) {
    if (native() && native().cancel) { native().cancel(id); return; }
    clearTimeout(timers[id]); delete timers[id];
  }

  /** Снимки документов с камеры больше не нужны (после сохранения наряда или закрытия окна сканирования). */
  function releaseDocumentCaptures() {
    var n = native();
    if (n && n.releaseDocumentCaptures) { try { n.releaseDocumentCaptures(); } catch (e) {} }
  }

  /** Маршрут до точки в приложении карт телефона (в браузере — Яндекс Карты на сайте). */
  function openMap(lat, lng, label) {
    if (native()) { location.href = "geo:" + lat + "," + lng + "?q=" + lat + "," + lng + "(" + encodeURIComponent(label || "Моя машина") + ")"; return; }
    window.open("https://yandex.ru/maps/?pt=" + lng + "," + lat + "&z=17&l=map&rtext=~" + lat + "," + lng, "_blank");
  }

  /** Расстояние (м) и направление (° от севера) между точками. */
  function distance(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    var r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
    var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }

  /** Компас: куда смотрит телефон (° от севера). Возвращает функцию остановки. */
  function watchHeading(onHeading) {
    function h(e) {
      var v = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === "deviceorientationabsolute") && e.alpha != null ? 360 - e.alpha : null;
      if (v != null) onHeading(v);
    }
    var ev = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(ev, h);
    return function () { window.removeEventListener(ev, h); };
  }

  window.AutoHubDevice = { getLocation: getLocation, watchLocation: watchLocation, takePhoto: takePhoto, schedule: schedule, cancel: cancel,
    notificationsEnabled: notificationsEnabled, requestNotifications: requestNotifications, exactAlarms: exactAlarms,
    releaseDocumentCaptures: releaseDocumentCaptures,
    openMap: openMap, distance: distance, bearing: bearing, watchHeading: watchHeading, native: function () { return !!native(); } };
})();
