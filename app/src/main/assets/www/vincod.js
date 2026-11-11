/* АвтоХаб: AUTO-46 «Спецификация по VIN» — AvtoVinCod (api.avtovincod.ru).
 *
 * Зачем: по VIN узнать точную комплектацию — код двигателя, КПП, привод, кузов, поколение, модификацию —
 * и подбирать запчасти по ней, а не «по марке и модели» (web/parts.js, AutoHubApi.parts.fit).
 * Плюс VIN и СТС по госномеру (gos2vin): машину можно добавить по одному номеру.
 *
 * Режим «свой ключ»: ключ (Bearer) хранится только на этом телефоне, в коде и APK его нет. Запросы — через
 * NativeHttp.getAuth (токен уходит только на api.avtovincod.ru); в веб-версии — через посредника на своём
 * сервере /x/avc/ (deploy/server/Caddyfile), который ключ не хранит и не пишет в журнал. Сервис платный: перед запросом виден его
 * цена, расход за месяц ограничен бюджетом (по умолчанию 200 ₽). Спецификация по VIN кэшируется на год,
 * VIN по номеру — на месяц. Тестовые значения сервиса (VIN X7TEST00000000001, номер Т000ТТ00) бесплатны.
 * Документация: https://avtovincod.ru/docs/ (методы и цены — также в личном кабинете, «Справка»).
 */
(function () {
  "use strict";

  var BASE = "https://api.avtovincod.ru/";
  var K = { key: "autohub.avc.key.v1", consent: "autohub.avc.consent.v1", cache: "autohub.avc.cache.v1", spend: "autohub.avc.spend.v1", budget: "autohub.avc.budget.v1" };
  var PRICE = { decode: 1.6, gos2vin: 8 };
  var TTL = { decode: 365 * 864e5, gos2vin: 30 * 864e5 };
  var DEFAULT_BUDGET = 200;
  var TEST = { vin: "X7TEST00000000001", plate: "Т000ТТ00" };
  var ERR = {
    INSUFFICIENT_BALANCE: ["avc_balance", "На балансе AvtoVinCod не хватает денег. Пополните его в личном кабинете avtovincod.ru."],
    UNAUTHORIZED: ["avc_key", "Ключ AvtoVinCod не подошёл. Проверьте его в Профиле."],
    BAD_VIN: ["bad_request", "Проверьте VIN: 17 латинских букв и цифр, без I, O, Q."],
    BAD_PLATE: ["bad_request", "Проверьте госномер."],
    NOT_FOUND: ["not_found", "Сервис не нашёл такой метод."]
  };
  var DRIVE = { FWD: "передний", RWD: "задний", AWD: "полный", "4WD": "полный" };
  var BODY = { SDN: "седан", HBK: "хэтчбек", HB: "хэтчбек", WGN: "универсал", SUV: "внедорожник / кроссовер", CPE: "купе", CAB: "кабриолет", VAN: "фургон", MPV: "минивэн", PCK: "пикап", LBK: "лифтбек" };

  function ls(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function monthKey() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }

  /* ---------- Настройки и бюджет ---------- */
  function key() { var k = ls(K.key, ""); return typeof k === "string" ? k : ""; }
  function validKey(k) { return /^[\x21-\x7E]{8,256}$/.test(String(k || "")); }
  function consent() { return ls(K.consent, null); }
  function ready() { return validKey(key()) && !!consent(); }
  function budget() { var b = +ls(K.budget, DEFAULT_BUDGET); return b > 0 ? b : DEFAULT_BUDGET; }
  function spent() { var s = ls(K.spend, null); return s && s.month === monthKey() ? s : { month: monthKey(), rub: 0, n: 0 }; }
  function addSpend(rub) { var s = spent(); s.rub = Math.round((s.rub + (+rub || 0)) * 100) / 100; s.n++; lsSet(K.spend, s); }
  function isTest(method, params) { return (params.vin && params.vin === TEST.vin) || (params.plate && normPlate(params.plate) === TEST.plate); }
  function rub(n) { return String(Math.round(n * 100) / 100).replace(".", ",") + " ₽"; }
  /** Цена запроса для подписи на кнопке; тестовые значения — бесплатно. */
  function priceLabel(method, params) { return isTest(method, params || {}) ? "бесплатно, тест" : rub(PRICE[method]); }
  function normPlate(p) { return String(p || "").toUpperCase().replace(/\s+/g, ""); }

  /* ---------- Разбор ответов (чистые функции — tests/vincod.test.cjs) ---------- */
  function parse(status, json) {
    if (json && json.success === 1) return json;
    if (json && (json.code || json.error)) {
      var m = ERR[json.code] || (status === 401 || status === 403 ? ERR.UNAUTHORIZED : null);
      throw err(m ? m[0] : "avc_error", m ? m[1] + (json.code === "INSUFFICIENT_BALANCE" && json.error ? " " + json.error : "") : "AvtoVinCod: " + (json.error || json.code));
    }
    if (status === 401 || status === 403) throw err("avc_key", ERR.UNAUTHORIZED[1]);
    throw err("source_unavailable", "AvtoVinCod сейчас не ответил. Попробуйте позже.");
  }
  /** Вариант расшифровки → спецификация машины в формате приложения (car.spec). */
  function toSpec(v, vin) {
    if (!v) return null;
    var e = v.engine || {}, t = v.transmission || {}, y = v.years || {}, a = v.assembly || {};
    return {
      vin: vin || null,
      brand: v.brand || "", model: v.model || "", generation: v.generation || "", bodyCode: v.bodyName || "",
      modification: v.modification || "", title: v.title || "", market: v.market || "",
      year: y.model || null, yearsFrom: y.start || null, yearsTo: y.finish || null,
      body: BODY[v.body] || (v.body ? String(v.body).toLowerCase() : ""), doors: v.doors || null,
      drive: DRIVE[v.drive] || v.drive || "", driveCode: v.drive || "",
      transmission: { code: t.code || "", text: t.text || "", name: t.name || "", speeds: t.speeds || null },
      engine: { code: e.series || "", fuel: e.fuelText || "", fuelCode: e.fuelCode || "", volumeL: e.volumeL || null, volumeCcm: e.volumeCcm || null,
        powerPs: e.powerPs || null, powerKw: e.powerKw || null, torqueNm: e.torqueNm || null, emission: e.emission || "", layout: e.layout || "", valves: e.valves || null },
      assembly: [a.city, a.country].filter(Boolean).join(", "),
      source: "AvtoVinCod", at: new Date().toISOString().slice(0, 10)
    };
  }
  function mapDecode(json, vin) {
    var variants = (json && json.variants || []).map(function (v) { return toSpec(v, vin); }).filter(Boolean);
    return { variants: variants, full: !!(json && json.full), confirmed: !!(json && json.confirmed), test: !!(json && json.testMode) };
  }
  function mapGos2vin(json) {
    if (!json || !json.vin) return null;
    var s = json.sts || {};
    return { vin: String(json.vin).toUpperCase(), body: json.bodyNumber || null, sts: s.series || s.number ? String(s.series || "") + String(s.number || "") : null,
      brand: json.brand || "", model: json.model || "", year: json.year || null, powerHp: json.enginePower || null, isTaxi: !!json.isTaxi, test: !!json.testMode };
  }
  /** Короткая строка для карточки машины: «1.6 бензин 106 л.с. (21129) · 5MT · передний · седан». */
  function specLine(s) {
    if (!s) return "";
    var e = s.engine || {}, t = s.transmission || {};
    var eng = [e.volumeL ? Number(e.volumeL).toFixed(1) : "", e.fuel, e.powerPs ? e.powerPs + " л.с." : ""].filter(Boolean).join(" ") + (e.code ? " (" + e.code + ")" : "");
    return [eng, t.name || t.text, s.drive, s.body].filter(Boolean).join(" · ");
  }
  /** Поля карточки, которые показывают остальные экраны (engine, transmission, body) — из спецификации. */
  function carFields(s) {
    var e = s.engine || {}, t = s.transmission || {};
    return {
      make: s.brand ? (window.AutoHubApi && window.AutoHubApi.vehicle.titleCase ? window.AutoHubApi.vehicle.titleCase(s.brand) : s.brand) : undefined,
      model: s.model || undefined, year: s.year || undefined,
      engine: ([e.volumeL ? Number(e.volumeL).toFixed(1) : "", e.fuel, e.powerPs ? e.powerPs + " л.с." : ""].filter(Boolean).join(" ") + (e.code ? " · " + e.code : "")) || undefined,
      transmission: t.code === "AT" ? "Автомат" : t.code === "MT" ? "Механика" : t.code === "CVT" ? "Вариатор" : t.code === "AMT" ? "Робот" : (t.text || undefined),
      body: s.body || undefined, spec: s
    };
  }

  /* ---------- Запросы ---------- */
  function cacheKey(method, params) { return method + "?" + Object.keys(params).sort().map(function (k) { return k + "=" + params[k]; }).join("&"); }
  function request(method, params, opts) {
    opts = opts || {};
    if (!validKey(key())) return Promise.reject(err("avc_off", "AvtoVinCod не подключён: введите ключ в Профиле → «Спецификация по VIN»."));
    if (!consent()) return Promise.reject(err("avc_consent", "Нужно согласие на передачу VIN и госномера в AvtoVinCod (Профиль)."));
    var ck = cacheKey(method, params), all = ls(K.cache, {}), hit = all[ck];
    if (!opts.force && hit && Date.now() - hit.at < TTL[method]) return Promise.resolve(hit.data);
    var test = isTest(method, params);
    if (!test && spent().rub + PRICE[method] > budget()) {
      return Promise.reject(err("avc_budget", "Бюджет AvtoVinCod на месяц исчерпан: потрачено " + rub(spent().rub) + " из " + rub(budget()) + ". Увеличьте его в Профиле."));
    }
    var H = window.AutoHubApi && window.AutoHubApi.http; if (!H) return Promise.reject(err("avc_off", "Сетевой модуль не загружен."));
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return H.get(BASE + method + "?" + q, 95000, { bearer: key() }).then(function (r) {
      var json = null; try { json = JSON.parse(r.body); } catch (e) {}
      var data = parse(r.status, json);
      var charged = data.billing && data.billing.charged != null ? +data.billing.charged : (test ? 0 : PRICE[method]);
      if (charged > 0) addSpend(charged);
      all = ls(K.cache, {}); all[ck] = { at: Date.now(), data: data };
      Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; }).slice(60).forEach(function (x) { delete all[x]; });
      lsSet(K.cache, all);
      return data;
    }, function (e) {
      // Браузер: сервис не разрешает запросы со страниц (нет CORS). Веб-версия на своём сервере ходит через посредника
      // (/x/avc/), при локальном просмотре по http/file посредника нет — работает только в Android-приложении.
      if (e && e.code === "network" && !window.NativeHttp) {
        if (window.AutoHubApi.http.viaProxy(BASE) !== BASE) throw err("network", "Нет связи с AvtoVinCod. Проверьте интернет и попробуйте ещё раз.");
        throw err("avc_web", "При локальном просмотре AvtoVinCod недоступен — сервис не принимает запросы из браузера. Работает в Android-приложении и в веб-версии на сервере.");
      }
      throw e;
    });
  }
  /** VIN → спецификация. { variants: [spec…], full, confirmed } — несколько вариантов, если VIN не однозначен. */
  function decode(vin, opts) {
    vin = String(vin || "").toUpperCase();
    return request("decode", { vin: vin }, opts).then(function (d) { return mapDecode(d, vin); });
  }
  /** Госномер (с регионом) → VIN, СТС, марка, модель, год. */
  function byPlate(plate, region, opts) {
    var p = normPlate(plate) + String(region || "");
    return request("gos2vin", { plate: p }, opts).then(function (d) {
      var r = mapGos2vin(d); if (!r) throw err("not_found", "По этому номеру VIN не найден.");
      return r;
    });
  }
  /** Баланс кабинета — бесплатный метод. */
  function balance() {
    var H = window.AutoHubApi && window.AutoHubApi.http;
    if (!validKey(key()) || !H) return Promise.reject(err("avc_off", "Нет ключа."));
    return H.get(BASE + "balance", 20000, { bearer: key() }).then(function (r) { var j = null; try { j = JSON.parse(r.body); } catch (e) {} return parse(r.status, j); });
  }

  /* ---------- Выбор варианта, если VIN не однозначен ---------- */
  function choose(variants) {
    var UI = window.AutoHubUI;
    if (variants.length <= 1) return Promise.resolve(variants[0] || null);
    return new Promise(function (resolve) {
      var picked = null;
      UI.sheet({ title: "Уточните комплектацию",
        html: '<p class="sheet-text">По VIN подходят несколько вариантов. Выберите свой — от этого зависит подбор запчастей (сверьте с СТС: мощность и объём двигателя).</p>' +
          variants.map(function (s, i) { return '<button class="pick" data-v="' + i + '"><span class="pick-txt"><b>' + UI.esc(s.title || (s.brand + " " + s.model)) + "</b><span>" + UI.esc(specLine(s)) + "</span></span></button>"; }).join("") +
          '<button class="btn-light" data-close="1" style="height:48px">Не знаю — выберу позже</button>',
        onMount: function (b) {
          b.addEventListener("click", function (e) { var x = e.target.closest("[data-v]"); if (x) { picked = variants[+x.dataset.v]; UI.close(); } });
          var gone = new MutationObserver(function () { if (!b.isConnected) { gone.disconnect(); resolve(picked); } });
          gone.observe(document.body, { childList: true, subtree: true });
        } });
    });
  }

  /* ---------- Настройки в Профиле ---------- */
  function settingsSheet() {
    var UI = window.AutoHubUI, s = spent(), k = key();
    UI.sheet({ title: "Спецификация по VIN · AvtoVinCod",
      html: '<p class="sheet-text">Точная комплектация по VIN — код двигателя, КПП, привод, кузов, поколение — для подбора запчастей. И VIN по госномеру: машину можно добавить по одному номеру. Сервис платный: расшифровка VIN — ' + rub(PRICE.decode) + ", VIN по номеру — " + rub(PRICE.gos2vin) + ".</p>" +
        '<label class="fld">Ключ AvtoVinCod<input id="avKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + UI.esc(k) + '" placeholder="из личного кабинета avtovincod.ru"></label>' +
        '<label class="fld">Бюджет на месяц, ₽<input id="avBudget" inputmode="numeric" value="' + budget() + '"></label>' +
        '<label class="chk"><input id="avConsent" type="checkbox"' + (consent() ? " checked" : "") + '><span>Согласен передавать VIN и госномер своих машин в AvtoVinCod. Ключ и ответы хранятся только на этом телефоне.</span></label>' +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">В этом месяце: ' + s.n + " платных запросов на " + rub(s.rub) + ". Спецификация по VIN запоминается — повторно за неё не платите.</p>" +
        '<span id="avErr" class="err" hidden></span><div id="avOut"></div>' +
        '<button class="btn-accent" data-action="av-save">Сохранить</button>' +
        '<button class="btn-light" data-action="av-test" style="height:48px">Проверить ключ и баланс (бесплатно)</button>' +
        (k ? '<button class="linkbtn" data-action="av-off" style="align-self:center">Отключить и удалить ключ</button>' : ""),
      onMount: function (b) {
        function fail(t) { var e = b.querySelector("#avErr"); e.textContent = t; e.hidden = !t; }
        function save() {
          var nk = b.querySelector("#avKey").value.trim(), bud = parseInt(b.querySelector("#avBudget").value.replace(/\D/g, ""), 10);
          if (nk && !validKey(nk)) { fail("Ключ — от 8 символов, без пробелов и русских букв. Скопируйте его из кабинета целиком."); return false; }
          if (nk && !b.querySelector("#avConsent").checked) { fail("Без согласия запросы не отправляются."); return false; }
          fail(""); lsSet(K.key, nk || null); lsSet(K.consent, nk && b.querySelector("#avConsent").checked ? (consent() || { at: Date.now() }) : null);
          if (bud > 0) lsSet(K.budget, Math.min(bud, 100000));
          return true;
        }
        b.addEventListener("click", function (e) {
          var a = e.target.closest("[data-action]"); if (!a) return;
          if (a.dataset.action === "av-save") { if (save()) UI.close(function () { rerender(); UI.toast(ready() ? "AvtoVinCod подключён" : "Сохранено"); }); }
          if (a.dataset.action === "av-off") { lsSet(K.key, null); lsSet(K.consent, null); lsSet(K.cache, null); UI.close(function () { rerender(); UI.toast("Ключ удалён с телефона"); }); }
          if (a.dataset.action === "av-test") {
            if (!save()) return;
            var out = b.querySelector("#avOut"); a.disabled = true; out.innerHTML = '<div class="loading">Проверяем…</div>';
            balance().then(function (d) {
              return decode(TEST.vin).then(function (r) { return [d, r]; });
            }).then(function (x) {
              var bal = +x[0].balance || 0, s0 = x[1].variants[0];
              out.innerHTML = '<div class="kv"><div><span>Ключ</span><b>принят</b></div><div><span>Баланс</span><b>' + rub(bal) + (bal <= 0 ? " — пополните для своих машин" : "") + "</b></div>" +
                "<div><span>Тестовый VIN</span><b>" + UI.esc(s0 ? s0.title : "не расшифрован") + "</b></div></div>";
            }, function (er) { out.innerHTML = ""; fail(er.message || String(er)); }).then(function () { a.disabled = false; });
          }
        });
      } });
  }
  function rerender() { if (window.AutoHubAuth && window.AutoHubAuth.renderProfile) window.AutoHubAuth.renderProfile(); }

  function init() {
    document.addEventListener("click", function (e) { if (e.target.closest("[data-action=vincod]")) settingsSheet(); });
  }

  window.AutoHubVinCod = { init: init, ready: ready, decode: decode, byPlate: byPlate, balance: balance, choose: choose, specLine: specLine, carFields: carFields,
    priceLabel: priceLabel, spent: spent, budget: budget, open: settingsSheet, TEST: TEST,
    _test: { parse: parse, toSpec: toSpec, mapDecode: mapDecode, mapGos2vin: mapGos2vin, specLine: specLine, validKey: validKey, request: request, K: K } };
})();
