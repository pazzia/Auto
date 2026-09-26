/* АвтоХаб: единый слой API.
 *
 * Все экраны обращаются к данным только через window.AutoHubApi.
 * Режимы:
 *   mock (по умолчанию) — заглушки: демо-данные с имитацией задержки сети, без интернета;
 *   live               — реальные источники: VIN и модели через NHTSA vPIC, остальное через бэкенд
 *                        (AUTOHUB_CONFIG.baseUrl, пока не задан — вызовы вернут ошибку not_configured).
 * Переключение: ?api=live в адресе или window.AUTOHUB_CONFIG = { mode: "live", baseUrl: "https://..." }
 * до подключения этого файла. Контракт методов описан в docs/api.md.
 *
 * Все цифры и названия в заглушках демонстрационные.
 */
(function () {
  "use strict";

  var cfg = Object.assign({ mode: "mock", baseUrl: "", latency: [250, 700] }, window.AUTOHUB_CONFIG || {});
  var qm = /[?&]api=(mock|live)\b/.exec(location.search);
  if (qm) cfg.mode = qm[1];
  var MOCK = cfg.mode !== "live";

  function apiError(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function wait() {
    var a = cfg.latency[0], b = cfg.latency[1];
    return new Promise(function (res) { setTimeout(res, a + Math.random() * (b - a)); });
  }
  function ok(v) { return wait().then(function () { return clone(v); }); }
  function fail(code, msg) { return wait().then(function () { throw apiError(code, msg); }); }

  /* ---------- Сеть (режим live): в Android через нативный мост без CORS, в браузере через fetch ---------- */
  var cbSeq = 0, cbs = {};
  window.__nativeHttpCb = function (id, okFlag, body) { var cb = cbs[id]; delete cbs[id]; if (cb) cb(okFlag, body); };
  function httpGetJson(url, timeoutMs) {
    timeoutMs = timeoutMs || 12000;
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(apiError("timeout")); } }, timeoutMs);
      function finish(okFlag, body) {
        if (done) return; done = true; clearTimeout(timer);
        if (!okFlag) return reject(apiError("network", body));
        try { resolve(JSON.parse(body)); } catch (e) { reject(apiError("bad_json")); }
      }
      if (window.NativeHttp && window.NativeHttp.get) {
        var id = "c" + (++cbSeq); cbs[id] = finish; window.NativeHttp.get(url, id);
      } else {
        fetch(url).then(function (r) { return r.text().then(function (t) { finish(r.ok, r.ok ? t : "HTTP " + r.status); }); },
          function (e) { finish(false, String(e)); });
      }
    });
  }
  function backend(method, path, body) {
    if (!cfg.baseUrl) return Promise.reject(apiError("not_configured", "Бэкенд не подключён"));
    return fetch(cfg.baseUrl.replace(/\/$/, "") + path, {
      method: method, headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) throw apiError("http_" + r.status);
      return r.json();
    });
  }
  function qs(o) {
    return Object.keys(o || {}).filter(function (k) { return o[k] != null && o[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
  }

  /* ================= ДЕМО-ДАННЫЕ ================= */
  var SRC_MOCK = "Демо-данные (заглушка API)";

  var M_VINS = {
    XWEFC41ABKC001234: { make: "Kia", model: "Rio IV", year: 2019, engine: "1.6 бензин 123 л.с.", transmission: "Автомат", body: "Седан", plantCountry: "Россия" },
    XTA219170K0123456: { make: "Lada", model: "Granta", year: 2019, engine: "1.6 бензин 90 л.с.", transmission: "Механика", body: "Седан", plantCountry: "Россия" },
    Z94K241CBMR123456: { make: "Hyundai", model: "Solaris", year: 2021, engine: "1.6 бензин 123 л.с.", transmission: "Автомат", body: "Седан", plantCountry: "Россия" },
    XW8ZZZ61ZKG123456: { make: "Volkswagen", model: "Polo", year: 2019, engine: "1.6 бензин 110 л.с.", transmission: "Автомат", body: "Лифтбек", plantCountry: "Россия" },
    LVVDB21B8MD123456: { make: "Chery", model: "Tiggo 7 Pro", year: 2021, engine: "1.5 бензин 147 л.с.", transmission: "Вариатор", body: "Внедорожник / кроссовер", plantCountry: "Китай" }
  };
  var M_PLATES = {
    "А123ВС177": { vin: "XWEFC41ABKC001234", mileage: 58400 },
    "В456ОР750": { vin: "XTA219170K0123456", mileage: 97300 },
    "Е789КХ50": { vin: "Z94K241CBMR123456", mileage: 34100 },
    "М001ММ99": { vin: "XW8ZZZ61ZKG123456", mileage: 76800 }
  };
  var M_MODELS = {
    Honda: ["Civic", "Accord", "CR-V", "HR-V", "Pilot"],
    Subaru: ["Impreza", "Legacy", "Outback", "Forester", "XV"],
    Volvo: ["S60", "S90", "XC40", "XC60", "XC90"],
    Lexus: ["ES", "IS", "NX", "RX", "LX"],
    Infiniti: ["Q50", "QX50", "QX60", "QX80"],
    Suzuki: ["Vitara", "SX4", "Jimny", "Swift"],
    Opel: ["Astra", "Corsa", "Mokka", "Zafira"],
    Peugeot: ["308", "408", "3008", "Partner"],
    Citroën: ["C4", "C5 Aircross", "Berlingo"],
    Exeed: ["LX", "TXL", "VX", "RX"],
    Changan: ["CS35 Plus", "CS55 Plus", "UNI-K", "Alsvin"],
    Omoda: ["C5", "S5"],
    Tank: ["300", "500"],
    Jetour: ["Dashing", "X70 Plus", "X90 Plus"]
  };

  // Пользователь в демо — Красногорск
  var USER_POS = { lat: 55.8215, lng: 37.3302, label: "Красногорск" };
  var MARKET_TO = 4600; // медиана цены ТО для демо-авто, ₽
  var M_SERVICES = [
    { id: "s1", name: "Автосервис «[Название]»", town: "Красногорск", address: "[адрес]", lat: 55.8292, lng: 37.3151, hours: "до 21:00", ratingGis: 4.8, reviewsGis: 312, ratingYa: 4.7, reviewsYa: 208, priceTO: 3900, online: true, tires: true, today: "16:30", next: "Сегодня, 16:30", brands: "все марки" },
    { id: "s2", name: "Техцентр «[Название]»", town: "Нахабино", address: "[адрес]", lat: 55.8440, lng: 37.1795, hours: "до 20:00", ratingGis: 4.6, reviewsGis: 184, ratingYa: 4.5, reviewsYa: 97, priceTO: 5200, online: true, tires: false, today: null, next: "Завтра, 10:00", brands: "работает с Kia" },
    { id: "s3", name: "Автосервис «[Название]»", town: "Химки", address: "[адрес]", lat: 55.8960, lng: 37.4300, hours: "круглосуточно", ratingGis: 4.9, reviewsGis: 521, ratingYa: 4.8, reviewsYa: 344, priceTO: 4400, online: true, tires: true, today: "18:00", next: "Сегодня, 18:00", brands: "корейские марки" },
    { id: "s4", name: "Шиномонтаж «[Название]»", town: "Опалиха", address: "[адрес]", lat: 55.8255, lng: 37.2360, hours: "до 22:00", ratingGis: 4.5, reviewsGis: 76, ratingYa: 4.4, reviewsYa: 41, priceTO: null, online: true, tires: true, today: "15:00", next: "Сегодня, 15:00", brands: "шиномонтаж и хранение" },
    { id: "s5", name: "Кузовной центр «[Название]»", town: "Одинцово", address: "[адрес]", lat: 55.6830, lng: 37.2750, hours: "до 20:00", ratingGis: 4.7, reviewsGis: 203, ratingYa: 4.6, reviewsYa: 150, priceTO: 4700, online: false, tires: false, today: null, next: "Пт, 12:00", brands: "все марки" },
    { id: "s6", name: "Автосервис «[Название]»", town: "Дедовск", address: "[адрес]", lat: 55.8690, lng: 37.1250, hours: "до 19:00", ratingGis: 4.3, reviewsGis: 58, ratingYa: 4.2, reviewsYa: 33, priceTO: 3600, online: true, tires: true, today: null, next: "Завтра, 9:30", brands: "все марки" },
    { id: "s7", name: "Техцентр «[Название]»", town: "Долгопрудный", address: "[адрес]", lat: 55.9380, lng: 37.5020, hours: "до 21:00", ratingGis: 4.8, reviewsGis: 410, ratingYa: 4.7, reviewsYa: 265, priceTO: 4900, online: true, tires: false, today: "19:30", next: "Сегодня, 19:30", brands: "Kia, Hyundai" },
    { id: "s8", name: "Автосервис «[Название]»", town: "Истра", address: "[адрес]", lat: 55.9120, lng: 36.8700, hours: "до 20:00", ratingGis: 4.6, reviewsGis: 121, ratingYa: 4.6, reviewsYa: 88, priceTO: 4100, online: true, tires: true, today: null, next: "Завтра, 11:00", brands: "все марки" },
    { id: "s9", name: "Сервис «[Название]»", town: "Лобня", address: "[адрес]", lat: 56.0100, lng: 37.4800, hours: "до 20:00", ratingGis: 4.4, reviewsGis: 95, ratingYa: 4.3, reviewsYa: 60, priceTO: 4300, online: false, tires: true, today: null, next: "Сб, 10:00", brands: "все марки" },
    { id: "s10", name: "Техцентр «[Название]»", town: "Звенигород", address: "[адрес]", lat: 55.7300, lng: 36.8600, hours: "до 19:00", ratingGis: 4.7, reviewsGis: 132, ratingYa: 4.6, reviewsYa: 71, priceTO: 3800, online: true, tires: true, today: "17:00", next: "Сегодня, 17:00", brands: "все марки" }
  ];

  var M_PARTS = [
    { id: "p1", group: "ТО", name: "Фильтр масляный", brand: "Hyundai/Kia", article: "26300-35505", original: true, priceFrom: 690 },
    { id: "p2", group: "ТО", name: "Фильтр масляный", brand: "MANN-FILTER", article: "W 811/80", original: false, priceFrom: 420 },
    { id: "p3", group: "ТО", name: "Фильтр воздушный", brand: "Hyundai/Kia", article: "28113-H8100", original: true, priceFrom: 1150 },
    { id: "p4", group: "ТО", name: "Фильтр салонный", brand: "Hyundai/Kia", article: "97133-H8000", original: true, priceFrom: 980 },
    { id: "p5", group: "Тормоза", name: "Колодки тормозные передние", brand: "Hyundai/Kia", article: "58101-H8A20", original: true, priceFrom: 3900 },
    { id: "p6", group: "Тормоза", name: "Колодки тормозные передние", brand: "Brembo", article: "P 30 055", original: false, priceFrom: 2700 },
    { id: "p7", group: "ТО", name: "Масло моторное 5W-30, 4 л", brand: "Hyundai/Kia", article: "05100-00451", original: true, priceFrom: 3600 },
    { id: "p8", group: "Зажигание", name: "Свеча зажигания", brand: "NGK", article: "LZKR6B-10E", original: false, priceFrom: 520 }
  ];
  var M_SELLERS = [
    { id: "v1", name: "Магазин А", reliability: 96, deliveryDays: 1, delivery: 290, markup: 1.00 },
    { id: "v2", name: "Магазин Б", reliability: 88, deliveryDays: 2, delivery: 0, markup: 1.06 },
    { id: "v3", name: "Магазин В", reliability: 74, deliveryDays: 4, delivery: 490, markup: 0.93 }
  ];

  var M_REGLAMENT = [
    { id: "r1", work: "Замена масла и масляного фильтра", everyKm: 15000, everyMonths: 12, dueKm: 60000, status: "soon" },
    { id: "r2", work: "Замена воздушного фильтра", everyKm: 30000, everyMonths: 24, dueKm: 60000, status: "soon" },
    { id: "r3", work: "Замена салонного фильтра", everyKm: 15000, everyMonths: 12, dueKm: 60000, status: "soon" },
    { id: "r4", work: "Замена тормозной жидкости", everyKm: 45000, everyMonths: 24, dueKm: 45000, status: "overdue" },
    { id: "r5", work: "Замена свечей зажигания", everyKm: 60000, everyMonths: 48, dueKm: 60000, status: "soon" }
  ];

  var M_FINES = [
    { id: "f1", date: "2026-09-14", article: "12.9.2", text: "Превышение скорости на 20–40 км/ч", amount: 500, discountUntil: "2026-10-04", discountAmount: 250 },
    { id: "f2", date: "2026-08-30", article: "12.16.4", text: "Остановка в запрещённом месте", amount: 3000, discountUntil: null, discountAmount: null }
  ];

  /* ---------- Утилиты заглушек ---------- */
  function normPlateKey(p, region) { return String(p || "").toUpperCase().replace(/\s+/g, "") + String(region || ""); }
  function distKm(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function seeded(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

  /* ================= LIVE-адаптеры ================= */
  var VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/";
  function clean(x) { x = (x == null ? "" : String(x)).trim(); return (x === "Not Applicable" || x === "0") ? "" : x; }
  function bodyRu(b) {
    var map = [[/sedan/i, "Седан"], [/hatchback/i, "Хэтчбек"], [/wagon/i, "Универсал"], [/coupe/i, "Купе"],
      [/convertible|cabriolet/i, "Кабриолет"], [/sport utility|SUV|crossover/i, "Внедорожник / кроссовер"],
      [/minivan|MPV/i, "Минивэн"], [/pickup/i, "Пикап"], [/van/i, "Фургон"]];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(b)) return map[i][1];
    return b;
  }
  function titleCase(s) { return s ? s.charAt(0) + s.slice(1).toLowerCase() : s; }
  function vpicDecode(v) {
    return httpGetJson(VPIC + "DecodeVinValues/" + encodeURIComponent(v) + "?format=json").then(function (d) {
      var r = (d && d.Results && d.Results[0]) || {};
      var disp = clean(r.DisplacementL), hp = clean(r.EngineHP), fuel = clean(r.FuelTypePrimary);
      var fuelRu = { Gasoline: "бензин", Diesel: "дизель", Electric: "электро" }[fuel] || fuel;
      var eng = [disp ? (Math.round(parseFloat(disp) * 10) / 10).toFixed(1) : "", fuelRu, hp ? Math.round(hp) + " л.с." : ""].filter(Boolean).join(" ");
      var tr = clean(r.TransmissionStyle);
      var trRu = /Automatic/i.test(tr) ? "Автомат" : /Manual/i.test(tr) ? "Механика" : /CVT/i.test(tr) ? "Вариатор" : tr;
      return {
        make: clean(r.Make) ? titleCase(clean(r.Make)) : "", model: clean(r.Model),
        year: parseInt(clean(r.ModelYear), 10) || null, engine: eng, transmission: trRu,
        body: bodyRu(clean(r.BodyClass)), plantCountry: clean(r.PlantCountry),
        source: "NHTSA vPIC (открытая база)"
      };
    });
  }

  /* ================= ПУБЛИЧНЫЙ API ================= */
  var api = {
    mode: MOCK ? "mock" : "live",
    config: cfg,
    userPosition: function () { return MOCK ? ok(USER_POS) : backend("GET", "/v1/me/position"); },

    vehicle: {
      /** VIN → характеристики. Пустые make/model — база не знает этот VIN. */
      decodeVin: function (vin) {
        if (!MOCK) return vpicDecode(vin);
        var r = M_VINS[vin];
        return ok(Object.assign({ make: "", model: "", year: null, engine: "", transmission: "", body: "", plantCountry: "" },
          r || {}, { source: SRC_MOCK }));
      },
      /** Госномер → VIN и данные авто (в рабочей версии — платный поставщик через бэкенд). */
      findByPlate: function (plate, region) {
        if (!MOCK) return backend("GET", "/v1/vehicles/by-plate?" + qs({ plate: plate, region: region }));
        var hit = M_PLATES[normPlateKey(plate, region)];
        if (!hit) return fail("not_found", "Номер не найден в демо-базе");
        return ok(Object.assign({ vin: hit.vin, mileage: hit.mileage, source: SRC_MOCK }, M_VINS[hit.vin]));
      },
      /** Модели для марки, которой нет в локальном справочнике. */
      modelsForMake: function (make) {
        if (!MOCK) {
          return httpGetJson(VPIC + "GetModelsForMake/" + encodeURIComponent(make) + "?format=json").then(function (d) {
            var names = ((d && d.Results) || []).map(function (x) { return x.Model_Name; }).filter(Boolean);
            return { models: names.filter(function (n, i) { return names.indexOf(n) === i; }).sort(), source: "NHTSA vPIC" };
          });
        }
        var key = Object.keys(M_MODELS).filter(function (k) { return k.toLowerCase() === String(make).toLowerCase(); })[0];
        return ok({ models: key ? M_MODELS[key] : [], source: SRC_MOCK });
      },
      demoPlates: function () { return Object.keys(M_PLATES); }
    },

    maintenance: {
      /** Регламент ТО по авто и пробегу. */
      schedule: function (car) {
        if (!MOCK) return backend("GET", "/v1/maintenance/schedule?" + qs({ vin: car && car.vin, mileage: car && car.mileage }));
        return ok({ items: M_REGLAMENT, source: SRC_MOCK });
      }
    },

    parts: {
      /** Поиск запчастей: оригинал и аналоги. */
      search: function (params) {
        params = params || {};
        if (!MOCK) return backend("GET", "/v1/parts/search?" + qs(params));
        var q = String(params.query || "").toLowerCase();
        var items = M_PARTS.filter(function (p) {
          return !q || (p.name + " " + p.brand + " " + p.article + " " + p.group).toLowerCase().indexOf(q) >= 0;
        });
        return ok({ items: items, source: SRC_MOCK });
      },
      /** Предложения продавцов с итоговой ценой «до двери». */
      offers: function (partId) {
        if (!MOCK) return backend("GET", "/v1/parts/" + encodeURIComponent(partId) + "/offers");
        var p = M_PARTS.filter(function (x) { return x.id === partId; })[0];
        if (!p) return fail("not_found");
        var offers = M_SELLERS.map(function (s) {
          var price = Math.round(p.priceFrom * s.markup / 10) * 10;
          return { sellerId: s.id, seller: s.name, price: price, delivery: s.delivery, total: price + s.delivery,
            deliveryDays: s.deliveryDays, reliability: s.reliability, inStock: true };
        }).sort(function (a, b) { return a.total - b.total; });
        return ok({ part: p, offers: offers, source: SRC_MOCK });
      }
    },

    services: {
      /** Автосервисы рядом. filters: { online, to, today, tires } */
      list: function (params) {
        params = params || {};
        if (!MOCK) return backend("GET", "/v1/services?" + qs({ lat: params.lat, lng: params.lng, online: params.online, to: params.to, today: params.today, tires: params.tires }));
        var from = { lat: params.lat || USER_POS.lat, lng: params.lng || USER_POS.lng };
        var items = M_SERVICES.filter(function (s) {
          return (!params.online || s.online) && (!params.to || s.priceTO) && (!params.today || s.today) && (!params.tires || s.tires);
        }).map(function (s) {
          var o = clone(s);
          o.distanceKm = Math.round(distKm(from, s) * 10) / 10;
          if (s.priceTO) {
            var diff = Math.round((s.priceTO / MARKET_TO - 1) * 100);
            o.priceVerdict = diff > 5 ? "high" : diff < -20 ? "low" : "ok";
            o.priceDiffPct = diff;
          }
          return o;
        }).sort(function (a, b) { return a.distanceKm - b.distanceKm; });
        return ok({ items: items, marketPriceTO: MARKET_TO, origin: from, source: SRC_MOCK });
      },
      /** Свободные окна сервиса на дату (в рабочей версии — API CRM: YCLIENTS и др.). */
      slots: function (serviceId, date) {
        if (!MOCK) return backend("GET", "/v1/services/" + encodeURIComponent(serviceId) + "/slots?" + qs({ date: date }));
        var h = seeded(serviceId + (date || "")), all = ["09:00", "10:00", "11:30", "13:00", "14:30", "16:30", "18:00", "19:30"];
        return ok({ slots: all.filter(function (_, i) { return ((h >> i) & 1) === 1 || i === 5; }), source: SRC_MOCK });
      },
      /** Создать запись. */
      book: function (req) {
        if (!MOCK) return backend("POST", "/v1/bookings", req);
        if (!req || !req.serviceId || !req.slot) return fail("bad_request", "Нужны serviceId и slot");
        return ok({ bookingId: "B-" + (100000 + (seeded(JSON.stringify(req)) % 900000)), status: "confirmed", source: SRC_MOCK });
      }
    },

    fines: {
      /** Неоплаченные штрафы по СТС/госномеру (в рабочей версии — платёжный партнёр с доступом к ГИС ГМП). */
      list: function (car) {
        if (!MOCK) return backend("GET", "/v1/fines?" + qs({ plate: car && car.plate, region: car && car.region }));
        return ok({ items: M_FINES, source: SRC_MOCK });
      },
      pay: function (fineIds) {
        if (!MOCK) return backend("POST", "/v1/fines/pay", { ids: fineIds });
        return ok({ paymentUrl: null, status: "demo", message: "Оплата в прототипе не подключена", source: SRC_MOCK });
      }
    },

    insurance: {
      /** Котировки ОСАГО/КАСКО (в рабочей версии — брокер или агрегатор). */
      quotes: function (car, kind) {
        if (!MOCK) return backend("GET", "/v1/insurance/quotes?" + qs({ vin: car && car.vin, kind: kind || "osago" }));
        return ok({ kind: kind || "osago", items: [
          { insurer: "Страховая А", price: 7840, rating: 4.6 },
          { insurer: "Страховая Б", price: 8210, rating: 4.8 },
          { insurer: "Страховая В", price: 8990, rating: 4.4 }
        ], source: SRC_MOCK });
      }
    },

    tires: {
      /** Когда менять шины: прогноз погоды → рекомендация. */
      advice: function (pos) {
        if (!MOCK) return backend("GET", "/v1/tires/advice?" + qs(pos || {}));
        return ok({ season: "winter", changeFrom: "2026-10-20", reason: "Среднесуточная ниже +5 °C пять дней подряд", source: SRC_MOCK });
      }
    },

    sos: {
      /** Вызов помощи на дороге. */
      request: function (req) {
        if (!MOCK) return backend("POST", "/v1/sos", req);
        return ok({ requestId: "SOS-" + Date.now().toString().slice(-6), etaMin: 35, operator: "Оператор помощи (демо)", source: SRC_MOCK });
      }
    }
  };

  window.AutoHubApi = api;
})();
