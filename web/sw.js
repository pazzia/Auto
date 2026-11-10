/* АвтоХаб: сервис-воркер веб-приложения (PWA). Собирается tools/build_prototype.py:
 * в CACHE подставляется имя кэша (номер сборки + хеш файлов), в FILES — список файлов приложения.
 * Всё приложение кладётся в кэш при установке и дальше открывается без интернета.
 * Запросы к чужим адресам (открытая база VIN и т. п.) идут в сеть как обычно и не кэшируются.
 */
const CACHE = "__CACHE__";
const FILES = __FILES__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("autohub-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужие адреса — мимо кэша
  // Переход по адресу приложения (в том числе с ?demo=fleet) — всегда оболочка из кэша
  const key = req.mode === "navigate" ? new URL("index.html", self.registration.scope).href : req;
  event.respondWith(
    caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(new URL("index.html", self.registration.scope).href)))
  );
});
