/* АвтоХаб: AUTO-45 «Госданные через API Assist» — штрафы ГИБДД, ОСАГО (РСА), техосмотр и пробег (ЕАИСТО).
 *
 * Режим «свой ключ»: владелец вводит ключ API Assist в Профиле, ключ хранится только на этом телефоне
 * (в коде и APK ключа нет). Без ключа и без согласия ничего никуда не отправляется — экраны работают на демо-данных.
 * Запросы — через нативный мост NativeHttp (хост service.api-assist.com в белом списке), ответы кэшируются:
 * штрафы — сутки, ОСАГО и ЕАИСТО — неделя. Успешные запросы считаются, мягкий предел — 180 в месяц
 * (бесплатный тариф API Assist — 200).
 * Документация API: https://api-assist.com/documentation/{fines,rsa,eaisto}-api.txt
 */
(function () {
  "use strict";

  var BASE = "https://service.api-assist.com/parser/";
  var K = { key: "autohub.gov.key.v1", consent: "autohub.gov.consent.v1", cache: "autohub.gov.cache.v1", usage: "autohub.gov.usage.v1" };
  var TTL = { fines: 864e5, rsa: 7 * 864e5, eaisto: 7 * 864e5 };
  var MONTH_LIMIT = 180;
  var EP = { fines: "fines_api/fines", rsa: "rsa_api/", eaisto: "eaisto_mileage_api/" };
  var ERR = {
    40301: ["gov_key", "Ключ API Assist недействителен. Проверьте его в Профиле → Госданные."],
    40302: ["gov_access", "Доступ к API Assist закрыт: проверьте подписку."],
    40303: ["gov_access", "Этот API не подключён к вашему ключу API Assist."],
    40304: ["gov_day_limit", "Дневной лимит запросов API Assist исчерпан — попробуйте завтра."],
    40305: ["gov_month_limit", "Месячный лимит запросов API Assist исчерпан."],
    40001: ["bad_request", "Сервис не принял запрос: проверьте СТС, VIN или госномер."]
  };
  var MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  function ls(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function now() { return Date.now(); }
  function monthKey(t) { var d = new Date(t || now()); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }

  /* ---------- Настройки ---------- */
  function key() { var k = ls(K.key, ""); return typeof k === "string" ? k : ""; }
  function validKey(k) { return /^[A-Za-z0-9_\-]{8,128}$/.test(String(k || "")); }
  function consent() { return ls(K.consent, null); }
  function ready() { return validKey(key()) && !!consent(); }
  function usage() { var u = ls(K.usage, null); return u && u.month === monthKey() ? u : { month: monthKey(), n: 0 }; }
  function countSuccess() { var u = usage(); u.n++; lsSet(K.usage, u); }
  /** СТС: 2 цифры + 2 буквы или цифры + 6 цифр, как в документе «99 АА 999999». */
  function normSts(s) { return String(s || "").toUpperCase().replace(/[\s\-]/g, ""); }
  function validSts(s) { return /^\d{2}[0-9А-ЯЁA-Z]{2}\d{6}$/.test(normSts(s)); }
  function regNumber(car) { return car && car.plate ? String(car.plate).toUpperCase().replace(/\s+/g, "") + String(car.region || "") : ""; }

  /* ---------- Разбор ответов (чистые функции — проверяются tests/gov.test.cjs) ---------- */
  /** Ответ API Assist → данные или ошибка с кодом. Флаг успеха у разных API разный. */
  function parse(kind, status, json) {
    if (json && typeof json === "object") {
      var okFlag = kind === "rsa" ? json.rsa_done : kind === "eaisto" ? (json.kbm_done === 1 || json.mileages_done === 1 ? 1 : 0) : json.success;
      if (okFlag === 1 || okFlag === "1") return json;
      if (json.error || json.error_code) {
        var m = ERR[json.error_code];
        throw err(m ? m[0] : "gov_error", m ? m[1] : "API Assist: " + String(json.error || json.error_code));
      }
    }
    if (status && status >= 500) throw err("source_unavailable", "Сервис API Assist временно недоступен. Повторим позже.");
    if (status === 403 || status === 400) throw err("gov_error", "API Assist отклонил запрос (HTTP " + status + ").");
    // success = 0 или пустой ответ: сбой источника (гибдд.рф, РСА), запрос не учитывается — повторить позже
    throw err("source_unavailable", "Госсервис сейчас не ответил. Попробуем позже — запрос не списан с лимита.");
  }
  function isoDate(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return null;
  }
  function dm(iso) { var p = iso.split("-"); return +p[2] + " " + MON[+p[1] - 1]; }
  /** Штрафы → формат экрана «Штрафы» (как у заглушки AutoHubApi.fines.list). Оплаченные не показываются. */
  function mapFines(json) {
    return (json && json.fines || []).filter(function (f) { return f && !f.paid && f.num_post; }).map(function (f) {
      var date = isoDate(f.date_post) || isoDate(new Date().toISOString()), sum = Number(f.sum) || 0;
      var disc = !!f.enable_discount && !!isoDate(f.date_discount);
      return { id: "g" + f.num_post, uinFull: String(f.num_post), uin: "•••" + String(f.num_post).slice(-4), date: date, time: "",
        text: "Постановление от " + dm(date), place: String(f.division_name || "Госавтоинспекция"),
        amount: sum, discountUntil: disc ? isoDate(f.date_discount) : null, discountAmount: disc ? Math.round(sum / 2) : null, live: true };
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  /** Полисы РСА → действующий (или самый свежий) полис. */
  function pickPolicy(json) {
    var l = (json && json.policies || []).filter(function (p) { return p && isoDate(p.endDate); });
    if (!l.length) return null;
    l.sort(function (a, b) {
      var aa = /действ/i.test(a.status || "") ? 1 : 0, bb = /действ/i.test(b.status || "") ? 1 : 0;
      return bb - aa || (isoDate(a.endDate) < isoDate(b.endDate) ? 1 : -1);
    });
    var p = l[0];
    return { company: shortCompany(p.companyName), serial: p.policySerial || "", number: p.policyNumber || "", start: isoDate(p.startDate), end: isoDate(p.endDate),
      status: p.status || "", vin: p.vin || null, vinMask: p.vin_mask || null, plate: p.regNumber || null, plateMask: p.regNumber_mask || null,
      car: [p.mark, p.model].filter(Boolean).join(" ") };
  }
  function shortCompany(s) {
    s = String(s || "").replace(/["«»]/g, "");
    var m = s.match(/(?:общество|компания)\s+(.+)$/i); return (m ? m[1] : s).trim() || "страховая";
  }
  /** ЕАИСТО → действующая диагностическая карта и история пробега по годам. */
  function mapEaisto(json) {
    var cards = (json && json.diagnose_cards || []).map(function (c) {
      return { number: String(c.number || ""), start: isoDate(c.startDate), end: isoDate(c.endDate), mileage: Number(c.mileage) || null };
    }).filter(function (c) { return c.end; }).sort(function (a, b) { return a.end < b.end ? 1 : -1; });
    var mileages = (json && json.mileages || []).map(function (m) { return { date: isoDate(m.date), km: Number(m.mileage) || 0 }; })
      .filter(function (m) { return m.date && m.km > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    // Пробег меньше предыдущего — повод проверить машину (скрутка или ошибка ввода на техосмотре)
    var drops = mileages.filter(function (m, i) { return i > 0 && m.km < mileages[i - 1].km; }).length;
    return { card: cards[0] || null, mileages: mileages, drops: drops };
  }
  /** Совпадает ли VIN машины с маской из РСА («Y4K8622Z3PB9*****»). */
  function vinMatchesMask(vin, mask) {
    if (!vin || !mask) return null;
    vin = String(vin).toUpperCase(); mask = String(mask).toUpperCase();
    if (vin.length !== mask.length) return false;
    for (var i = 0; i < mask.length; i++) if (mask[i] !== "*" && mask[i] !== vin[i]) return false;
    return true;
  }

  /* ---------- Запросы ---------- */
  function cacheKey(kind, params) { return kind + "?" + Object.keys(params).sort().map(function (k) { return k + "=" + params[k]; }).join("&"); }
  function cached(kind, params, maxAge) {
    var c = ls(K.cache, {})[cacheKey(kind, params)];
    return c && now() - c.at < (maxAge == null ? TTL[kind] : maxAge) ? c : null;
  }
  function remember(kind, params, data) {
    var all = ls(K.cache, {}), k = cacheKey(kind, params), t = now();
    all[k] = { at: t, data: data };
    // не больше 40 записей: старые удаляются
    var keys = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
    keys.slice(40).forEach(function (x) { delete all[x]; });
    lsSet(K.cache, all);
  }
  function http() { return window.AutoHubApi && window.AutoHubApi.http; }
  /** Запрос к API Assist: кэш → лимит → сеть → разбор. opts.force — мимо кэша. */
  function request(kind, params, opts) {
    opts = opts || {};
    if (!validKey(key())) return Promise.reject(err("gov_off", "Госданные не подключены: введите ключ API Assist в Профиле."));
    if (!consent()) return Promise.reject(err("gov_consent", "Нужно согласие на передачу данных в API Assist (Профиль → Госданные)."));
    var hit = !opts.force && cached(kind, params);
    if (hit) return Promise.resolve({ data: hit.data, at: hit.at, cached: true });
    if (usage().n >= MONTH_LIMIT) return Promise.reject(err("gov_quota", "В этом месяце уже " + usage().n + " запросов к API Assist — бережём бесплатный лимит. Данные обновятся в следующем месяце."));
    var H = http(); if (!H) return Promise.reject(err("gov_off", "Сетевой модуль не загружен."));
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return H.get(BASE + EP[kind] + "?key=" + encodeURIComponent(key()) + "&" + q, 25000).then(function (r) {
      var json = null; try { json = JSON.parse(r.body); } catch (e) {}
      if (!r.status && !json) throw err("network", "Нет связи с API Assist. Проверьте интернет.");
      var data = parse(kind, r.status, json);
      countSuccess(); remember(kind, params, data);
      return { data: data, at: now(), cached: false };
    });
  }
  /** Штрафы по СТС машины. Без СТС — null (экран попросит его ввести). */
  function fines(car, opts) {
    if (!car || !validSts(car.sts)) return Promise.resolve(null);
    return request("fines", { sts: normSts(car.sts) }, opts).then(function (r) { return { items: mapFines(r.data), at: r.at, source: "гибдд.рф через API Assist" }; });
  }
  function osago(car, opts) {
    var p = car && car.vin ? { vin: car.vin } : regNumber(car) ? { regNumber: regNumber(car) } : null;
    if (!p) return Promise.resolve(null);
    return request("rsa", p, opts).then(function (r) { return { policy: pickPolicy(r.data), at: r.at }; });
  }
  function eaisto(car, opts) {
    if (!car || !car.vin) return Promise.resolve(null);
    return request("eaisto", { vin: car.vin }, opts).then(function (r) { return Object.assign(mapEaisto(r.data), { at: r.at }); });
  }

  /* ---------- Привязка к экранам ---------- */
  function UI() { return window.AutoHubUI; }
  function esc(s) { return UI().esc(s); }
  function active() { var C = window.AutoHubCar; var c = C && C.active(); return c && !c.demo && c.id !== "demo" ? c : null; }
  function fmtDate(iso) { var p = iso.split("-"); return +p[2] + " " + MON[+p[1] - 1] + " " + p[0]; }

  /** Документы: срок ОСАГО и диагностической карты — из РСА и ЕАИСТО (раз в неделю, из кэша — без запроса). */
  function syncDocs(opts) {
    var c = active(), Docs = window.AutoHubDocs; if (!ready() || !c || !Docs) return Promise.resolve();
    return Promise.all([
      osago(c, opts).then(function (r) {
        if (r && r.policy && r.policy.end) {
          var cur = Docs.osago();
          if (!cur || cur.until !== r.policy.end) Docs.setOsago(r.policy.end, "по данным РСА · " + r.policy.company);
        }
      }, function () {}),
      eaisto(c, opts).then(function (r) {
        if (r && r.card && r.card.end && Docs.upsert) Docs.upsert("d-dk", "Диагностическая карта", r.card.end, "по данным ЕАИСТО" + (r.card.mileage ? " · пробег " + r.card.mileage.toLocaleString("ru-RU") + " км" : ""), 30);
        if (r) window.AutoHubCar.update(c.id, { govMileages: r.mileages, govMileageDrops: r.drops });
      }, function () {})
    ]);
  }

  /** Паспорт авто: история пробега по техосмотрам. */
  function drawPassport() {
    var scr = document.getElementById("s-CarPassport"); if (!scr) return;
    var box = scr.querySelector(".gov-mileage"), c = active();
    var list = c && c.govMileages || [];
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div"); box.className = "gov-mileage";
      // перед разделом «ДОКУМЕНТЫ» в прокручиваемой части (нижняя панель с кнопкой — закреплена)
      var anchor = Array.prototype.filter.call(scr.querySelectorAll("div"), function (d) { return d.children.length === 0 && d.textContent.trim() === "ДОКУМЕНТЫ"; })[0];
      if (!anchor) return;
      anchor.parentNode.insertBefore(box, anchor);
    }
    box.innerHTML = '<div class="to-sec">ПРОБЕГ ПО ТЕХОСМОТРАМ · ЕАИСТО</div><div class="kv">' + list.slice(-6).reverse().map(function (m) {
      return "<div><span>" + esc(fmtDate(m.date)) + "</span><b>" + m.km.toLocaleString("ru-RU") + " км</b></div>";
    }).join("") + (c.govMileageDrops ? '<div class="gov-warn"><span>Пробег уменьшался ' + c.govMileageDrops + " раз — проверьте перед продажей или покупкой</span></div>" : "") + "</div>";
  }

  /** Плашка на экране «Штрафы»: подключить госданные или указать СТС. */
  function drawFinesBanner() {
    var scr = document.getElementById("s-Fines"); if (!scr) return;
    var h1 = scr.querySelector("h1"), sub = h1 && h1.nextElementSibling; if (!sub) return;
    var el = scr.querySelector(".gov-banner"), c = active(), html = "";
    if (c && validKey(key()) && consent() && !validSts(c.sts)) html = "<b>Укажите СТС</b><span>По номеру СТС проверим неоплаченные штрафы на гибдд.рф.</span>";
    else if (c && !ready()) html = "<b>Настоящие штрафы</b><span>Подключите госданные: штрафы по СТС, срок ОСАГО и техосмотра — автоматически.</span>";
    if (!html) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("button"); el.className = "gov-banner dl-card"; el.setAttribute("data-action", "gov"); sub.parentNode.insertBefore(el, sub.nextSibling); }
    el.innerHTML = '<span class="dl-t">' + html + "</span>";
  }

  function settingsSheet() {
    var c = active(), u = usage(), k = key(), agreed = !!consent();
    UI().sheet({ title: "Госданные · API Assist",
      html: '<p class="sheet-text">Штрафы ГИБДД по СТС, срок ОСАГО из РСА, техосмотр и пробег из ЕАИСТО. Данные берёт сервис API Assist с гибдд.рф, сайтов РСА и ЕАИСТО.</p>' +
        '<label class="fld">Ключ API Assist<input id="gvKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(k) + '" placeholder="из письма support@api-assist.com"></label>' +
        (c ? '<label class="fld">СТС ' + esc(window.AutoHubCar.name(c)) + '<input id="gvSts" autocomplete="off" value="' + esc(c.sts || "") + '" placeholder="Например, 99 АА 123456"></label>' : '<p class="sheet-text">Добавьте свою машину в гараж — для демо-машины запросы не отправляются.</p>') +
        '<label class="chk"><input id="gvConsent" type="checkbox"' + (agreed ? " checked" : "") + '><span>Согласен передавать СТС, VIN и госномер своих машин в API Assist для запросов к гибдд.рф, РСА и ЕАИСТО. Ключ и ответы хранятся только на этом телефоне.</span></label>' +
        '<p class="sheet-text" style="font-size:13px;color:#5B5F66">В этом месяце: ' + u.n + " из " + MONTH_LIMIT + " запросов (бесплатный тариф — 200). Штрафы обновляются раз в сутки, ОСАГО и техосмотр — раз в неделю.</p>" +
        '<span id="gvErr" class="err" hidden></span><div id="gvOut"></div>' +
        '<button class="btn-accent" data-action="gv-save">Сохранить</button>' +
        (c ? '<button class="btn-light" data-action="gv-test" style="height:48px">Проверить подключение</button>' : "") +
        (k ? '<button class="linkbtn" data-action="gv-off" style="align-self:center">Отключить и удалить ключ</button>' : ""),
      onMount: function (b) {
        function fail(t) { var e = b.querySelector("#gvErr"); e.textContent = t; e.hidden = !t; }
        function saveForm() {
          var nk = b.querySelector("#gvKey").value.trim(), st = b.querySelector("#gvSts"), sts = st ? normSts(st.value) : "";
          if (nk && !validKey(nk)) { fail("Ключ — латинские буквы, цифры, «-» и «_», от 8 символов."); return false; }
          if (sts && !validSts(sts)) { fail("СТС — 10 знаков: 2 цифры, 2 буквы или цифры, 6 цифр."); return false; }
          if (nk && !b.querySelector("#gvConsent").checked) { fail("Без согласия запросы не отправляются."); return false; }
          fail("");
          lsSet(K.key, nk || null);
          lsSet(K.consent, nk && b.querySelector("#gvConsent").checked ? (consent() || { at: now() }) : null);
          if (c && st && sts !== normSts(c.sts)) window.AutoHubCar.update(c.id, { sts: sts || null });
          return true;
        }
        b.addEventListener("click", function (e) {
          var a = e.target.closest("[data-action]"); if (!a) return;
          if (a.dataset.action === "gv-save") {
            if (!saveForm()) return;
            UI().close(function () { refreshAll(); UI().toast(ready() ? "Госданные подключены" : "Сохранено"); });
          }
          if (a.dataset.action === "gv-off") {
            lsSet(K.key, null); lsSet(K.consent, null); lsSet(K.cache, null);
            UI().close(function () { refreshAll(); UI().toast("Ключ удалён с телефона"); });
          }
          if (a.dataset.action === "gv-test") {
            if (!saveForm()) return;
            if (!ready()) { fail("Введите ключ и отметьте согласие."); return; }
            var out = b.querySelector("#gvOut"), car = active(); a.disabled = true; out.innerHTML = '<div class="loading">Проверяем три API…</div>';
            function line(t, r) { return "<div><span>" + esc(t) + "</span><b>" + esc(r) + "</b></div>"; }
            function why(e) { return "ошибка: " + (e && e.message || e); }
            Promise.all([
              fines(car, { force: true }).then(function (r) { return r ? (r.items.length ? r.items.length + " неоплач." : "нет неоплаченных") : "нет СТС"; }, why),
              osago(car, { force: true }).then(function (r) {
                if (!r) return "нет VIN и госномера"; if (!r.policy) return "полис не найден";
                var p = r.policy, m = vinMatchesMask(car.vin, p.vinMask);
                return p.company + " до " + fmtDate(p.end) + (p.vin ? " · VIN " + p.vin : p.vinMask ? " · VIN-маска " + p.vinMask + (m === false ? " (не совпадает!)" : m ? " (совпадает)" : "") : "");
              }, why),
              eaisto(car, { force: true }).then(function (r) { return !r ? "нет VIN" : r.card ? "ДК до " + fmtDate(r.card.end) + " · " + r.mileages.length + " замеров пробега" : "карт не найдено"; }, why)
            ]).then(function (res) {
              a.disabled = false;
              out.innerHTML = '<div class="kv">' + line("Штрафы", res[0]) + line("ОСАГО (РСА)", res[1]) + line("Техосмотр", res[2]) + "</div>";
              refreshAll();
            });
          }
        });
      } });
  }

  function refreshAll() {
    drawFinesBanner(); drawPassport();
    if (window.AutoHubScreens && window.AutoHubScreens.reloadFines) window.AutoHubScreens.reloadFines();
    syncDocs().then(drawPassport);
    if (window.AutoHubAuth && window.AutoHubAuth.renderProfile) window.AutoHubAuth.renderProfile();
  }

  function init() {
    document.addEventListener("click", function (e) { if (e.target.closest("[data-action=gov]")) settingsSheet(); });
    window.addEventListener("hashchange", function () {
      var h = location.hash;
      if (h === "#Fines") drawFinesBanner();
      if (h === "#Docs" || h === "#Insurance" || h === "#Garage") syncDocs();
      if (h === "#CarPassport") syncDocs().then(drawPassport);
    });
    window.addEventListener("autohub:car", function () { drawFinesBanner(); drawPassport(); });
    drawFinesBanner(); if (ready()) syncDocs();
  }

  window.AutoHubGov = { init: init, ready: ready, fines: fines, osago: osago, eaisto: eaisto, open: settingsSheet, usage: usage, syncDocs: syncDocs,
    _test: { parse: parse, mapFines: mapFines, pickPolicy: pickPolicy, mapEaisto: mapEaisto, vinMatchesMask: vinMatchesMask, validSts: validSts, normSts: normSts,
      validKey: validKey, request: request, K: K, MONTH_LIMIT: MONTH_LIMIT } };
})();
