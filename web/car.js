/* АвтоХаб: добавление автомобиля и карточка авто.
 * Данные запрашиваются только через window.AutoHubApi (web/api.js):
 * в режиме mock — заглушки с демо-данными, в режиме live — NHTSA vPIC и бэкенд.
 * Локально: расшифровка кода производителя (WMI) и модельного года, справочник марок и моделей.
 */
(function () {
  "use strict";

  var STORE_KEY = "autohub.car.v1";
  var API = function () { return window.AutoHubApi; };

  /* ---------- Локальные справочники ---------- */
  // Коды производителей (WMI). Справочно; заводы и коды могут меняться.
  var WMI = {
    XTA: ["Lada", "АвтоВАЗ, Россия"], XTT: ["УАЗ", "УАЗ, Россия"], X96: ["ГАЗ", "ГАЗ, Россия"],
    XTC: ["КАМАЗ", "КАМАЗ, Россия"], X4X: ["BMW", "Автотор, Россия"], XWE: ["Kia", "Автотор, Россия"],
    XW8: ["Volkswagen", "Калуга, Россия"], X7L: ["Renault", "Москва, Россия"],
    Z94: ["Hyundai / Kia", "Санкт-Петербург, Россия"], Z8N: ["Nissan", "Санкт-Петербург, Россия"],
    XUF: ["Chevrolet", "Санкт-Петербург, Россия"], X9L: ["Chevrolet Niva", "GM-АвтоВАЗ, Россия"],
    Z8T: ["Peugeot / Citroën / Mitsubishi", "Калуга, Россия"],
    KMH: ["Hyundai", "Корея"], KNA: ["Kia", "Корея"], KND: ["Kia", "Корея"], KNE: ["Kia", "Корея"],
    WVW: ["Volkswagen", "Германия"], WV1: ["Volkswagen", "Германия"], WV2: ["Volkswagen", "Германия"],
    WBA: ["BMW", "Германия"], WDB: ["Mercedes-Benz", "Германия"], WDD: ["Mercedes-Benz", "Германия"],
    W1K: ["Mercedes-Benz", "Германия"], WAU: ["Audi", "Германия"], TMB: ["Škoda", "Чехия"],
    VF1: ["Renault", "Франция"], VF3: ["Peugeot", "Франция"], VF7: ["Citroën", "Франция"],
    JN1: ["Nissan", "Япония"], SJN: ["Nissan", "Великобритания"], JMZ: ["Mazda", "Япония"],
    JMB: ["Mitsubishi", "Япония"], JHM: ["Honda", "Япония"], JF1: ["Subaru", "Япония"],
    YV1: ["Volvo", "Швеция"], ZFA: ["Fiat", "Италия"], SAL: ["Land Rover", "Великобритания"],
    LVV: ["Chery", "Китай"], L6T: ["Geely", "Китай"], LGW: ["Haval / Great Wall", "Китай"], "5YJ": ["Tesla", "США"]
  };
  var WMI2 = { JT: ["Toyota", "Япония"] };
  var COUNTRY1 = { J: "Япония", K: "Корея", L: "Китай", S: "Великобритания", W: "Германия", V: "Франция / Испания",
    Y: "Швеция / Финляндия", "1": "США", "4": "США", "5": "США", "2": "Канада", "3": "Мексика", X: "Россия / СНГ" };

  var MODELS = {
    "Lada": ["Granta", "Vesta", "Niva Legend", "Niva Travel", "Largus", "XRAY", "Iskra"],
    "Kia": ["Rio", "Ceed", "Cerato", "Sportage", "Sorento", "Seltos", "K5", "Soul"],
    "Hyundai": ["Solaris", "Creta", "Elantra", "Sonata", "Tucson", "Santa Fe"],
    "Toyota": ["Camry", "Corolla", "RAV4", "Land Cruiser", "Land Cruiser Prado", "Highlander"],
    "Volkswagen": ["Polo", "Jetta", "Passat", "Tiguan", "Touareg"],
    "Škoda": ["Rapid", "Octavia", "Karoq", "Kodiaq", "Superb"],
    "Renault": ["Logan", "Sandero", "Duster", "Kaptur", "Arkana"],
    "Nissan": ["Almera", "Qashqai", "X-Trail", "Terrano", "Juke"],
    "Haval": ["Jolion", "F7", "H6", "Dargo", "M6"],
    "Chery": ["Tiggo 4 Pro", "Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 8"],
    "Geely": ["Coolray", "Atlas", "Monjaro", "Emgrand", "Tugella"],
    "Mazda": ["3", "6", "CX-5", "CX-9"],
    "Mitsubishi": ["ASX", "Outlander", "Pajero Sport", "Lancer"],
    "Chevrolet": ["Cruze", "Aveo", "Lacetti", "Niva"],
    "Ford": ["Focus", "Mondeo", "Kuga", "EcoSport"],
    "BMW": ["3 Series", "5 Series", "X1", "X3", "X5"],
    "Mercedes-Benz": ["C-Class", "E-Class", "GLC", "GLE"],
    "Audi": ["A4", "A6", "Q3", "Q5", "Q7"],
    "УАЗ": ["Патриот", "Хантер", "Буханка"]
  };

  // Демо-авто из макетов: показывается, пока пользователь не добавил своё
  var DEMO_CAR = { make: "Kia", model: "Rio IV", year: 2019, engine: "1.6 MPI", transmission: "АКПП", body: "седан",
    plate: "А123ВС", region: "177", vin: "XWEFC41ABKC001234", mileage: 58400, demo: true };

  var YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

  /* ---------- Утилиты ---------- */
  var PLATE_LETTERS = "АВЕКМНОРСТУХ";
  var LAT2CYR = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };
  function normPlate(s) {
    return (s || "").toUpperCase().replace(/\s+/g, "").split("").map(function (ch) { return LAT2CYR[ch] || ch; }).join("");
  }
  function validPlate(p, region) {
    var re = new RegExp("^[" + PLATE_LETTERS + "]\\d{3}[" + PLATE_LETTERS + "]{2}$");
    return re.test(p) && /^\d{2,3}$/.test(region || "");
  }
  function fmtPlate(p, region) {
    if (!p) return "";
    return p.charAt(0) + " " + p.substr(1, 3) + " " + p.substr(4, 2) + (region ? " " + region : "");
  }
  function normVin(s) { return (s || "").toUpperCase().replace(/[\s-]/g, ""); }
  function vinError(v) {
    if (v.length !== 17) return "В VIN должно быть 17 символов, сейчас " + v.length + ".";
    if (/[IOQ]/.test(v)) return "В VIN не бывает букв I, O и Q — возможно, это цифры 1 и 0.";
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return "VIN может содержать только латинские буквы и цифры.";
    return "";
  }
  function modelYear(v) {
    var idx = YEAR_CODES.indexOf(v.charAt(9));
    if (idx < 0) return null;
    var maxYear = new Date().getFullYear() + 1, y = 1980 + idx;
    while (y + 30 <= maxYear) y += 30;
    return y;
  }
  function decodeLocal(v) {
    var w = WMI[v.substr(0, 3)] || WMI2[v.substr(0, 2)];
    return {
      make: w ? w[0] : "",
      plant: w ? w[1] : (COUNTRY1[v.charAt(0)] || ""),
      year: modelYear(v)
    };
  }
  /* ---------- Гараж: несколько машин, одна активная ---------- */
  var GARAGE_KEY = "autohub.garage.v1";
  function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function demoCar() { return Object.assign({ id: "demo" }, DEMO_CAR); }
  function loadGarage() {
    try {
      var g = JSON.parse(localStorage.getItem(GARAGE_KEY) || "null");
      if (g && g.cars && g.cars.length) return g;
    } catch (e) {}
    var old = null; // перенос машины из версии 0.4 (одна машина)
    try { old = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) {}
    var c = old ? Object.assign({ id: uid() }, old) : demoCar();
    return { cars: [c], activeId: c.id };
  }
  function saveGarage(g) { try { localStorage.setItem(GARAGE_KEY, JSON.stringify(g)); } catch (e) {} }
  function activeCar(g) {
    g = g || loadGarage();
    return g.cars.filter(function (c) { return c.id === g.activeId; })[0] || g.cars[0];
  }
  /** Добавить машину. Демо-машина уходит, когда появляется своя; совпадение по VIN или номеру — обновление. */
  function addCar(car) {
    var g = loadGarage();
    g.cars = g.cars.filter(function (c) { return !c.demo; });
    var dup = g.cars.filter(function (c) {
      return (car.vin && c.vin === car.vin) || (!car.vin && car.plate && c.plate === car.plate && c.region === car.region);
    })[0];
    if (dup) { var id = dup.id; Object.assign(dup, car); dup.id = id; dup.demo = false; g.activeId = id; }
    else { car.id = uid(); car.demo = false; g.cars.push(car); g.activeId = car.id; }
    saveGarage(g); refresh();
    return !!dup;
  }
  function setActive(id) { var g = loadGarage(); g.activeId = id; saveGarage(g); refresh(); }
  function removeCar(id) {
    var g = loadGarage();
    g.cars = g.cars.filter(function (c) { return c.id !== id; });
    if (!g.cars.length) g.cars = [demoCar()];
    if (g.activeId === id) g.activeId = g.cars[0].id;
    saveGarage(g); refresh();
  }
  function updateActive(patch) { var g = loadGarage(), c = activeCar(g); Object.assign(c, patch); saveGarage(g); refresh(); }

  function carView(c) {
    var name = [c.make, c.model].filter(Boolean).join(" ") || "Мой автомобиль";
    return {
      name: name,
      specs: [c.year, c.engine, c.transmission, c.body].filter(Boolean).join(" · ") || "характеристики не указаны",
      chip: [name, (c.engine || "").split(" ").slice(0, 2).join(" "), c.year].filter(Boolean).join(" · "),
      plate: c.plate ? fmtPlate(c.plate, c.region) : "номер не указан",
      vinMasked: c.vin ? c.vin.substr(0, 3) + "•••••" + c.vin.substr(13) : "не указан",
      mileage: c.mileage ? Number(c.mileage).toLocaleString("ru-RU") + " км" : "не указан"
    };
  }
  function applyCar(c) {
    c = c || activeCar();
    var v = carView(c);
    document.querySelectorAll("[data-car]").forEach(function (el) {
      var k = el.getAttribute("data-car");
      if (v[k] != null) el.textContent = v[k];
    });
  }

  /* ---------- UI экрана «Добавить авто» ---------- */
  var ON = "height: 44px; border-radius: 10px; border: none; background: #FFFFFF; font-size: 14px; font-weight: 700; color: #17191C; box-shadow: 0 1px 2px rgba(0,0,0,0.08); cursor: pointer";
  var OFF = "height: 44px; border-radius: 10px; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #5B5F66; cursor: pointer";
  var $ = function (id) { return document.getElementById(id); };
  var draft = {};

  function setTab(t) {
    document.querySelectorAll(".cartab").forEach(function (b) {
      b.setAttribute("style", b.dataset.tab === t ? ON : OFF);
      b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false");
    });
    document.querySelectorAll(".tabpane").forEach(function (p) { p.style.display = p.dataset.pane === t ? "flex" : "none"; });
  }
  function showErr(id, msg) { var e = $(id); e.textContent = msg || ""; e.hidden = !msg; }
  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Ищем…"; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
  function field(label, val, mono) {
    return '<div><div style="color:#5B5F66">' + label + '</div><div style="font-weight:600' +
      (mono ? ";font-family:'JetBrains Mono',monospace;font-weight:500" : "") + '">' + esc(val || "—") + "</div></div>";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderResult(c, kind, source, note) {
    draft = Object.assign({}, draft, c);
    var ok = kind === "full";
    $("resStatus").innerHTML = ok
      ? '<span class="dot ok">✓</span>Автомобиль найден'
      : '<span class="dot part">!</span>Найдено частично';
    var nm = [draft.make, draft.model].filter(Boolean).join(" ");
    $("resTitle").textContent = nm ? nm + (draft.year ? ", " + draft.year : "") : "Марка не определена";
    $("resGrid").innerHTML =
      field("Двигатель", draft.engine) + field("КПП", draft.transmission) +
      field("Кузов", draft.body) + field("Сборка", draft.plant) +
      (draft.vin ? field("VIN", carView(draft).vinMasked, true) : "") +
      (draft.plate ? field("Госномер", fmtPlate(draft.plate, draft.region), true) : "");
    $("resNote").hidden = !note; $("resNote").textContent = note || "";
    $("resRefine").hidden = ok;
    $("resSource").textContent = source;
    $("milInput").value = draft.mileage || "";
    var box = $("carResult"); box.hidden = false; box.style.display = "flex";
    $("saveCar").disabled = !draft.make;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function onVinFind() {
    var v = normVin($("vinInput").value); $("vinInput").value = v;
    var err = vinError(v); showErr("vinErr", err); if (err) return;
    var loc = decodeLocal(v), btn = $("vinFind");
    busy(btn, true, "Ищем в базе…");
    draft = { vin: v, plate: draft.plate, region: draft.region, plant: loc.plant };
    API().vehicle.decodeVin(v).then(function (r) {
      var c = {
        make: r.make || loc.make, model: r.model, year: r.year || loc.year,
        engine: r.engine, transmission: r.transmission, body: r.body,
        plant: loc.plant || r.plantCountry
      };
      var full = !!(c.make && c.model);
      var mock = API().mode === "mock";
      renderResult(c, full ? "full" : "partial",
        "Источники: " + r.source + " и код производителя в VIN",
        full ? "" : mock
          ? "Этого VIN нет в демо-базе. Производитель и год определены по VIN — уточните модель вручную."
          : "В открытой базе нет модели для этого VIN — так бывает с машинами не для рынка США. Уточните модель вручную, остальное уже заполнено.");
    }, function () {
      renderResult({ make: loc.make, year: loc.year, plant: loc.plant }, "partial",
        "Источник: код производителя в VIN (без интернета)",
        "Не удалось связаться с базой. Мы определили производителя и год по VIN — уточните модель вручную.");
    }).then(function () { busy(btn, false); });
  }

  function onPlateFind() {
    var p = normPlate($("plateInput").value), r = ($("regionInput").value || "").trim();
    $("plateInput").value = p;
    if (!validPlate(p, r)) { showErr("plateErr", "Формат: буква, три цифры, две буквы и регион — например, А123ВС 77."); return; }
    showErr("plateErr", "");
    $("plateMsg").hidden = true;
    var btn = $("plateFind");
    busy(btn, true, "Ищем по номеру…");
    API().vehicle.findByPlate(p, r).then(function (car) {
      var loc = decodeLocal(car.vin || "");
      draft = { vin: car.vin, plate: p, region: r, plant: loc.plant || car.plantCountry, mileage: car.mileage };
      renderResult({ make: car.make, model: car.model, year: car.year || loc.year, engine: car.engine,
        transmission: car.transmission, body: car.body }, car.make && car.model ? "full" : "partial",
        "Источник: " + (car.source || "поиск по госномеру"), "");
    }, function (e) {
      draft.plate = p; draft.region = r;
      var mock = API().mode === "mock";
      $("plateMsgTitle").textContent = e.code === "not_found" ? "Номер не нашли — найдём по VIN" : "Номер сохраним, данные найдём по VIN";
      $("plateMsgText").textContent = mock
        ? "В демо-базе есть номера " + API().vehicle.demoPlates().map(function (k) { return fmtPlate(k.slice(0, 6), k.slice(6)); }).join(", ") + ". Для других номеров введите VIN из СТС."
        : "Поиск по госномеру пока не подключён: такие данные есть только у платных поставщиков. Введите VIN из СТС, это займёт минуту.";
      $("plateMsg").hidden = false; $("plateMsg").style.display = "flex";
    }).then(function () { busy(btn, false); });
  }

  function fillYears() {
    var sel = $("yrSel"), y = new Date().getFullYear() + 1, html = '<option value="">—</option>';
    for (var i = y; i >= 1985; i--) html += "<option>" + i + "</option>";
    sel.innerHTML = html;
  }
  // Русские написания марок — чтобы «лада» или «хендай» тоже находили марку
  var MAKE_ALIASES = {
    "Lada": ["Лада", "ВАЗ", "Жигули"], "Kia": ["Киа", "Кия"], "Hyundai": ["Хендай", "Хендэ", "Хёндэ", "Хундай"],
    "Toyota": ["Тойота"], "Volkswagen": ["Фольксваген", "VW"], "Škoda": ["Шкода", "Skoda"], "Renault": ["Рено"],
    "Nissan": ["Ниссан"], "Haval": ["Хавал", "Хавейл"], "Chery": ["Чери"], "Geely": ["Джили"], "Mazda": ["Мазда"],
    "Mitsubishi": ["Мицубиси", "Митсубиши"], "Chevrolet": ["Шевроле"], "Ford": ["Форд"], "BMW": ["БМВ"],
    "Mercedes-Benz": ["Мерседес", "Mercedes"], "Audi": ["Ауди"], "УАЗ": ["UAZ"]
  };
  var modelOptions = [];
  function fillMakes() {
    var makes = Object.keys(MODELS).sort().map(function (m) { return { value: m, aliases: MAKE_ALIASES[m] || [] }; });
    window.AutoHubUI.suggest($("mkInput"), function () { return makes; }, { min: 2 });
    window.AutoHubUI.suggest($("mdInput"), function () { return modelOptions; }, { min: 2 });
  }
  var modelsReq = 0;
  function onMakeChange() {
    var mk = $("mkInput").value.trim(), hint = $("mdHint"), req = ++modelsReq;
    var nmk = window.AutoHubUI.norm(mk);
    var key = Object.keys(MODELS).filter(function (k) {
      return window.AutoHubUI.norm(k) === nmk || (MAKE_ALIASES[k] || []).some(function (a) { return window.AutoHubUI.norm(a) === nmk; });
    })[0];
    if (key) {
      if (key !== mk) $("mkInput").value = key;
      modelOptions = MODELS[key].slice(); hint.textContent = "Начните вводить модель — например, «" + MODELS[key][0].slice(0, 2) + "»"; return;
    }
    modelOptions = [];
    if (mk.length < 2) { hint.textContent = ""; return; }
    hint.textContent = "Загружаем модели…";
    API().vehicle.modelsForMake(mk).then(function (d) {
      if (req !== modelsReq) return;
      var names = d.models || [];
      modelOptions = names.slice(0, 300);
      hint.textContent = names.length ? "Моделей найдено: " + names.length + " · " + d.source : "Моделей в базе нет — введите название вручную.";
    }, function () { if (req === modelsReq) hint.textContent = "Нет связи с базой — введите модель вручную."; });
  }
  function onModelApply() {
    var mk = $("mkInput").value.trim(), md = $("mdInput").value.trim();
    if (!mk || !md) { showErr("modelErr", "Укажите марку и модель."); return; }
    showErr("modelErr", "");
    renderResult({ make: mk, model: md, year: parseInt($("yrSel").value, 10) || draft.year || null,
      engine: $("engInput").value.trim() || draft.engine }, "full",
      draft.vin ? "Источники: VIN и уточнение вручную" : "Указано вручную", "");
  }
  function onRefine() {
    $("mkInput").value = (draft.make || "").split(" / ")[0];
    if (draft.year) $("yrSel").value = String(draft.year);
    if (draft.engine) $("engInput").value = draft.engine;
    onMakeChange(); setTab("model"); $("mdInput").focus();
  }
  function onSave() {
    var mil = parseInt(($("milInput").value || "").replace(/\D/g, ""), 10);
    if (mil) draft.mileage = mil;
    draft.savedAt = new Date().toISOString();
    var car = Object.assign({}, draft); delete car.id;
    var updated = addCar(car);
    location.hash = backTo();
    window.AutoHubUI.toast(updated ? "Данные автомобиля обновлены" : "Автомобиль добавлен в гараж");
  }
  function resetForm() {
    draft = {};
    ["plateInput", "regionInput", "vinInput", "mkInput", "mdInput", "engInput", "milInput"].forEach(function (id) { $(id).value = ""; });
    $("yrSel").value = ""; $("vinCount").textContent = "0 / 17"; $("vinCount").style.color = "#5B5F66";
    ["plateErr", "vinErr", "modelErr"].forEach(function (id) { showErr(id, ""); });
    $("plateMsg").hidden = true; $("carResult").hidden = true; $("saveCar").disabled = true; $("mdHint").textContent = "";
    setTab("vin");
  }

  /* ---------- Гараж: колода карточек ---------- */
  function shortName(c) { return [c.make, c.model].filter(Boolean).join(" ") || "Мой автомобиль"; }
  // Статус ТО считается по регламенту (AutoHubApi.maintenance.nextTO), с учётом последнего пройденного ТО
  function toStatus(c) {
    var t = window.AutoHubApi.maintenance.nextTO(c);
    if (t.noMileage) return { text: "Укажите пробег", soon: false };
    if (t.overdue) return { text: "Пора на ТО-" + t.km.toLocaleString("ru-RU"), soon: true };
    return { text: (t.soon ? "ТО скоро · через " : "ТО через ") + t.left.toLocaleString("ru-RU") + " км", soon: t.soon };
  }
  function statusKind(c) { var st = toStatus(c); return !c.mileage ? "none" : st.soon ? "soon" : "ok"; }
  function modelShort(c) { return c.model || c.make || "Авто"; }
  var RIBBON_MAX = 5; // сколько машин в ленте; остальные — в «Все»

  function cardHtml(c) {
    var v = carView(c), st = toStatus(c);
    return '<div class="dc-top"><div class="dc-head"><div class="dc-name">' + esc(v.name) + (c.demo ? '<span class="dc-demo">демо</span>' : "") + "</div>" +
      '<div class="dc-spec">' + esc(v.specs) + "</div></div>" +
      (c.plate ? '<span class="dc-plate">' + esc(v.plate) + "</span>" : '<span class="dc-plate none">без номера</span>') + "</div>" +
      '<div class="dc-grid"><button class="dc-tile" data-action="mileage-card" aria-label="Обновить пробег"><small>Пробег</small><b>' + esc(v.mileage) + "</b></button>" +
      '<div class="dc-tile"><small>VIN</small><b class="mono">' + esc(v.vinMasked) + "</b></div></div>" +
      '<div class="dc-foot"><span class="dc-to' + (st.soon ? " soon" : "") + '">' + esc(st.text) + "</span>" +
      '<button class="dc-more" data-action="car-menu" aria-label="Действия с машиной"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>';
  }

  // Машины в ленте: первые по порядку, выбранная всегда видна
  function ribbonCars(g, a) {
    var list = g.cars.slice(0, RIBBON_MAX);
    if (list.indexOf(a) < 0) list[RIBBON_MAX - 1] = a;
    return list;
  }
  function miniHtml(c, on) {
    var k = statusKind(c);
    return '<button class="mini' + (on ? " on" : "") + '" data-car-id="' + esc(c.id) + '" data-action="car" aria-pressed="' + on + '" aria-label="' + esc(shortName(c)) + '">' +
      '<span class="mini-top"><span class="mini-name">' + esc(modelShort(c)) + '</span><span class="sdot ' + k + '" aria-hidden="true"></span></span>' +
      '<span class="mini-sub">' + esc(c.plate ? c.plate : (c.make || "")) + (c.demo ? " · демо" : "") + "</span></button>";
  }
  var rib = { el: null, card: null };

  function renderGarage() {
    var scr = document.getElementById("s-Garage"); if (!scr) return;
    var spec = scr.querySelector('[data-car="specs"]'); if (!spec) return;
    var orig = spec.closest('div[style*="background: #17191C"]');
    if (!rib.el) {
      orig.style.display = "none"; // карточка из макета заменена лентой и карточкой выбранной машины
      var wrap = document.createElement("div");
      wrap.className = "garage-top";
      wrap.innerHTML = '<div class="ribbon" id="ribbon" role="group" aria-label="Машины в гараже"></div>' +
        '<div class="carcard" id="carCard" aria-live="polite"></div>';
      orig.parentNode.insertBefore(wrap, orig);
      rib.el = wrap.querySelector("#ribbon"); rib.card = wrap.querySelector("#carCard");
      rib.el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-car-id]"); if (b) { setActive(b.getAttribute("data-car-id")); return; }
        if (e.target.closest("[data-action=all]")) openAll();
      });
      rib.card.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-action]"); if (!b) return;
        if (b.dataset.action === "car-menu") carMenu();
        if (b.dataset.action === "mileage-card") askMileage();
      });
    }
    var g = loadGarage(), a = activeCar(g), list = ribbonCars(g, a), n = g.cars.length;
    rib.el.innerHTML = list.map(function (c) { return miniHtml(c, c.id === a.id); }).join("") +
      (n > RIBBON_MAX ? '<button class="mini all" data-action="all" aria-label="Все машины: ' + n + '"><span>Все</span><b>' + n + "</b></button>" : "");
    var hint = document.getElementById("demoHint");
    if (!hint) { hint = document.createElement("a"); hint.id = "demoHint"; hint.href = "#Profile"; hint.className = "demohint"; rib.card.parentNode.appendChild(hint); }
    hint.innerHTML = "<span>Это демо-машина. Добавьте свою в личном кабинете</span><b>→</b>";
    hint.hidden = !a.demo;
    rib.card.innerHTML = cardHtml(a);
    var on = rib.el.querySelector(".mini.on");
    if (on) requestAnimationFrame(function () {
      var r = rib.el.getBoundingClientRect(), o = on.getBoundingClientRect();
      if (o.left < r.left || o.right > r.right) rib.el.scrollLeft += (o.left - r.left) - 16;
    });
  }

  /* ---------- «Все машины»: поиск и фильтр ---------- */
  function openAll() {
    var filt = "all";
    window.AutoHubUI.sheet({
      title: "Все машины · " + loadGarage().cars.length,
      html: '<div class="allsearch"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B5F66" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
        '<input id="allQ" type="search" autocomplete="off" spellcheck="false" placeholder="Марка, модель или госномер" aria-label="Найти машину"></div>' +
        '<div class="allchips"><button class="chip2 on" data-f="all" data-action="f">Все</button><button class="chip2" data-f="soon" data-action="f">Нужно ТО</button><button class="chip2" data-f="none" data-action="f">Без пробега</button></div>' +
        '<div id="allList" class="alllist"></div>',
      onMount: function (body) {
        var q = body.querySelector("#allQ"), listEl = body.querySelector("#allList");
        function draw() {
          var g = loadGarage(), a = activeCar(g), nq = window.AutoHubUI.norm(q.value), np = normPlate(q.value);
          var cars = g.cars.filter(function (c) {
            if (filt !== "all" && statusKind(c) !== filt) return false;
            if (!nq) return true;
            var hay = window.AutoHubUI.norm([c.make, c.model, c.year].concat(MAKE_ALIASES[c.make] || []).join(" "));
            return hay.indexOf(nq) >= 0 || (np && (c.plate || "").indexOf(np) >= 0) || (c.vin || "").indexOf(q.value.toUpperCase().trim()) >= 0;
          });
          listEl.innerHTML = cars.length ? cars.map(function (c) {
            var v = carView(c), on = c.id === a.id, st = toStatus(c);
            return '<button class="pick' + (on ? " on" : "") + '" data-pick="' + esc(c.id) + '" data-action="pick">' +
              '<span class="sdot ' + statusKind(c) + '" aria-hidden="true"></span>' +
              '<span class="pick-txt"><b>' + esc(v.name) + (c.demo ? " · демо" : "") + "</b><span>" + esc(st.text) + "</span></span>" +
              (c.plate ? '<span class="pick-plate">' + esc(fmtPlate(c.plate, c.region)) + "</span>" : "") +
              (on ? '<span class="pick-ok">✓</span>' : "") + "</button>";
          }).join("") : '<div class="allempty">Ничего не нашлось</div>';
          listEl.innerHTML += '<button class="pick add" data-action="pick" data-pick="__add"><span class="pick-ic">⚙</span><span class="pick-txt"><b>Управлять машинами</b><span>добавить, удалить — в личном кабинете</span></span></button>';
        }
        q.addEventListener("input", draw);
        body.addEventListener("click", function (e) {
          var f = e.target.closest("[data-f]");
          if (f) { filt = f.dataset.f; body.querySelectorAll("[data-f]").forEach(function (x) { x.classList.toggle("on", x === f); }); draw(); return; }
          var b = e.target.closest("[data-pick]"); if (!b) return;
          var id = b.getAttribute("data-pick");
          if (id === "__add") { window.AutoHubUI.close(function () { location.hash = "#Profile"; }); return; }
          setActive(id); window.AutoHubUI.close();
        });
        draw();
      }
    });
  }

  function carMenu() {
    var c = activeCar();
    window.AutoHubUI.sheet({
      title: shortName(c),
      html: '<button class="pick" data-act="mileage" data-action="m"><span class="pick-ic">км</span><span class="pick-txt"><b>Обновить пробег</b><span>сейчас: ' + esc(carView(c).mileage) + "</span></span></button>" +
        '<button class="pick" data-act="profile" data-action="m"><span class="pick-ic" style="background:#FCEBDF;color:#C2410C">⚙</span><span class="pick-txt"><b>Управлять машинами</b><span>добавить, удалить — в личном кабинете</span></span></button>',
      onMount: function (body) {
        body.addEventListener("click", function (e) {
          var b = e.target.closest("[data-act]"); if (!b) return;
          var act = b.dataset.act;
          window.AutoHubUI.close(function () {
            if (act === "mileage") askMileage();
            if (act === "profile") location.hash = "#Profile";
            if (act === "delete" && window.confirm("Убрать " + shortName(c) + " из гаража?")) {
              removeCar(c.id); window.AutoHubUI.toast("Автомобиль убран из гаража");
            }
          });
        });
      }
    });
  }
  function askMileage() {
    var c = activeCar();
    var val = window.prompt("Текущий пробег, км", c.mileage || "");
    var n = parseInt(String(val || "").replace(/\D/g, ""), 10);
    if (n) updateActive({ mileage: n });
  }

  var cameFrom = "Garage", onboarding = false;
  function backTo() { var r = onboarding ? "#Garage" : "#" + cameFrom; onboarding = false; return r; }
  function startOnboarding() { onboarding = true; location.hash = "#AddCar"; }

  /* ---------- Выбор машины (шторка) ---------- */
  function openPicker() {
    var g = loadGarage(), a = activeCar(g);
    var html = g.cars.map(function (c) {
      var v = carView(c), on = c.id === a.id;
      return '<button class="pick' + (on ? " on" : "") + '" data-pick="' + esc(c.id) + '" data-action="pick">' +
        '<span class="pick-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-3l2-5h12l2 5v3z"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/></svg></span>' +
        '<span class="pick-txt"><b>' + esc(v.name) + (c.demo ? " · демо" : "") + "</b><span>" + esc([c.year, c.engine].filter(Boolean).join(" · ") || v.specs) + "</span></span>" +
        (c.plate ? '<span class="pick-plate">' + esc(fmtPlate(c.plate, c.region)) + "</span>" : "") +
        (on ? '<span class="pick-ok">✓</span>' : "") + "</button>";
    }).join("") + '<button class="pick add" data-action="pick" data-pick="__add"><span class="pick-ic">+</span><span class="pick-txt"><b>Добавить автомобиль</b><span>по госномеру, VIN или марке</span></span></button>';
    window.AutoHubUI.sheet({
      title: "Для какой машины ищем?", html: html,
      onMount: function (body) {
        body.addEventListener("click", function (e) {
          var b = e.target.closest("[data-pick]"); if (!b) return;
          var id = b.getAttribute("data-pick");
          if (id === "__add") { window.AutoHubUI.close(function () { location.hash = "#AddCar"; }); return; }
          setActive(id);
          window.AutoHubUI.close();
          window.AutoHubUI.toast("Подбор запчастей для " + carView(activeCar()).name);
        });
      }
    });
  }

  function refresh() {
    applyCar(activeCar());
    renderGarage();
    try { window.dispatchEvent(new CustomEvent("autohub:car", { detail: activeCar() })); } catch (e) {}
  }

  function init() {
    fillYears(); fillMakes(); setTab("vin");
    $("addSub").textContent = API().mode === "mock"
      ? "Демо-режим: данные из заглушек API. Попробуйте номер А123ВС 177 или VIN XWEFC41ABKC001234"
      : "Расшифруем VIN по открытой базе NHTSA vPIC и справочнику кодов производителей";
    document.addEventListener("click", function (e) {
      var t = e.target.closest(".cartab"); if (t) setTab(t.dataset.tab);
    });
    $("vinInput").addEventListener("input", function () {
      var v = normVin(this.value); $("vinCount").textContent = v.length + " / 17";
      $("vinCount").style.color = v.length === 17 ? "#0F6B3A" : "#5B5F66";
    });
    $("vinFind").addEventListener("click", onVinFind);
    $("plateFind").addEventListener("click", onPlateFind);
    $("plateToVin").addEventListener("click", function () { setTab("vin"); $("vinInput").focus(); });
    $("mkInput").addEventListener("change", onMakeChange);
    $("modelApply").addEventListener("click", onModelApply);
    $("resRefine").addEventListener("click", onRefine);
    $("saveCar").addEventListener("click", onSave);
    var mb = document.querySelector('[data-action="mileage"]');
    if (mb) mb.addEventListener("click", function () {
      var c = activeCar(), cur = c.mileage || "";
      var val = window.prompt("Текущий пробег, км", cur);
      var n = parseInt(String(val || "").replace(/\D/g, ""), 10);
      if (n) updateActive({ mileage: n });
    });
    // Плашка машины на экранах поиска открывает выбор машины из гаража
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a"); if (!a || !a.querySelector('[data-car="chip"]')) return;
      e.preventDefault(); openPicker();
    });
    window.addEventListener("hashchange", function (e) {
      if (location.hash === "#Garage") onboarding = false; // «Пропустить» или возврат
      if (location.hash === "#AddCar") {
        resetForm();
        var from = (e.oldURL || "").split("#")[1] || "";
        cameFrom = /^(Welcome|AddCar)?$/.test(from) ? "Garage" : from.split("/")[0];
        var back = document.querySelector('#s-AddCar a[aria-label="Назад"]'); if (back) back.href = "#" + cameFrom;
        var skip = document.getElementById("addSkip"); if (skip) skip.hidden = !onboarding;
      }
    });
    // ?demo=fleet — заполнить гараж 12 демо-машинами (проверка «Все»)
    if (/[?&]demo=fleet\b/.test(location.search)) seedFleet();
    refresh();
  }

  function seedFleet() {
    var list = [["Kia", "Rio IV", "А123ВС", "177", 58400], ["Lada", "Granta", "В456ОР", "750", 97300], ["Hyundai", "Solaris", "Е789КХ", "50", 34100],
      ["Volkswagen", "Polo", "М001ММ", "99", 0], ["Chery", "Tiggo 7 Pro", "К555КК", "77", 44200], ["Toyota", "Camry", "О777ОО", "197", 118900],
      ["Škoda", "Octavia", "Т321ТТ", "190", 89500], ["Renault", "Logan", "Н222НН", "750", 150600], ["Haval", "Jolion", "Р808РР", "799", 15300],
      ["Lada", "Vesta", "С404СС", "50", 61200], ["Kia", "Sportage", "У909УУ", "77", 29800], ["Geely", "Coolray", "Х111ХХ", "790", 0]];
    var g = { cars: list.map(function (x, i) {
      return { id: "f" + i, make: x[0], model: x[1], plate: x[2], region: x[3], mileage: x[4] || null, year: 2016 + (i % 8), demo: false };
    }), activeId: "f0" };
    saveGarage(g);
  }

  function updateCar(id, patch) { var g = loadGarage(); g.cars.forEach(function (c) { if (c.id === id) Object.assign(c, patch); }); saveGarage(g); refresh(); }
  window.AutoHubCar = { init: init, active: function () { return activeCar(); }, cars: function () { return loadGarage().cars; },
    setActive: setActive, remove: removeCar, update: updateCar, status: toStatus, statusKind: statusKind, view: carView, plate: fmtPlate, name: shortName,
    openPicker: openPicker, startOnboarding: startOnboarding, decodeLocal: decodeLocal, vinError: vinError, normPlate: normPlate, validPlate: validPlate };
})();
