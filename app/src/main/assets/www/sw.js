/* АвтоХаб: сервис-воркер веб-приложения (PWA). Собирается tools/build_prototype.py:
 * в CACHE подставляется имя кэша (номер сборки + хеш файлов), в FILES — список файлов приложения.
 * Всё приложение кладётся в кэш при установке и дальше открывается без интернета.
 * Запросы к чужим адресам (открытая база VIN и т. п.) и к посреднику API на своём сервере (/x/…) идут в сеть
 * как обычно и не кэшируются.
 * Движок распознавания (OCR_DIR, ~10 МБ) не входит в установку: скачивается при первом распознавании и хранится
 * в отдельном кэше, который переживает обновления приложения (папка названа по версиям движка и моделей).
 */
const CACHE = "autohub-0.22-0961030187";
const FILES = ["./", "achievements.js", "api.js", "auth.js", "bodyphoto.js", "calc.js", "car.js", "cart.js", "checklists.js", "device.js", "diy.js", "docs.js", "document-parser.js", "documents.js", "fonts/OFL.txt", "fuel.js", "gov.js", "hub.js", "icons.js", "index.html", "kit.js", "manifest.webmanifest", "map/podmoskovye.svg", "mechanic.js", "ocr-prep.js", "ocr-web.js", "parking.js", "parts.js", "pwa.js", "pwa/apple-touch-icon.png", "pwa/icon-192.png", "pwa/icon-512.png", "pwa/icon-maskable-512.png", "pwa/icon.svg", "screens.js", "season.js", "services.js", "to.js", "ui.js", "vincod.js", "wallet.js"];
const OCR_DIR = "ocr/t7.0.0-p5.4.394-m8741641/";
const OCR_CACHE = "autohub-ocr-" + OCR_DIR.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("autohub-") && k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужие адреса — мимо кэша
  const base = new URL(self.registration.scope);
  if (url.pathname.startsWith(base.pathname + "x/")) return; // посредник API: ответы с ключами и персональными данными не кэшируем
  if (url.pathname.startsWith(base.pathname + OCR_DIR)) {
    // Движок распознавания: из своего кэша, при первом обращении — из сети
    event.respondWith(caches.open(OCR_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  // Переход по адресу приложения (в том числе с ?demo=fleet) — всегда оболочка из кэша
  const key = req.mode === "navigate" ? new URL("index.html", self.registration.scope).href : req;
  event.respondWith(
    caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(new URL("index.html", self.registration.scope).href)))
  );
});
