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
  /* ---------- Хранение авто ---------- */
  function loadCar() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; } }
  function saveCar(c) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {} }

  function carView(c) {
    var name = [c.make, c.model].filter(Boolean).join(" ") || "Мой автомобиль";
    return {
      name: name,
      specs: [c.year, c.engine, c.transmission, c.body].filter(Boolean).join(" · ") || "характеристики не указаны",
      chip: [name, c.engine, c.year].filter(Boolean).join(" · "),
      plate: c.plate ? fmtPlate(c.plate, c.region) : "номер не указан",
      vinMasked: c.vin ? c.vin.substr(0, 3) + "•••••" + c.vin.substr(13) : "не указан",
      mileage: c.mileage ? Number(c.mileage).toLocaleString("ru-RU") + " км" : "не указан"
    };
  }
  function applyCar(c) {
    if (!c) return;
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
  function fillMakes() {
    $("mkList").innerHTML = Object.keys(MODELS).sort().map(function (m) { return '<option value="' + esc(m) + '">'; }).join("");
  }
  var modelsReq = 0;
  function onMakeChange() {
    var mk = $("mkInput").value.trim(), list = $("mdList"), hint = $("mdHint"), req = ++modelsReq;
    var key = Object.keys(MODELS).filter(function (k) { return k.toLowerCase() === mk.toLowerCase(); })[0];
    if (key) { list.innerHTML = MODELS[key].map(function (m) { return '<option value="' + esc(m) + '">'; }).join(""); hint.textContent = ""; return; }
    list.innerHTML = "";
    if (mk.length < 2) { hint.textContent = ""; return; }
    hint.textContent = "Загружаем модели…";
    API().vehicle.modelsForMake(mk).then(function (d) {
      if (req !== modelsReq) return;
      var names = d.models || [];
      list.innerHTML = names.slice(0, 200).map(function (m) { return '<option value="' + esc(m) + '">'; }).join("");
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
    saveCar(draft); applyCar(draft);
    location.hash = "#Garage";
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
      var c = loadCar() || DEMO_CAR, cur = c.mileage || "";
      var val = window.prompt("Текущий пробег, км", cur);
      var n = parseInt(String(val || "").replace(/\D/g, ""), 10);
      if (n) { c.mileage = n; saveCar(c); applyCar(c); }
    });
    applyCar(loadCar());
  }

  window.AutoHubCar = { init: init, decodeLocal: decodeLocal, vinError: vinError, normPlate: normPlate, validPlate: validPlate };
})();
