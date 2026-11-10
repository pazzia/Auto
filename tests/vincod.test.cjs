/* Тесты AUTO-46: спецификация по VIN (AvtoVinCod) и совместимость запчастей.
 * Ответы — настоящие ответы тестового режима api.avtovincod.ru (tests/fixtures/avtovincod/, данные синтетические).
 * Запуск: node --test tests/vincod.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WEB = path.join(__dirname, "..", "web");
const FIX = path.join(__dirname, "fixtures", "avtovincod");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), "utf8"));

function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function load(opts = {}) {
  const ls = storage(opts.localStorage), calls = [];
  const win = { AUTOHUB_CONFIG: { latency: [0, 0] }, addEventListener() {}, dispatchEvent() {} };
  const ctx = {
    window: win, localStorage: ls, document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    location: { search: "", hash: "" }, setTimeout, clearTimeout, console, Promise, JSON, Date, Math, encodeURIComponent, decodeURIComponent,
    fetch: (url, init) => { calls.push({ url, auth: init && init.headers && init.headers.Authorization });
      const r = (opts.responder || (() => ({ status: 200, body: { success: 1 } })))(url);
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: () => Promise.resolve(JSON.stringify(r.body)) }); }
  };
  win.window = win; win.localStorage = ls; win.fetch = ctx.fetch;
  vm.createContext(ctx);
  for (const f of ["api.js", "vincod.js"]) vm.runInContext(fs.readFileSync(path.join(WEB, f), "utf8"), ctx, { filename: f });
  return { win, calls, VC: win.AutoHubVinCod, T: win.AutoHubVinCod._test, API: win.AutoHubApi };
}
const ON = { "autohub.avc.key.v1": JSON.stringify("avc_test_key_123"), "autohub.avc.consent.v1": JSON.stringify({ at: 1 }) };

test("расшифровка VIN → спецификация: код двигателя, КПП, привод, кузов, поколение", () => {
  const { T } = load();
  const r = T.mapDecode(fx("decode-test.json"), "X7TEST00000000001");
  assert.equal(r.variants.length, 1);
  assert.equal(r.full, true);
  const s = r.variants[0];
  assert.equal(s.brand, "LADA"); assert.equal(s.model, "Vesta"); assert.equal(s.year, 2021);
  assert.equal(s.engine.code, "21129"); assert.equal(s.engine.volumeL, 1.6); assert.equal(s.engine.powerPs, 106); assert.equal(s.engine.fuel, "бензин");
  assert.equal(s.transmission.code, "MT"); assert.equal(s.transmission.name, "5MT");
  assert.equal(s.drive, "передний"); assert.equal(s.body, "седан"); assert.equal(s.bodyCode, "GFL"); assert.equal(s.generation, "I");
  assert.equal(T.specLine(s), "1.6 бензин 106 л.с. (21129) · 5MT · передний · седан");
});

test("VIN по госномеру: VIN, СТС, марка, год", () => {
  const { T } = load();
  const r = T.mapGos2vin(fx("gos2vin-test.json"));
  assert.equal(r.vin, "X7TEST00000000001");
  assert.equal(r.sts, "0000000000");
  assert.equal(r.brand, "LADA"); assert.equal(r.year, 2021); assert.equal(r.isTaxi, false);
  assert.equal(T.mapGos2vin({ success: 1 }), null);
});

test("ошибки сервиса: нет денег, неверный ключ, сбой", () => {
  const { T } = load();
  assert.throws(() => T.parse(402, fx("err-balance.json")), { code: "avc_balance" });
  assert.throws(() => T.parse(401, { success: 0, error: "Bad token", code: "UNAUTHORIZED" }), { code: "avc_key" });
  assert.throws(() => T.parse(403, null), { code: "avc_key" });
  assert.throws(() => T.parse(502, null), { code: "source_unavailable" });
  assert.equal(T.parse(200, { success: 1 }).success, 1);
});

test("без ключа и согласия запросов нет; с ключом — Bearer, кэш, учёт расходов", async () => {
  const off = load();
  await assert.rejects(off.VC.decode("X7TEST00000000001"), { code: "avc_off" });
  assert.equal(off.calls.length, 0);
  const env = load({ localStorage: ON, responder: (u) => ({ status: 200, body: /gos2vin/.test(u) ? fx("gos2vin-test.json") : Object.assign({}, fx("decode-test.json"), { testMode: false, billing: { charged: 1.6 } }) }) });
  const r = await env.VC.decode("xwefc41abkc001234");
  assert.equal(r.variants[0].engine.code, "21129");
  assert.equal(env.calls[0].url, "https://api.avtovincod.ru/decode?vin=XWEFC41ABKC001234");
  assert.equal(env.calls[0].auth, "Bearer avc_test_key_123");
  await env.VC.decode("XWEFC41ABKC001234"); // из кэша
  assert.equal(env.calls.length, 1);
  assert.equal(env.VC.spent().rub, 1.6);
  const p = await env.VC.byPlate("т000тт", "00");
  assert.equal(p.vin, "X7TEST00000000001");
  assert.match(env.calls[1].url, /gos2vin\?plate=%D0%A2000%D0%A2%D0%A200$/);
});

test("месячный бюджет: платный запрос сверх бюджета не уходит, тестовый VIN — уходит", async () => {
  const month = new Date().getFullYear() + "-" + ("0" + (new Date().getMonth() + 1)).slice(-2);
  const env = load({ localStorage: Object.assign({ "autohub.avc.spend.v1": JSON.stringify({ month, rub: 199.5, n: 100 }) }, ON), responder: () => ({ status: 200, body: fx("decode-test.json") }) });
  await assert.rejects(env.VC.decode("XWEFC41ABKC001234"), { code: "avc_budget" });
  assert.equal(env.calls.length, 0);
  await env.VC.decode("X7TEST00000000001");
  assert.equal(env.calls.length, 1);
  assert.equal(env.VC.priceLabel("decode", { vin: "X7TEST00000000001" }), "бесплатно, тест");
  assert.equal(env.VC.priceLabel("gos2vin", { plate: "А123ВС77" }), "8 ₽");
});

const KIA = { make: "Kia", model: "Rio IV", year: 2019, spec: { brand: "KIA", model: "Rio", year: 2019, engine: { code: "G4FG", fuel: "бензин" }, transmission: { code: "AT" } } };
const KIA_MT = { make: "Kia", model: "Rio", year: 2019, spec: { brand: "KIA", model: "Rio", year: 2019, engine: { code: "G4FG", fuel: "бензин" }, transmission: { code: "MT" } } };
const LADA = { make: "Lada", model: "Vesta", year: 2021 };
const NOSPEC = { make: "Kia", model: "Rio", year: 2019, transmission: "АКПП" };

test("совместимость: по коду двигателя и КПП", () => {
  const { API } = load();
  const part = (id) => API.parts.search; // eslint-disable-line no-unused-vars
  const mann = { fits: { brands: ["kia", "hyundai"], engines: ["G4F", "G4L", "G4N"] } };
  const atf = { fits: { brands: ["kia", "hyundai"], trans: ["AT"] } };
  const pads = { fits: { brands: ["kia", "hyundai"], models: ["rio", "solaris"], years: [2017, 2023] } };
  const oil = { fits: { fuel: ["бензин"] } };
  assert.equal(API.parts.fit(mann, KIA).status, "fits");
  assert.match(API.parts.fit(mann, KIA).text, /G4FG/);
  assert.equal(API.parts.fit(atf, KIA).status, "fits");
  assert.equal(API.parts.fit(atf, KIA_MT).status, "no");
  assert.match(API.parts.fit(atf, KIA_MT).text, /АКПП/);
  assert.equal(API.parts.fit(mann, LADA).status, "no");          // другая марка
  assert.equal(API.parts.fit(pads, LADA).status, "no");
  assert.equal(API.parts.fit(mann, NOSPEC).status, "check");     // нет кода двигателя
  assert.match(API.parts.fit(mann, NOSPEC).text, /код двигателя/);
  assert.equal(API.parts.fit(atf, NOSPEC).status, "fits");       // КПП из текста «АКПП»
  assert.equal(API.parts.fit(pads, NOSPEC).status, "fits");
  assert.equal(API.parts.fit(oil, LADA).status, "check");        // топливо неизвестно
  assert.equal(API.parts.fit({ fits: { universal: "сверьте" } }, KIA).status, "check");
  assert.equal(API.parts.fit(pads, Object.assign({}, KIA, { year: 2012, spec: Object.assign({}, KIA.spec, { year: 2012 }) })).status, "no");
});

test("демо-каталог: у каждой детали есть условия применимости", async () => {
  const { API } = load();
  const r = await API.parts.search({});
  assert.ok(r.items.length >= 18);
  assert.ok(r.items.every((p) => p.fits && Object.keys(p.fits).length));
  const kiaFits = r.items.filter((p) => API.parts.fit(p, KIA).status === "fits").length;
  const ladaNo = r.items.filter((p) => API.parts.fit(p, LADA).status === "no").length;
  assert.ok(kiaFits >= 14, "Kia Rio G4FG AT: " + kiaFits);
  assert.ok(ladaNo >= 13, "Lada Vesta: " + ladaNo);
});
