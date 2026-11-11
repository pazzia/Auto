/* Тесты чистой логики веб-слоя: регламент ТО, цены, штрафы, ошибки API, марки vPIC, гараж и перенос из 0.4.
 * Модули web/*.js загружаются в vm-контексте с заглушками window, localStorage и document.
 * Запуск: node --test tests/web-logic.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WEB = path.join(__dirname, "..", "web");

function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _map: m
  };
}

/** Контекст с заглушками браузера; files — модули из web/ по порядку. */
function load(files, opts = {}) {
  const ls = storage(opts.localStorage);
  const win = {
    AUTOHUB_CONFIG: Object.assign({ latency: [0, 0] }, opts.config),
    addEventListener() {},
    dispatchEvent() {}
  };
  const document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {}
  };
  const ctx = {
    window: win, localStorage: ls, sessionStorage: storage(), document,
    location: { search: opts.search || "", hash: "" },
    history: { replaceState() {}, back() {} },
    setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(),
    fetch: opts.fetch || (() => Promise.reject(new Error("offline"))),
    CustomEvent: function CustomEvent() {}, Event: function Event() {},
    console, Promise, Date, Math, JSON
  };
  win.localStorage = ls;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(WEB, f), "utf8"), ctx, { filename: f });
  return { win, ls, ctx };
}

/* ---------- Регламент ТО ---------- */
test("nextTO: после нескольких пропущенных ТО статус «пора» не пропадает", () => {
  const { win } = load(["ui.js", "api.js"]);
  const t = win.AutoHubApi.maintenance.nextTO({ mileage: 90001, lastTOkm: 60000 });
  assert.equal(t.km, 90000); // ближайшее кратное шагу, которое уже пройдено
  assert.equal(t.overdue, true);
  assert.ok(t.left < 0);
  assert.ok(t.items.length > 0);
});

test("nextTO: один пропуск — ТО по последнему + шаг, просрочено", () => {
  const { win } = load(["ui.js", "api.js"]);
  const t = win.AutoHubApi.maintenance.nextTO({ mileage: 89999, lastTOkm: 60000 });
  assert.equal(t.km, 75000);
  assert.equal(t.overdue, true);
});

test("nextTO: ровно 45 000 без прошлого ТО — это ТО-45 000", () => {
  const { win } = load(["ui.js", "api.js"]);
  const t = win.AutoHubApi.maintenance.nextTO({ mileage: 45000 });
  assert.equal(t.km, 45000);
  assert.equal(t.left, 0);
  assert.equal(t.overdue, true);
});

test("nextTO: обычный случай и пробег не указан", () => {
  const { win } = load(["ui.js", "api.js"]);
  const M = win.AutoHubApi.maintenance;
  const t = M.nextTO({ mileage: 58400 });
  assert.equal(t.km, 60000);
  assert.equal(t.left, 1600);
  assert.equal(t.soon, true);
  assert.equal(t.overdue, false);
  assert.equal(t.items.length, 7); // ТО-60 000: все работы регламента, включая свечи
  assert.equal(M.nextTO({}).noMileage, true);
});

test("nextTO: последнее ТО на некруглом пробеге — состав работ по номеру ТО", () => {
  const { win } = load(["ui.js", "api.js"]);
  const t = win.AutoHubApi.maintenance.nextTO({ mileage: 70000, lastTOkm: 61000 });
  assert.equal(t.km, 76000);
  assert.ok(t.items.length >= 4);
});

/* ---------- Цены ---------- */
test("worksPrice: базовая цена сервиса + доплаты регламента (одна цифра на всех экранах)", () => {
  const { win } = load(["ui.js", "api.js"]);
  const M = win.AutoHubApi.maintenance;
  const t = M.nextTO({ mileage: 58400 });
  assert.equal(M.worksPrice({ priceTO: 3900 }, t.items), 5950);
  assert.equal(M.worksPrice({ priceTO: 3900 }, []), 3900);
  assert.deepEqual({ ...M.priceVerdict(5950, 6650) }, { verdict: "ok", diffPct: -11 });
  assert.equal(M.priceVerdict(7250, 6650).verdict, "high");
  assert.equal(M.priceVerdict(4000, 6650).verdict, "low");
});

/* ---------- Штрафы ---------- */
test("fines.list: штрафы только у демо-машины, скидка до discountUntil, суммы как на экране", async () => {
  const { win } = load(["ui.js", "api.js"]);
  const F = win.AutoHubApi.fines;
  const demo = await F.list({ demo: true, plate: "А123ВС", region: "177" });
  assert.equal(demo.items.length, 2);
  const sum = demo.items.reduce((s, f) => s + f.discountAmount, 0);
  assert.equal(sum, 750);
  const today = win.AutoHubUI.dates.iso();
  for (const f of demo.items) {
    assert.ok(f.discountUntil >= today, "скидка ещё действует");
    assert.ok(f.date < today);
    assert.equal(f.discountAmount * 2, f.amount);
  }
  const own = await F.list({ demo: false, plate: "А123ВС", region: "177" });
  assert.equal(own.items.length, 0);
  const paid = await F.pay(["f1"]);
  assert.equal(paid.receipts.length, 1);
  assert.equal(paid.receipts[0].fineId, "f1");
});

/* ---------- Ошибки live ---------- */
test("backend: без baseUrl — not_configured, сеть — network, не JSON — bad_json, HTTP — http_<код>", async () => {
  let api = load(["ui.js", "api.js"], { search: "?api=live" }).win.AutoHubApi;
  await assert.rejects(api.services.list({}), (e) => e.code === "not_configured");

  api = load(["ui.js", "api.js"], { config: { mode: "live", baseUrl: "https://example.invalid" }, fetch: () => Promise.reject(new TypeError("Failed to fetch")) }).win.AutoHubApi;
  await assert.rejects(api.fines.list({}), (e) => e.code === "network");
  assert.match(api.errorText({ code: "network" }), /Нет связи/);

  api = load(["ui.js", "api.js"], { config: { mode: "live", baseUrl: "https://x" }, fetch: () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected token <")) }) }).win.AutoHubApi;
  await assert.rejects(api.parts.get("p1"), (e) => e.code === "bad_json");

  api = load(["ui.js", "api.js"], { config: { mode: "live", baseUrl: "https://x" }, fetch: () => Promise.resolve({ ok: false, status: 503 }) }).win.AutoHubApi;
  await assert.rejects(api.sos.request({}), (e) => e.code === "http_503");
});

/* ---------- Марки из vPIC ---------- */
test("decodeVin (live): написание марок — BMW, Mercedes-Benz, Kia, аббревиатуры и дефисы", async () => {
  const cases = { BMW: "BMW", "MERCEDES-BENZ": "Mercedes-Benz", KIA: "Kia", TOYOTA: "Toyota", GMC: "GMC", "LAND ROVER": "Land Rover", "HARLEY-DAVIDSON": "Harley-Davidson", McLaren: "McLaren" };
  for (const [raw, want] of Object.entries(cases)) {
    const fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({ Results: [{ Make: raw, Model: "X", ModelYear: "2020" }] })) });
    const api = load(["ui.js", "api.js"], { search: "?api=live", fetch }).win.AutoHubApi;
    const r = await api.vehicle.decodeVin("WBA00000000000000");
    assert.equal(r.make, want, raw);
  }
});

/* ---------- Общие утилиты интерфейса ---------- */
test("ui: esc экранирует кавычки, safeImg пропускает только картинки, даты — местные", () => {
  const { win } = load(["ui.js"]);
  const U = win.AutoHubUI;
  assert.equal(U.esc(`<a href='x' title="y">&`), "&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;");
  assert.equal(U.safeImg("data:image/jpeg;base64,AAAA"), "data:image/jpeg;base64,AAAA");
  assert.equal(U.safeImg("blob:https://app/1234-ab"), "blob:https://app/1234-ab");
  assert.equal(U.safeImg('x" onerror="alert(1)'), "");
  assert.equal(U.safeImg("javascript:alert(1)"), "");
  assert.equal(U.safeImg('data:image/png;base64,AA" onerror="x'), "");
  const d = new Date(2026, 10, 6, 23, 59);
  assert.equal(U.dates.iso(d), "2026-11-06"); // не UTC
  assert.equal(U.dates.dayMonth("2026-11-06"), "6 ноября");
  assert.equal(U.dates.iso(U.dates.addDays("2026-12-31", 1)), "2027-01-01");
});

/* ---------- Гараж ---------- */
function carCtx(init) {
  const env = load(["ui.js", "api.js", "car.js"], { localStorage: init });
  return env;
}
test("гараж: перенос из 0.4 сохраняется сразу, id стабилен, осиротевшие данные спасены", () => {
  const t0 = Date.now() - 20 * 864e5, orphan = "c" + t0.toString(36) + "ab12";
  const { win, ls } = carCtx({
    "autohub.car.v1": JSON.stringify({ make: "Lada", model: "Vesta", vin: "XTA219170K0123456", mileage: 40000 }),
    "autohub.fuel.v1": JSON.stringify({ [orphan]: [{ id: "f1", km: 39000 }], demo: [{ id: "d" }] }),
    "autohub.orders.v1": JSON.stringify({ [orphan]: { carId: orphan, km: 45000 } })
  });
  const a = win.AutoHubCar.cars(), b = win.AutoHubCar.cars();
  assert.equal(a.length, 1);
  assert.equal(a[0].id, b[0].id);
  assert.equal(ls.getItem("autohub.car.v1"), null);
  const fuel = JSON.parse(ls.getItem("autohub.fuel.v1")), orders = JSON.parse(ls.getItem("autohub.orders.v1"));
  assert.deepEqual(Object.keys(fuel).sort(), [a[0].id, "demo"].sort());
  assert.equal(orders[a[0].id].carId, a[0].id);
});

test("гараж: id, выданный позже машины из 0.4 (удалённая машина), не переносится", () => {
  const tCar = Date.now() - 10 * 864e5, later = "c" + (tCar + 864e5).toString(36) + "zz99", carId = "c" + tCar.toString(36) + "aa11";
  const { win, ls } = carCtx({
    "autohub.car.v1": JSON.stringify({ make: "Lada", model: "Vesta", vin: "XTA219170K0123456" }),
    "autohub.garage.v1": JSON.stringify({ cars: [{ id: carId, make: "Lada", model: "Vesta", vin: "XTA219170K0123456" }], activeId: carId }),
    "autohub.history.v1": JSON.stringify({ [later]: [{ id: "h" }] })
  });
  win.AutoHubCar.cars();
  assert.deepEqual(Object.keys(JSON.parse(ls.getItem("autohub.history.v1"))), [later]);
  assert.equal(ls.getItem("autohub.car.v1"), null);
});

test("гараж: удаление машины стирает все её данные", () => {
  const { win, ls } = carCtx({
    "autohub.garage.v1": JSON.stringify({ cars: [{ id: "cA", make: "Kia" }, { id: "cB", make: "Lada" }], activeId: "cA" }),
    "autohub.history.v1": JSON.stringify({ cA: [1], cB: [2] }),
    "autohub.fuel.v1": JSON.stringify({ cA: [1] }), "autohub.chat.v1": JSON.stringify({ cA: [1] }),
    "autohub.todraft.v1": JSON.stringify({ cA: {} }), "autohub.orders.v1": JSON.stringify({ cA: { carId: "cA" } }),
    "autohub.ach.mileage.v1": JSON.stringify({ cA: { months: {} } }),
    "autohub.booking.v1": JSON.stringify({ carId: "cA" }), "autohub.osago.v1": JSON.stringify({ carId: "cA" }),
    "autohub.fines.v1": JSON.stringify({ f1: { carId: "cA" }, f2: { carId: "cB" } })
  });
  win.AutoHubCar.remove("cA");
  for (const k of ["history", "fuel", "chat", "todraft", "orders", "ach.mileage"]) {
    assert.ok(!("cA" in JSON.parse(ls.getItem(`autohub.${k}.v1`))), k);
  }
  assert.deepEqual(JSON.parse(ls.getItem("autohub.history.v1")), { cB: [2] });
  assert.equal(ls.getItem("autohub.booking.v1"), null);
  assert.equal(ls.getItem("autohub.osago.v1"), null);
  assert.deepEqual(JSON.parse(ls.getItem("autohub.fines.v1")), { f2: { carId: "cB" } });
  assert.equal(win.AutoHubCar.active().id, "cB");
});
