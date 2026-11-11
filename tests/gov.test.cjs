/* Тесты AUTO-45: разбор ответов API Assist (примеры — из документации api-assist.com/documentation/*-api.txt),
 * согласие и ключ, кэш, учёт лимита, подстановка штрафов в AutoHubApi.fines.list.
 * Запуск: node --test tests/gov.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WEB = path.join(__dirname, "..", "web");

function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
}
/** api.js + gov.js в vm; fetch подменяется: каждый вызов записывается, ответ — из responder(url). */
function load(opts = {}) {
  const ls = storage(opts.localStorage);
  const calls = [];
  const win = { AUTOHUB_CONFIG: { latency: [0, 0] }, addEventListener() {}, dispatchEvent() {} };
  const ctx = {
    window: win, localStorage: ls, document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    location: { search: "", hash: "" }, setTimeout, clearTimeout, console, Promise, JSON, Date, Math,
    encodeURIComponent, decodeURIComponent,
    fetch: (url) => { calls.push(url); const r = (opts.responder || (() => ({ status: 200, body: { success: 1 } })))(url);
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: () => Promise.resolve(typeof r.body === "string" ? r.body : JSON.stringify(r.body)) }); }
  };
  win.window = win; win.localStorage = ls; win.fetch = ctx.fetch;
  vm.createContext(ctx);
  for (const f of ["api.js", "gov.js"]) vm.runInContext(fs.readFileSync(path.join(WEB, f), "utf8"), ctx, { filename: f });
  return { win, ls, calls, G: win.AutoHubGov, T: win.AutoHubGov._test, API: win.AutoHubApi };
}
const ON = { "autohub.gov.key.v1": JSON.stringify("test_key_12345"), "autohub.gov.consent.v1": JSON.stringify({ at: 1 }) };
const CAR = { id: "c1", vin: "WBANX31040C174862", plate: "А123ВС", region: "177", sts: "99 АА 123456" };

const FINES = { success: 1, fines: [
  { enable_discount: false, date_discount: null, num_post: "0355431010126011401013248", sum: 5000, division_name: "Администратор Московского парковочного пространства (ГКУ АМПП)", date_post: "2026-01-14", paid: false },
  { enable_discount: true, date_discount: "2026-04-29 00:00:00", num_post: "18810550260330143671", sum: 750, division_name: "УФК по Московской области", date_post: "2026-03-30", paid: false },
  { enable_discount: false, date_discount: null, num_post: "18810000000000000001", sum: 500, division_name: "ГИБДД", date_post: "2025-12-01", paid: true }
] };
const RSA = { rsa_done: 1, policies: [
  { companyName: "Страховое публичное акционерное общество \"Ингосстрах\"", policySerial: "ХХХ", policyNumber: "0451703060", vin: null, vin_mask: "WBANX31040C1*****", regNumber: null, regNumber_mask: "А1***С177", mark: "BMW", model: "X5", startDate: "2024-09-29", endDate: "2025-09-28", status: "Прекратил действие" },
  { companyName: "АО «СОГАЗ»", policySerial: "ХХХ", policyNumber: "0500000001", vin: null, vin_mask: "WBANX31040C1*****", startDate: "2025-09-29", endDate: "2026-09-28", status: "Действует" }
] };
const EAISTO = { kbm_done: 1, mileages_done: 1,
  diagnose_cards: [{ number: "201610101449162544920", startDate: "10.10.2016", endDate: "10.10.2017", vin: "WBANX31040C174862", mileage: "130811" }],
  mileages: [{ date: "10.10.2016", mileage: 130811 }, { date: "19.09.2015", mileage: "102758" }, { date: "01.09.2014", mileage: "110000" }] };

test("разбор ответа: успех, ошибки ключа и лимита, сбой источника", () => {
  const { T } = load();
  assert.equal(T.parse("fines", 200, { success: 1 }).success, 1);
  assert.equal(T.parse("rsa", 200, { rsa_done: 1, policies: [] }).rsa_done, 1);
  assert.throws(() => T.parse("fines", 403, { error: "Invalid access key", error_code: 40301 }), { code: "gov_key" });
  assert.throws(() => T.parse("fines", 403, { error: "Month limit of requests exceeded", error_code: 40305 }), { code: "gov_month_limit" });
  assert.throws(() => T.parse("fines", 400, { error: "bad", error_code: 40001 }), { code: "bad_request" });
  assert.throws(() => T.parse("fines", 200, { success: 0 }), { code: "source_unavailable" });
  assert.throws(() => T.parse("rsa", 200, { rsa_done: 0 }), { code: "source_unavailable" });
  assert.throws(() => T.parse("eaisto", 502, null), { code: "source_unavailable" });
});

test("штрафы: оплаченные скрыты, скидка 50% только с датой, УИН замаскирован", () => {
  const { T } = load();
  const l = T.mapFines(FINES);
  assert.equal(l.length, 2);
  assert.equal(l[0].id, "g18810550260330143671"); // свежие сверху
  assert.equal(l[0].discountUntil, "2026-04-29");
  assert.equal(l[0].discountAmount, 375);
  assert.equal(l[0].uin, "•••3671");
  assert.equal(l[0].uinFull, "18810550260330143671");
  assert.equal(l[1].discountUntil, null);
  assert.equal(l[1].amount, 5000);
  assert.ok(l.every((f) => f.live));
  assert.equal(T.mapFines({ success: 1 }).length, 0); // «штрафы не найдены»
});

test("ОСАГО: выбирается действующий полис, маска VIN сверяется", () => {
  const { T } = load();
  const p = T.pickPolicy(RSA);
  assert.equal(p.end, "2026-09-28");
  assert.equal(p.company, "АО СОГАЗ");
  assert.equal(T.vinMatchesMask("WBANX31040C174862", p.vinMask), true);
  assert.equal(T.vinMatchesMask("XWEFC41ABKC001234", p.vinMask), false);
  assert.equal(T.pickPolicy({ rsa_done: 1, policies: [] }), null);
});

test("ЕАИСТО: действующая карта, пробег по датам, падение пробега замечено", () => {
  const { T } = load();
  const r = T.mapEaisto(EAISTO);
  assert.equal(r.card.end, "2017-10-10");
  assert.equal(r.card.mileage, 130811);
  assert.equal(r.mileages.map((m) => m.date).join(), "2014-09-01,2015-09-19,2016-10-10");
  assert.equal(r.drops, 1); // 110 000 → 102 758
});

test("СТС и ключ: проверка формата", () => {
  const { T } = load();
  assert.equal(T.validSts("99 АА 123456"), true);
  assert.equal(T.validSts("9912123456"), true);
  assert.equal(T.validSts("99АА12345"), false);
  assert.equal(T.normSts("99 аа 123456"), "99АА123456");
  assert.equal(T.validKey("short"), false);
  assert.equal(T.validKey("test_key_12345"), true);
});

test("без ключа или согласия запросы не уходят, fines.list остаётся на заглушке", async () => {
  const noKey = load();
  await assert.rejects(noKey.T.request("fines", { sts: "1" }), { code: "gov_off" });
  const noConsent = load({ localStorage: { "autohub.gov.key.v1": JSON.stringify("test_key_12345") } });
  await assert.rejects(noConsent.T.request("fines", { sts: "1" }), { code: "gov_consent" });
  assert.equal(noConsent.calls.length, 0);
  const r = await noConsent.API.fines.list(CAR);
  assert.equal(r.live, undefined);
  assert.equal(noConsent.calls.length, 0);
});

test("штрафы через API Assist: запрос по СТС, кэш на сутки, учёт лимита", async () => {
  const env = load({ localStorage: ON, responder: () => ({ status: 200, body: FINES }) });
  const r = await env.API.fines.list(CAR);
  assert.equal(r.live, true);
  assert.equal(r.items.length, 2);
  assert.equal(env.calls.length, 1);
  assert.match(env.calls[0], /^https:\/\/service\.api-assist\.com\/parser\/fines_api\/fines\?key=test_key_12345&sts=99%D0%90%D0%90123456$/);
  await env.API.fines.list(CAR); // из кэша
  assert.equal(env.calls.length, 1);
  assert.equal(env.G.usage().n, 1);
  const noSts = await env.API.fines.list(Object.assign({}, CAR, { sts: "" }));
  assert.equal(noSts.needSts, true);
  const demo = await env.API.fines.list({ id: "demo", demo: true });
  assert.equal(demo.live, undefined);
});

test("ошибка 403 с телом доходит до пользователя, сбой источника не списывает лимит", async () => {
  const bad = load({ localStorage: ON, responder: () => ({ status: 403, body: { error: "Invalid access key", error_code: 40301 } }) });
  await assert.rejects(bad.API.fines.list(CAR), { code: "gov_key" });
  assert.match(bad.API.errorText({ code: "gov_key", message: "Ключ API Assist недействителен." }), /Ключ API Assist/);
  const flaky = load({ localStorage: ON, responder: () => ({ status: 200, body: { success: 0 } }) });
  await assert.rejects(flaky.API.fines.list(CAR), { code: "source_unavailable" });
  assert.equal(flaky.G.usage().n, 0);
});

test("мягкий предел запросов в месяц", async () => {
  const month = new Date().getFullYear() + "-" + ("0" + (new Date().getMonth() + 1)).slice(-2);
  const env = load({ localStorage: Object.assign({ "autohub.gov.usage.v1": JSON.stringify({ month, n: 180 }) }, ON) });
  await assert.rejects(env.T.request("fines", { sts: "99АА123456" }), { code: "gov_quota" });
  assert.equal(env.calls.length, 0);
});

test("ОСАГО по VIN, без VIN — по госномеру", async () => {
  const env = load({ localStorage: ON, responder: () => ({ status: 200, body: RSA }) });
  const r = await env.G.osago(CAR);
  assert.equal(r.policy.end, "2026-09-28");
  assert.match(env.calls[0], /rsa_api\/\?key=test_key_12345&vin=WBANX31040C174862$/);
  await env.G.osago({ id: "c2", plate: "А123ВС", region: "177" });
  assert.match(env.calls[1], /regNumber=%D0%90123%D0%92%D0%A1177$/);
});
