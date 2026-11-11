/* Рисует значки веб-приложения (PWA) в web/pwa/ из одного SVG — машина на графитовом фоне.
 * Запуск: node tools/make_pwa_icons.js   (нужен Playwright с Chromium; в CI не запускается — PNG лежат в репозитории)
 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'web', 'pwa');
const CAR = '<path d="M12 31v-5l3.5-8.5h17L36 26v5z" fill="#fff"/><circle cx="17.5" cy="31.5" r="3.5" fill="#17191C" stroke="#fff" stroke-width="2.5"/><circle cx="30.5" cy="31.5" r="3.5" fill="#17191C" stroke="#fff" stroke-width="2.5"/><path d="M18 22.5h12" stroke="#17191C" stroke-width="2.2" stroke-linecap="round"/>';
// rounded — обычный значок со скруглением; full — фон до краёв, рисунок в безопасной зоне (maskable, iOS сам скругляет)
const svg = (size, full) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">` +
  `<rect width="48" height="48" rx="${full ? 0 : 11}" fill="#17191C"/>` +
  (full ? `<g transform="translate(24 24) scale(0.74) translate(-24 -24.5)">${CAR}</g>` : `<g transform="translate(0 -0.5)">${CAR}</g>`) + '</svg>';
(async () => {
  const b = await chromium.launch();
  for (const [name, size, full] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0;background:transparent">${svg(size, full)}</body>`);
    await p.screenshot({ path: path.join(OUT, name), omitBackground: true });
    await p.close();
  }
  require('fs').writeFileSync(path.join(OUT, 'icon.svg'), svg(48, false));
  await b.close();
  console.log('ok ->', OUT);
})();
