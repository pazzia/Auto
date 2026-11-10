/* Тесты AUTO-48: состав веб-приложения (PWA) в собранной папке app/src/main/assets/www.
 * Запуск: python3 tools/build_prototype.py && node --test tests/pwa.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WWW = path.join(__dirname, "..", "app", "src", "main", "assets", "www");
const read = (f) => fs.readFileSync(path.join(WWW, f), "utf8");

test("манифест: имя, запуск в отдельном окне, относительные адреса, значки на месте", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.name, "АвтоХаб");
  assert.equal(m.display, "standalone");
  assert.ok(m.start_url.startsWith("./") && m.scope === "./", "адреса относительные — приложение живёт в подпапке /Auto/");
  const sizes = m.icons.map((i) => i.sizes + ":" + i.purpose);
  assert.ok(sizes.includes("192x192:any") && sizes.includes("512x512:any") && sizes.includes("512x512:maskable"));
  for (const i of m.icons) {
    const png = fs.readFileSync(path.join(WWW, i.src));
    assert.equal(png.readUInt32BE(0), 0x89504e47, i.src + " — PNG");
    assert.equal(png.readUInt32BE(16) + "x" + png.readUInt32BE(20), i.sizes, i.src + " — размер как в манифесте");
  }
});

test("страница: манифест, значок для iPhone, модуль установки, без обращений к чужим сайтам при запуске", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="pwa\/apple-touch-icon\.png">/);
  assert.match(html, /<script src="pwa\.js"><\/script>/);
  assert.ok(fs.existsSync(path.join(WWW, "pwa", "apple-touch-icon.png")));
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/);
});

test("сервис-воркер: кэш с номером сборки, все файлы из списка существуют, в списке — всё приложение", () => {
  const sw = read("sw.js");
  assert.doesNotMatch(sw, /__CACHE__|__FILES__/);
  const ctx = { self: { addEventListener() {}, location: {}, registration: {} }, caches: {}, URL };
  vm.createContext(ctx);
  vm.runInContext(sw.replace(/^const /gm, "var "), ctx);
  const build = fs.readFileSync(path.join(__dirname, "..", "VERSION"), "utf8").trim();
  assert.match(ctx.CACHE, new RegExp("^autohub-" + build.replace(".", "\\.") + "-[0-9a-f]{10}$"));
  assert.equal(ctx.FILES[0], "./");
  for (const f of ctx.FILES.slice(1)) assert.ok(fs.existsSync(path.join(WWW, f)), "нет файла " + f);
  const scripts = [...read("index.html").matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) assert.ok(ctx.FILES.includes(s), s + " не попал в кэш — офлайн не заработает");
  for (const f of ["index.html", "manifest.webmanifest", "pwa/icon-192.png", "map/podmoskovye.svg"]) assert.ok(ctx.FILES.includes(f), f);
  assert.ok(!ctx.FILES.includes("sw.js"));
});
