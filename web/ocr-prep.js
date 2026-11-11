/* АвтоХаб: подготовка снимка документа к OCR в веб-версии — порт OcrPreprocess.java (Android) один в один.
 * Шаги: оттенки серого → масштаб Lanczos-3 (мелкие фото увеличиваются) → выравнивание фона (тени, неравномерный свет) →
 * выпрямление наклона строк → порог Оцу → стирание длинных горизонтальных и вертикальных линий таблицы.
 *
 * Работает в двух ролях:
 *  - веб-воркер (web/ocr-web.js): получает страницу (ImageBitmap), поворачивает, готовит снимки для проходов OCR
 *    и превью, возвращает PNG/JPEG — основной поток не подвисает на больших фото;
 *  - модуль Node для тестов (tests/ocr-web.test.cjs сверяет результат с Java-версией).
 */
(function (root) {
  "use strict";

  /** Итоговый размер: длинная сторона = longSide, но не больше maxPixels. Возвращает [w, h]. */
  function targetSize(w, h, longSide, maxPixels) {
    var k = longSide / Math.max(w, h);
    k = Math.min(k, Math.sqrt(maxPixels / (w * h)));
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  }

  var f32 = Math.fround;
  function jround(x) { return Math.floor(x + 0.5); } // Math.round из Java (половина — вверх)

  /**
   * rgba — пиксели исходника (Uint8ClampedArray w×h×4, как ImageData). Возвращает Uint8Array серого outW×outH
   * (0 — чёрный, 255 — белый). binarize=false — оттенки серого после выравнивания фона и наклона.
   */
  function process(rgba, w, h, outW, outH, removeLines, binarize, cancelled) {
    var n0 = w * h, gray = new Float32Array(n0);
    for (var i = 0; i < n0; i++) {
      var p = i * 4;
      gray[i] = f32(f32(rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000);
    }
    check(cancelled);
    var g = resize(gray, w, h, outW, outH);
    gray = null;
    check(cancelled);
    flatten(g, outW, outH);
    check(cancelled);
    var angle = skew(g, outW, outH);
    if (Math.abs(angle) > 0.1) g = rotate(g, outW, outH, angle);
    check(cancelled);
    var threshold = otsu(g), n = outW * outH, out = new Uint8Array(n);
    if (!binarize && !removeLines) { out.set(g); return out; }
    var dark = new Uint8Array(n);
    for (i = 0; i < n; i++) dark[i] = g[i] <= threshold ? 1 : 0;
    if (removeLines) {
      var hl = runs(dark, outW, outH, Math.max(40, (outW / 15) | 0), true);
      var vl = runs(dark, outW, outH, Math.max(40, (outH / 30) | 0), false);
      var erase = new Uint8Array(n);
      for (var y = 0; y < outH; y++) for (var x = 0; x < outW; x++) {
        var j = y * outW + x;
        if (hl[j] || vl[j]) erase[j] = 1;
        if (hl[j]) { if (y > 0) erase[j - outW] = 1; if (y + 1 < outH) erase[j + outW] = 1; }
        if (vl[j]) { if (x > 0) erase[j - 1] = 1; if (x + 1 < outW) erase[j + 1] = 1; }
      }
      for (i = 0; i < n; i++) if (erase[i]) dark[i] = 0;
      if (!binarize) { // серый текст, линии таблицы закрашены белым
        for (i = 0; i < n; i++) out[i] = erase[i] ? 255 : g[i];
        return out;
      }
    }
    for (i = 0; i < n; i++) out[i] = dark[i] ? 0 : 255;
    return out;
  }

  function check(cancelled) { if (cancelled && cancelled()) { var e = new Error("cancelled"); e.code = "cancelled"; throw e; } }

  /** Деление на оценку фона (максимум по блокам, сглаженный): тени и градиент света → ровный белый фон. */
  function flatten(g, w, h) {
    var b = Math.max(16, (Math.min(w, h) / 40) | 0);
    var bw = ((w + b - 1) / b) | 0, bh = ((h + b - 1) / b) | 0;
    var bg = new Float32Array(bw * bh), x, y, dx, dy, i;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { i = ((y / b) | 0) * bw + ((x / b) | 0); if (g[y * w + x] > bg[i]) bg[i] = g[y * w + x]; }
    // блоки целиком из тёмного (заливка, край стола) берут фон соседей: максимум 3×3, затем среднее 3×3
    var mx = new Float32Array(bw * bh), sm = new Float32Array(bw * bh);
    for (y = 0; y < bh; y++) for (x = 0; x < bw; x++) {
      var m = 0; for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        var yy = Math.min(bh - 1, Math.max(0, y + dy)), xx = Math.min(bw - 1, Math.max(0, x + dx)); m = Math.max(m, bg[yy * bw + xx]); }
      mx[y * bw + x] = m;
    }
    for (y = 0; y < bh; y++) for (x = 0; x < bw; x++) {
      var a = 0; for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        var y2 = Math.min(bh - 1, Math.max(0, y + dy)), x2 = Math.min(bw - 1, Math.max(0, x + dx)); a = f32(a + mx[y2 * bw + x2]); }
      sm[y * bw + x] = f32(a / 9);
    }
    var lim = f32(bh - 1.001), limx = f32(bw - 1.001);
    for (y = 0; y < h; y++) {
      var fy = Math.max(0, Math.min(lim, f32(f32(f32(y + 0.5) / b) - 0.5))), y0 = fy | 0, ty = f32(fy - y0), y1 = Math.min(bh - 1, y0 + 1);
      for (x = 0; x < w; x++) {
        var fx = Math.max(0, Math.min(limx, f32(f32(f32(x + 0.5) / b) - 0.5))), x0 = fx | 0, tx = f32(fx - x0), x1 = Math.min(bw - 1, x0 + 1);
        var top = f32(f32(sm[y0 * bw + x0] * f32(1 - tx)) + f32(sm[y0 * bw + x1] * tx));
        var bot = f32(f32(sm[y1 * bw + x0] * f32(1 - tx)) + f32(sm[y1 * bw + x1] * tx));
        var v = f32(f32(top * f32(1 - ty)) + f32(bot * ty));
        i = y * w + x;
        g[i] = Math.min(255, jround(f32(f32(g[i] * 255) / Math.max(64, v))));
      }
    }
  }

  /** Наклон строк в градусах (−8…8): максимум «резкости» горизонтальной проекции тёмных пикселей. */
  function skew(g, w, h) {
    var t = otsu(g), f = Math.max(1, (Math.max(w, h) / 1000) | 0);
    var sw = (w / f) | 0, sh = (h / f) | 0;
    var cap = ((sw * sh / 2) | 0) + 1, xs = new Int32Array(cap), ys = new Int32Array(cap), n = 0;
    for (var y = 0; y < sh; y++) for (var x = 0; x < sw; x++) {
      if (g[(y * f) * w + x * f] <= t) { if (n === cap) break; xs[n] = x; ys[n] = y; n++; }
    }
    if (n < 200) return 0;
    var best = 0, bestScore = -1;
    for (var pass = 0; pass < 2; pass++) {
      var from = pass === 0 ? -8 : best - 0.3, to = pass === 0 ? 8 : best + 0.3, step = pass === 0 ? 0.25 : 0.05;
      for (var a = from; a <= to + 1e-9; a += step) {
        var tan = Math.tan(a * Math.PI / 180), off = Math.ceil(Math.abs(tan) * sw) + 1;
        var rows = new Float64Array(sh + 2 * off);
        for (var i = 0; i < n; i++) rows[jround(ys[i] - xs[i] * tan) + off]++;
        var sc = 0; for (var r = 0; r < rows.length; r++) sc += rows[r] * rows[r];
        if (sc > bestScore) { bestScore = sc; best = a; }
      }
    }
    return best;
  }

  /** Поворот на угол наклона (строки становятся горизонтальными), билинейно, поля белые. */
  function rotate(g, w, h, angle) {
    var r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = w / 2, cy = h / 2;
    var out = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var sx = cx + (x - cx) * c - (y - cy) * s, sy = cy + (x - cx) * s + (y - cy) * c;
      var x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) { out[y * w + x] = 255; continue; }
      var tx = sx - x0, ty = sy - y0;
      var v = (g[y0 * w + x0] * (1 - tx) + g[y0 * w + x0 + 1] * tx) * (1 - ty) + (g[(y0 + 1) * w + x0] * (1 - tx) + g[(y0 + 1) * w + x0 + 1] * tx) * ty;
      out[y * w + x] = jround(v);
    }
    return out;
  }

  function lanczos(x) {
    if (x === 0) return 1;
    if (x <= -3 || x >= 3) return 0;
    var p = Math.PI * x;
    return 3 * Math.sin(p) * Math.sin(p / 3) / (p * p);
  }

  /** Веса свёртки для одной оси (как в Pillow). */
  function coefficients(inn, out) {
    var scale = inn / out, filter = Math.max(1, scale), support = 3 * filter;
    var stride = Math.ceil(support) * 2 + 1;
    var weights = new Float64Array(out * stride), start = new Int32Array(out), count = new Int32Array(out);
    for (var o = 0; o < out; o++) {
      var center = (o + 0.5) * scale;
      var lo = Math.max(0, Math.trunc(center - support + 0.5)), hi = Math.min(inn, Math.trunc(center + support + 0.5));
      var sum = 0, i;
      for (i = lo; i < hi; i++) { var v = lanczos((i - center + 0.5) / filter); weights[o * stride + i - lo] = v; sum += v; }
      if (sum !== 0) for (i = lo; i < hi; i++) weights[o * stride + i - lo] /= sum;
      start[o] = lo; count[o] = hi - lo;
    }
    return { w: weights, start: start, count: count, stride: stride };
  }

  function resize(src, w, h, ow, oh) {
    var cx = coefficients(w, ow), cy = coefficients(h, oh);
    var mid = new Float32Array(ow * h), y, o, k, x, acc, lo, c;
    for (y = 0; y < h; y++) for (o = 0; o < ow; o++) {
      lo = cx.start[o]; c = cx.count[o]; acc = 0;
      for (k = 0; k < c; k++) acc += src[y * w + lo + k] * cx.w[o * cx.stride + k];
      mid[y * ow + o] = acc;
    }
    var out = new Uint8Array(ow * oh);
    for (o = 0; o < oh; o++) {
      lo = cy.start[o]; c = cy.count[o];
      for (x = 0; x < ow; x++) {
        acc = 0;
        for (k = 0; k < c; k++) acc += mid[(lo + k) * ow + x] * cy.w[o * cy.stride + k];
        out[o * ow + x] = Math.max(0, Math.min(255, jround(acc)));
      }
    }
    return out;
  }

  function otsu(g) {
    var hist = new Float64Array(256), i;
    for (i = 0; i < g.length; i++) hist[g[i]]++;
    var total = g.length, mt = 0;
    for (i = 0; i < 256; i++) mt += i * hist[i];
    var w = 0, mu = 0, best = -1, arg = 127;
    for (var t = 0; t < 256; t++) {
      w += hist[t]; mu += t * hist[t];
      if (w === 0 || w === total) continue;
      var d = mt * w - mu * total, v = d * d / (w * (total - w));
      if (v > best) { best = v; arg = t; }
    }
    return arg;
  }

  /** Отметить пиксели тёмных отрезков длиной ≥ min вдоль строк (horizontal) или столбцов. */
  function runs(dark, w, h, min, horizontal) {
    var mark = new Uint8Array(w * h), lines = horizontal ? h : w, len = horizontal ? w : h;
    for (var a = 0; a < lines; a++) {
      var run = 0;
      for (var b = 0; b <= len; b++) {
        var d = b < len && dark[horizontal ? a * w + b : b * w + a];
        if (d) { run++; continue; }
        if (run >= min) for (var k = b - run; k < b; k++) mark[horizontal ? a * w + k : k * w + a] = 1;
        run = 0;
      }
    }
    return mark;
  }

  var api = { targetSize: targetSize, process: process, otsu: otsu };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }

  /* ---------- Роль веб-воркера ---------- */
  if (typeof root.importScripts !== "function" || typeof root.postMessage !== "function") return;
  var MAX_PREP_PIXELS = 8000000; // как на Android: подготовленный снимок не больше 8 Мп

  function toRgbaCanvas(gray, w, h) {
    var c = new OffscreenCanvas(w, h), ctx = c.getContext("2d"), img = ctx.createImageData(w, h), d = img.data;
    for (var i = 0, p = 0; i < gray.length; i++, p += 4) { d[p] = d[p + 1] = d[p + 2] = gray[i]; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** Страница: ImageBitmap + поворот → { w, h, preview (JPEG), preps: { ключ: PNG } }. */
  async function page(msg) {
    var bmp = msg.bitmap, rot = msg.rotation || 0, swap = rot === 90 || rot === 270;
    var w = swap ? bmp.height : bmp.width, h = swap ? bmp.width : bmp.height;
    var canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // прозрачные PNG/WEBP — на белую подложку
    ctx.translate(w / 2, h / 2); ctx.rotate(rot * Math.PI / 180); ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    bmp.close();
    var rgba = ctx.getImageData(0, 0, w, h).data;
    var preps = {};
    for (var i = 0; i < msg.preps.length; i++) {
      var p = msg.preps[i], size = targetSize(w, h, p.longSide, MAX_PREP_PIXELS);
      var g = process(rgba, w, h, size[0], size[1], p.removeLines, p.binarize);
      preps[p.key] = await toRgbaCanvas(g, size[0], size[1]).convertToBlob({ type: "image/png" });
      root.postMessage({ id: msg.id, step: i + 1 });
    }
    // Превью для сверки с оригиналом — как на Android: длинная сторона до 1400 px, JPEG 70 %
    var k = Math.min(1, 1400 / Math.max(w, h)), pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
    var pc = new OffscreenCanvas(pw, ph), pctx = pc.getContext("2d");
    pctx.imageSmoothingQuality = "high"; pctx.drawImage(canvas, 0, 0, pw, ph);
    var preview = await pc.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    return { w: w, h: h, preps: preps, preview: preview };
  }

  root.onmessage = function (e) {
    var msg = e.data;
    page(msg).then(function (r) { root.postMessage({ id: msg.id, ok: true, result: r }); },
      function (err) { root.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) }); });
  };
})(typeof self !== "undefined" ? self : this);
