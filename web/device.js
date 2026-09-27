/* АвтоХаб: возможности телефона — координаты, фото, напоминания, маршрут в картах.
 * В Android-приложении — через нативный мост NativeDevice (MainActivity.kt),
 * в браузере — через стандартные API. Интернет для координат не нужен: GPS работает без сети.
 */
(function () {
  "use strict";

  var seq = 0, geoCbs = {}, photoCbs = {};
  window.__nativeGeoCb = function (id, ok, lat, lng, acc, err) {
    var cb = geoCbs[id]; delete geoCbs[id]; if (cb) cb(ok, { lat: lat, lng: lng, accuracy: acc }, err);
  };
  window.__nativePhotoCb = function (id, dataUrl) { var cb = photoCbs[id]; delete photoCbs[id]; if (cb) cb(dataUrl); };
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

  var timers = {};
  /** Напоминание в момент at (Date или мс). В приложении — системное уведомление, в браузере — пока вкладка открыта. */
  function schedule(id, at, title, text) {
    var ms = +at;
    if (native() && native().schedule) { native().schedule(id, String(ms), title, text); return; }
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function () {
      if (window.Notification && Notification.permission === "granted") new Notification(title, { body: text });
      else if (window.AutoHubUI) window.AutoHubUI.dialog(title, text, "Понятно");
    }, Math.max(0, ms - Date.now()));
    if (window.Notification && Notification.permission === "default") Notification.requestPermission();
  }
  function cancel(id) {
    if (native() && native().cancel) { native().cancel(id); return; }
    clearTimeout(timers[id]);
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
    openMap: openMap, distance: distance, bearing: bearing, watchHeading: watchHeading, native: function () { return !!native(); } };
})();
