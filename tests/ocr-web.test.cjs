/* Тесты AUTO-49/50: веб-версия — распознавание в браузере и посредник API на своём сервере.
 * Запуск: python3 tools/build_prototype.py && node --test tests/ocr-web.test.cjs
 * Подготовка снимка web/ocr-prep.js — порт OcrPreprocess.java; совпадение с Java бит в бит проверялось на снимках
 * приёмки (app/src/androidTest/assets/acceptance), здесь — те же проверки, что в tests/OcrPreprocessCheck.java.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "web", "ocr-prep.js"));

test("подготовка снимка: линии таблицы стираются, буквы остаются, мелкое фото увеличивается", () => {
  const w = 600, h = 800, px = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, v) => { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; px[i] = 0xF0; px[i + 1] = 0xEE; px[i + 2] = 0xE8; px[i + 3] = 255; }
  for (let x = 20; x < 580; x++) { put(x, 200, 0x30); put(x, 201, 0x30); } // линия таблицы
  for (let y = 100; y < 700; y++) put(300, y, 0x30);                         // вертикальная линия
  for (let y = 150; y < 170; y++) for (let x = 50; x < 54; x++) put(x, y, 0x10); // «буква»
  const size = P.targetSize(w, h, 2400, 8e6);
  assert.deepEqual([size[0], size[1]], [1800, 2400], "мелкое фото увеличено до 2400 px по длинной стороне");
  const lim = P.targetSize(4000, 3000, 3000, 2e6);
  assert.ok(lim[0] * lim[1] <= 2e6 + 4000, "ограничение по мегапикселям");
  const [ow, oh] = size, k = 3;
  const out = P.process(px, w, h, ow, oh, true, true);
  assert.equal(out[(160 * k) * ow + 52 * k], 0, "буква осталась чёрной");
  assert.equal(out[(200 * k + 1) * ow + 150 * k], 255, "горизонтальная линия стёрта");
  assert.equal(out[(400 * k) * ow + 300 * k + 1], 255, "вертикальная линия стёрта");
  assert.equal(out[10 * ow + 10], 255, "фон белый");
  const keep = P.process(px, w, h, ow, oh, false, true);
  assert.equal(keep[(200 * k + 1) * ow + 150 * k], 0, "без удаления линий линия остаётся");
  const gray = P.process(px, w, h, ow, oh, true, false);
  assert.equal(gray[(200 * k + 1) * ow + 150 * k], 255, "серый проход: линия закрашена белым");
  assert.ok(gray[(160 * k) * ow + 52 * k] < 128, "серый проход: буква тёмная");
});

function loadApi(protocol) {
  const win = { AUTOHUB_CONFIG: { latency: [0, 0] }, addEventListener() {} };
  const ctx = { window: win, location: { search: "", hash: "", protocol }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    setTimeout, clearTimeout, console, Promise, JSON, Date, Math, encodeURIComponent };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "web", "api.js"), "utf8"), ctx, { filename: "api.js" });
  return win.AutoHubApi;
}

test("посредник: на своём сервере (https) внешние API идут через /x/…, локально и в APK — напрямую", () => {
  const A = loadApi("https:");
  assert.equal(A.http.viaProxy("https://api.avtovincod.ru/decode?vin=X7TEST00000000001"), "/x/avc/decode?vin=X7TEST00000000001");
  assert.equal(A.http.viaProxy("https://service.api-assist.com/parser/fines_api/?key=k&sts=1"), "/x/gov/parser/fines_api/?key=k&sts=1");
  assert.equal(A.http.viaProxy("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/1?format=json"), "/x/vpic/api/vehicles/DecodeVinValues/1?format=json");
  assert.equal(A.http.viaProxy("https://example.com/a"), "https://example.com/a", "чужие адреса не подменяются");
  assert.equal(A.http.viaProxy("https://api.avtovincod.ru.evil.com/x"), "https://api.avtovincod.ru.evil.com/x");
  assert.equal(loadApi("http:").http.viaProxy("https://api.avtovincod.ru/balance"), "https://api.avtovincod.ru/balance");
  assert.equal(loadApi("file:").http.viaProxy("https://api.avtovincod.ru/balance"), "https://api.avtovincod.ru/balance");
});

test("Caddy: маршруты посредника совпадают с адресами в api.js, только GET, setup.sh ставит тот же Caddyfile", () => {
  const caddy = fs.readFileSync(path.join(ROOT, "deploy", "server", "Caddyfile"), "utf8");
  const routes = [...caddy.matchAll(/handle_path \/x\/(\w+)\/\* \{\s*import api_proxy ([\w.-]+)/g)].map((m) => m[2] + "→" + m[1]).sort();
  assert.deepEqual(routes, ["api.avtovincod.ru→avc", "service.api-assist.com→gov", "vpic.nhtsa.dot.gov→vpic"]);
  assert.match(caddy, /@write not method GET\s+respond @write 405/);
  assert.match(caddy, /header_up -Cookie/);
  assert.doesNotMatch(caddy, /^\s*log\b/m, "журнал запросов не ведётся: в адресах госданных — ключ");
  const setup = fs.readFileSync(path.join(ROOT, "deploy", "server", "setup.sh"), "utf8");
  assert.ok(setup.includes(caddy), "setup.sh должен содержать актуальный Caddyfile");
});

test("сборка: движок распознавания подключён, воркер подготовки в кэше, движок и ответы API — нет", () => {
  const WWW = path.join(ROOT, "app", "src", "main", "assets", "www");
  const html = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
  const dir = /window\.AUTOHUB_OCR_DIR = "(ocr\/[^"]+\/)"/.exec(html);
  assert.ok(dir, "в index.html задана папка движка");
  assert.match(html, /<script src="ocr-web\.js"><\/script>/);
  const sw = fs.readFileSync(path.join(WWW, "sw.js"), "utf8");
  const handlers = {};
  const ctx = { self: { addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: "https://h" }, registration: { scope: "https://h/" } }, caches: { open: () => new Promise(() => {}), match: () => new Promise(() => {}) }, URL };
  vm.createContext(ctx);
  vm.runInContext(sw.replace(/^const /gm, "var "), ctx);
  assert.equal(ctx.OCR_DIR, dir[1]);
  assert.ok(ctx.FILES.includes("ocr-prep.js") && ctx.FILES.includes("ocr-web.js"));
  assert.ok(!ctx.FILES.some((f) => f.startsWith("ocr/")), "движок (~10 МБ) не скачивается при установке");
  const responded = (url) => { let r = false; handlers.fetch({ request: { method: "GET", url, mode: "cors" }, respondWith: () => { r = true; } }); return r; };
  assert.equal(responded("https://h/x/avc/decode?vin=1"), false, "ответы посредника не кэшируются");
  assert.equal(responded("https://h/" + dir[1] + "lang/rus.traineddata"), true);
  const py = fs.readFileSync(path.join(ROOT, "tools", "web_ocr.py"), "utf8");
  assert.match(py, /def ocr_dir/);
});
