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
    { id: "s5", kind: "body", name: "Кузовной центр «[Название]»", town: "Одинцово", address: "[адрес]", lat: 55.6830, lng: 37.2750, hours: "до 20:00", ratingGis: 4.7, reviewsGis: 203, ratingYa: 4.6, reviewsYa: 150, priceTO: 4700, online: false, tires: false, today: null, next: "Пт, 12:00", brands: "все марки" },
    { id: "s6", name: "Автосервис «[Название]»", town: "Дедовск", address: "[адрес]", lat: 55.8690, lng: 37.1250, hours: "до 19:00", ratingGis: 4.3, reviewsGis: 58, ratingYa: 4.2, reviewsYa: 33, priceTO: 3600, online: true, tires: true, today: null, next: "Завтра, 9:30", brands: "все марки" },
    { id: "s7", name: "Техцентр «[Название]»", town: "Долгопрудный", address: "[адрес]", lat: 55.9380, lng: 37.5020, hours: "до 21:00", ratingGis: 4.8, reviewsGis: 410, ratingYa: 4.7, reviewsYa: 265, priceTO: 4900, online: true, tires: false, today: "19:30", next: "Сегодня, 19:30", brands: "Kia, Hyundai" },
    { id: "s8", name: "Автосервис «[Название]»", town: "Истра", address: "[адрес]", lat: 55.9120, lng: 36.8700, hours: "до 20:00", ratingGis: 4.6, reviewsGis: 121, ratingYa: 4.6, reviewsYa: 88, priceTO: 4100, online: true, tires: true, today: null, next: "Завтра, 11:00", brands: "все марки" },
    { id: "s9", name: "Сервис «[Название]»", town: "Лобня", address: "[адрес]", lat: 56.0100, lng: 37.4800, hours: "до 20:00", ratingGis: 4.4, reviewsGis: 95, ratingYa: 4.3, reviewsYa: 60, priceTO: 4300, online: false, tires: true, today: null, next: "Сб, 10:00", brands: "все марки" },
    { id: "s10", name: "Техцентр «[Название]»", town: "Звенигород", address: "[адрес]", lat: 55.7300, lng: 36.8600, hours: "до 19:00", ratingGis: 4.7, reviewsGis: 132, ratingYa: 4.6, reviewsYa: 71, priceTO: 3800, online: true, tires: true, today: "17:00", next: "Сегодня, 17:00", brands: "все марки" },
    { id: "s11", name: "Техцентр «[Название]»", town: "Одинцово", address: "[адрес]", lat: 55.6720, lng: 37.2900, hours: "до 21:00", ratingGis: 4.7, reviewsGis: 356, ratingYa: 4.7, reviewsYa: 190, priceTO: 4200, online: true, tires: true, today: "18:30", next: "Сегодня, 18:30", brands: "все марки" },
    { id: "s12", name: "Автосервис «[Название]»", town: "Мытищи", address: "[адрес]", lat: 55.9050, lng: 37.7400, hours: "до 20:00", ratingGis: 4.6, reviewsGis: 240, ratingYa: 4.5, reviewsYa: 130, priceTO: 4000, online: true, tires: false, today: null, next: "Завтра, 10:00", brands: "все марки" },
    { id: "s13", name: "Техцентр «[Название]»", town: "Подольск", address: "[адрес]", lat: 55.4380, lng: 37.5500, hours: "до 20:00", ratingGis: 4.7, reviewsGis: 198, ratingYa: 4.6, reviewsYa: 112, priceTO: 3950, online: true, tires: true, today: "16:00", next: "Сегодня, 16:00", brands: "все марки" }
  ];

  // Каталог запчастей (демо). cat: filters, brakes, suspension, oils, electrics
  var M_PARTS = [
    { id: "p-hk-26300", cat: "filters", name: "Фильтр масляный", brand: "Hyundai/Kia", article: "26300-35505", original: true, priceMin: 640, priceMax: 910, avg: 760, sellers: 8, days: 0, rating: 4.7, specs: { "Высота": "85 мм", "Резьба": "M20×1,5", "Наружный диаметр": "68 мм", "Клапан": "есть" }, tags: "масло то" },
    { id: "p-mann-w811", cat: "filters", name: "Фильтр масляный", brand: "MANN-FILTER", article: "W 811/80", original: false, priceMin: 412, priceMax: 690, avg: 520, sellers: 11, days: 0, rating: 4.6, specs: { "Высота": "85 мм", "Резьба": "M20×1,5", "Наружный диаметр": "68 мм", "Клапан": "есть" }, tags: "масло то" },
    { id: "p-mahle-oc1051", cat: "filters", name: "Фильтр масляный", brand: "Mahle", article: "OC 1051", original: false, priceMin: 455, priceMax: 640, avg: 540, sellers: 5, days: 2, rating: 4.5, specs: { "Высота": "86 мм", "Резьба": "M20×1,5", "Наружный диаметр": "68 мм", "Клапан": "есть" }, tags: "масло то" },
    { id: "p-hk-28113", cat: "filters", name: "Фильтр воздушный", brand: "Hyundai/Kia", article: "28113-H8100", original: true, priceMin: 590, priceMax: 880, avg: 700, sellers: 9, days: 1, rating: 4.7, specs: { "Длина": "245 мм", "Ширина": "191 мм", "Высота": "48 мм" }, tags: "то" },
    { id: "p-filtron-ap", cat: "filters", name: "Фильтр воздушный", brand: "Filtron", article: "AP 185/5", original: false, priceMin: 380, priceMax: 560, avg: 450, sellers: 7, days: 1, rating: 4.4, specs: { "Длина": "245 мм", "Ширина": "191 мм", "Высота": "46 мм" }, tags: "то" },
    { id: "p-hk-97133", cat: "filters", name: "Фильтр салонный", brand: "Hyundai/Kia", article: "97133-H8000", original: true, priceMin: 540, priceMax: 820, avg: 650, sellers: 10, days: 0, rating: 4.6, specs: { "Тип": "угольный", "Длина": "215 мм" }, tags: "то салон" },
    { id: "p-hk-58101", cat: "brakes", name: "Колодки тормозные передние", brand: "Hyundai/Kia", article: "58101-H8A20", original: true, priceMin: 3900, priceMax: 4800, avg: 4200, sellers: 6, days: 1, rating: 4.8, specs: { "Толщина": "17 мм", "Датчик износа": "есть", "Ось": "передняя" }, tags: "колодки тормоз" },
    { id: "p-brembo-p30", cat: "brakes", name: "Колодки тормозные передние", brand: "Brembo", article: "P 30 055", original: false, priceMin: 2480, priceMax: 3300, avg: 2800, sellers: 9, days: 0, rating: 4.7, specs: { "Толщина": "17 мм", "Датчик износа": "нет", "Ось": "передняя" }, tags: "колодки тормоз" },
    { id: "p-trw-disc", cat: "brakes", name: "Диск тормозной передний", brand: "TRW", article: "DF 6624", original: false, priceMin: 2950, priceMax: 3900, avg: 3300, sellers: 6, days: 2, rating: 4.6, specs: { "Диаметр": "256 мм", "Толщина": "22 мм", "Вентилируемый": "да" }, tags: "диск тормоз" },
    { id: "p-kyb-339", cat: "suspension", name: "Амортизатор передний", brand: "KYB", article: "339 7058", original: false, priceMin: 4700, priceMax: 6100, avg: 5300, sellers: 7, days: 1, rating: 4.7, specs: { "Тип": "газомасляный", "Сторона": "левая" }, tags: "амортизатор стойка" },
    { id: "p-hk-54651", cat: "suspension", name: "Амортизатор передний", brand: "Hyundai/Kia", article: "54651-H8000", original: true, priceMin: 7600, priceMax: 9400, avg: 8300, sellers: 4, days: 3, rating: 4.8, specs: { "Тип": "газомасляный", "Сторона": "левая" }, tags: "амортизатор стойка" },
    { id: "p-lemf-link", cat: "suspension", name: "Стойка стабилизатора", brand: "Lemförder", article: "39574 01", original: false, priceMin: 890, priceMax: 1300, avg: 1050, sellers: 8, days: 1, rating: 4.6, specs: { "Длина": "275 мм", "Сторона": "любая" }, tags: "стабилизатор тяга" },
    { id: "p-hk-oil", cat: "oils", name: "Масло моторное 5W-30, 4 л", brand: "Hyundai/Kia", article: "05100-00451", original: true, priceMin: 3150, priceMax: 3900, avg: 3450, sellers: 12, days: 0, rating: 4.8, specs: { "Вязкость": "5W-30", "Объём": "4 л", "Допуск": "ACEA C3" }, tags: "масло то" },
    { id: "p-shell-oil", cat: "oils", name: "Масло моторное 5W-30, 4 л", brand: "Shell Helix", article: "550046375", original: false, priceMin: 2890, priceMax: 3500, avg: 3100, sellers: 14, days: 0, rating: 4.6, specs: { "Вязкость": "5W-30", "Объём": "4 л", "Допуск": "ACEA A3/B4" }, tags: "масло то" },
    { id: "p-atf", cat: "oils", name: "Масло АКПП SP-IV, 1 л", brand: "Hyundai/Kia", article: "04500-00115", original: true, priceMin: 1150, priceMax: 1500, avg: 1300, sellers: 8, days: 1, rating: 4.7, specs: { "Тип": "ATF SP-IV", "Объём": "1 л" }, tags: "акпп коробка" },
    { id: "p-ngk-spark", cat: "electrics", name: "Свеча зажигания", brand: "NGK", article: "LZKR6B-10E", original: false, priceMin: 520, priceMax: 720, avg: 600, sellers: 10, days: 0, rating: 4.7, specs: { "Зазор": "1,0 мм", "Резьба": "M14" }, tags: "свечи зажигание то" },
    { id: "p-varta-akb", cat: "electrics", name: "Аккумулятор 60 А·ч", brand: "Varta", article: "560 409 054", original: false, priceMin: 8900, priceMax: 11200, avg: 9800, sellers: 9, days: 1, rating: 4.8, specs: { "Ёмкость": "60 А·ч", "Пусковой ток": "540 А", "Полярность": "обратная" }, tags: "акб батарея" },
    { id: "p-osram-h4", cat: "electrics", name: "Лампа фары H4", brand: "Osram", article: "64193", original: false, priceMin: 390, priceMax: 620, avg: 480, sellers: 11, days: 0, rating: 4.5, specs: { "Цоколь": "H4", "Мощность": "60/55 Вт" }, tags: "лампа свет" }
  ];
  var TO_KIT = ["p-mann-w811", "p-hk-28113", "p-hk-97133", "p-hk-oil", "p-ngk-spark"];
  var CAT_NAMES = { filters: "Фильтры", brakes: "Тормоза", suspension: "Подвеска", oils: "Масла", electrics: "Электрика" };
  // Продавцы: задержка доставки (дней), стоимость доставки, наценка к минимальной цене
  var SELLERS = {
    A: { name: "Магазин А", reliability: 98, delivery: 199, days: 1, when: "доставка завтра", stock: "12 шт", markup: 1.00 },
    B: { name: "Магазин Б", reliability: 97, delivery: 249, days: 0, when: "доставка сегодня", stock: "в наличии 3 шт", markup: 1.07 },
    C: { name: "Магазин В", reliability: 99, delivery: 150, days: 2, when: "доставка 2–3 дня", stock: "40 шт", markup: 1.20 },
    D: { name: "Магазин Г", reliability: 71, delivery: 250, days: 6, when: "под заказ 5–7 дней", stock: "под заказ", markup: 0.95 }
  };
  function sellerPrice(p, k) { return Math.round(p.priceMin * SELLERS[k].markup / 10) * 10 + (k === "A" ? p.priceMin - Math.round(p.priceMin / 10) * 10 : 0); }

  /* ---------- Регламент ТО (демо: типичный для Kia Rio / Hyundai Solaris 1.6) ---------- */
  var TO_STEP = 15000;
  var REGULATION = [
    { key: "oil", work: "Замена моторного масла", every: 15000, part: "oil", qty: 1, extra: 0 },
    { key: "oilf", work: "Замена масляного фильтра", every: 15000, part: "oilf", qty: 1, extra: 0 },
    { key: "cabin", work: "Замена салонного фильтра", every: 15000, part: "cabin", qty: 1, extra: 150 },
    { key: "diag", work: "Осмотр ходовой, тормозов и жидкостей", every: 15000, part: null, extra: 0 },
    { key: "air", work: "Замена воздушного фильтра", every: 30000, part: "air", qty: 1, extra: 200 },
    { key: "brake", work: "Замена тормозной жидкости", every: 30000, part: "brake", qty: 1, extra: 800 },
    { key: "plugs", work: "Замена свечей зажигания", every: 60000, part: "plugs", qty: 4, extra: 900 }
  ];
  var PART_TITLES = { oil: "Моторное масло 5W-30, 4 л", oilf: "Масляный фильтр", cabin: "Салонный фильтр", air: "Воздушный фильтр", brake: "Тормозная жидкость DOT 4, 1 л", plugs: "Свеча зажигания" };
  // Варианты деталей под каждую позицию ТО: бренд, артикул, оригинал, рейтинг и число отзывов, базовая цена за штуку
  var TO_PARTS = {
    oil: [["Hyundai/Kia", "05100-00451", 1, 4.8, 1240, 3150], ["Shell Helix HX8", "550046375", 0, 4.7, 3100, 2890], ["ZIC X9", "162614", 0, 4.6, 2100, 2450], ["Лукойл Генезис", "3148675", 0, 4.3, 900, 2150]],
    oilf: [["Hyundai/Kia", "26300-35505", 1, 4.8, 610, 640], ["MANN-FILTER", "W 811/80", 0, 4.8, 1450, 412], ["Mahle", "OC 1051", 0, 4.6, 380, 455], ["Big Filter", "GB-1076", 0, 4.2, 210, 230]],
    cabin: [["Hyundai/Kia", "97133-H8000", 1, 4.7, 320, 540], ["MANN-FILTER", "CUK 1919", 0, 4.8, 540, 610], ["Filtron", "K 1329A", 0, 4.5, 260, 390], ["Nevsky Filter", "NF-6159", 0, 4.1, 120, 260]],
    air: [["Hyundai/Kia", "28113-H8100", 1, 4.7, 290, 590], ["MANN-FILTER", "C 26 017", 0, 4.7, 410, 560], ["Filtron", "AP 185/5", 0, 4.4, 230, 380], ["Sakura", "A-28260", 0, 4.2, 150, 330]],
    brake: [["Hyundai/Kia", "01100-00130", 1, 4.7, 180, 780], ["ATE SL.6", "03.9901-6402.2", 0, 4.9, 870, 890], ["Bosch", "1987479107", 0, 4.6, 640, 520], ["Rosdot 4", "430101H03", 0, 4.3, 1300, 330]],
    plugs: [["Hyundai/Kia", "18855-10060", 1, 4.7, 240, 690], ["NGK", "LZKR6B-10E", 0, 4.8, 1900, 520], ["Denso", "XU22TT", 0, 4.6, 400, 610], ["Bosch", "FR7DC+", 0, 4.3, 520, 260]]
  };
  // Площадки-продавцы (мок-интеграции): наценка к базовой цене, срок доставки в днях, доставка в сервис
  var MARKETS = {
    exist: { name: "Exist", k: 1.04, days: 2, delivery: 199 },
    emex: { name: "Emex", k: 0.97, days: 4, delivery: 249 },
    autopiter: { name: "Автопитер", k: 1.00, days: 3, delivery: 0 },
    zzap: { name: "ZZap", k: 0.94, days: 6, delivery: 290 },
    autodoc: { name: "Autodoc", k: 1.03, days: 1, delivery: 150 }
  };
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function partOptions(slot) {
    return (TO_PARTS[slot] || []).map(function (r) {
      var id = slot + ":" + r[1];
      var offers = Object.keys(MARKETS).map(function (m, i) {
        var mk = MARKETS[m], h = hashStr(id + m);
        return { market: m, marketName: mk.name, price: Math.round(r[5] * mk.k * (0.98 + (h % 5) / 100)), days: mk.days + (h % 2),
          delivery: mk.delivery, inStock: (h % 7) !== 0 };
      }).filter(function (o) { return o.inStock; });
      // Лучшее предложение: цена с поправкой на срок (день ожидания «стоит» 25 ₽)
      var best = offers.slice().sort(function (a, b) { return (a.price + a.days * 25) - (b.price + b.days * 25); })[0];
      return { id: id, slot: slot, name: PART_TITLES[slot], brand: r[0], article: r[1], original: !!r[2], rating: r[3], reviews: r[4],
        offers: offers.sort(function (a, b) { return a.price - b.price; }), best: best };
    });
  }
  // Три понятных варианта: оригинал, оптимальный (лучший рейтинг среди аналогов), дешёвый (из проверенных, рейтинг ≥ 4,0)
  function pickTiers(opts) {
    var orig = opts.filter(function (o) { return o.original; })[0];
    var analogs = opts.filter(function (o) { return !o.original && o.reviews >= 200; });
    var optimal = analogs.sort(function (a, b) { return b.rating - a.rating || a.best.price - b.best.price; })[0] || orig;
    var cheap = opts.filter(function (o) { return o.rating >= 4.0; }).sort(function (a, b) { return a.best.price - b.best.price; })[0];
    return { original: orig, optimal: optimal, cheap: cheap };
  }
  function nextTO(car) {
    car = car || {};
    var m = car.mileage || 0;
    var km = car.lastTOkm ? car.lastTOkm + TO_STEP : (Math.floor(m / TO_STEP) + 1) * TO_STEP;
    if (car.lastTOkm && m > km + TO_STEP) km = (Math.floor(m / TO_STEP) + 1) * TO_STEP; // пропущено несколько ТО
    var items = REGULATION.filter(function (r) { return km % r.every === 0; });
    var left = km - m;
    return { km: km, left: left, overdue: m > 0 && left < 0, soon: m > 0 && left <= 2000, noMileage: !m, items: items,
      parts: items.filter(function (r) { return r.part; }) };
  }

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
      step: TO_STEP,
      regulation: REGULATION,
      markets: MARKETS,
      /** Очередное ТО по пробегу и последнему ТО (синхронно — расчёт на телефоне). */
      nextTO: nextTO,
      /** Варианты деталей для позиции ТО с предложениями площадок и тремя уровнями выбора. */
      options: function (slot) {
        if (!MOCK) return backend("GET", "/v1/maintenance/parts?" + qs({ slot: slot }));
        var opts = partOptions(slot);
        return ok({ slot: slot, title: PART_TITLES[slot], options: opts, tiers: pickTiers(opts), source: SRC_MOCK });
      },
      /** Стоимость работ сервиса для набора работ ТО. */
      worksPrice: function (service, items) {
        return (service.priceTO || 4000) + items.reduce(function (s, r) { return s + (r.extra || 0); }, 0);
      }
    },

    parts: {
      categories: CAT_NAMES,
      sellers: SELLERS,
      /** Поиск запчастей: оригинал и аналоги. params: { query, cat, kit } */
      search: function (params) {
        params = params || {};
        if (!MOCK) return backend("GET", "/v1/parts/search?" + qs(params));
        var n = function (x) { return String(x || "").toLowerCase().replace(/ё/g, "е").replace(/[\s\-\/]/g, ""); };
        var words = String(params.query || "").toLowerCase().replace(/ё/g, "е").split(/\s+/).filter(Boolean);
        var items = M_PARTS.filter(function (p) {
          if (params.kit) return TO_KIT.indexOf(p.id) >= 0;
          if (params.cat && p.cat !== params.cat) return false;
          if (!words.length) return true;
          var hay = (p.name + " " + p.brand + " " + p.tags + " " + CAT_NAMES[p.cat]).toLowerCase().replace(/ё/g, "е");
          var art = n(p.article);
          return words.every(function (w) { return hay.indexOf(w.slice(0, Math.max(4, w.length - 2))) >= 0 || art.indexOf(n(w)) >= 0; });
        });
        return ok({ items: items, source: SRC_MOCK });
      },
      find: function (partId) { return clone(M_PARTS.filter(function (x) { return x.id === partId; })[0] || null); },
      get: function (partId) {
        var p = M_PARTS.filter(function (x) { return x.id === partId; })[0];
        return p ? ok(p) : fail("not_found");
      },
      /** Цена у каждого продавца (для корзины: «собрать у одного»). */
      priceTable: function (partId) {
        var p = M_PARTS.filter(function (x) { return x.id === partId; })[0], t = {};
        if (p) Object.keys(SELLERS).forEach(function (k) { t[k] = sellerPrice(p, k); });
        return t;
      },
      /** Предложения продавцов с итоговой ценой «до двери». */
      offers: function (partId) {
        if (!MOCK) return backend("GET", "/v1/parts/" + encodeURIComponent(partId) + "/offers");
        var p = M_PARTS.filter(function (x) { return x.id === partId; })[0];
        if (!p) return fail("not_found");
        var offers = Object.keys(SELLERS).map(function (k) {
          var s = SELLERS[k], price = sellerPrice(p, k);
          return { seller: k, sellerName: s.name, price: price, delivery: s.delivery, total: price + s.delivery,
            days: s.days + p.days, when: s.when, stock: s.stock, reliability: s.reliability };
        });
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
