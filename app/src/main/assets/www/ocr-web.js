/* АвтоХаб: распознавание заказ-нарядов в веб-версии (браузер) — на самом устройстве, без отправки документов.
 *
 * Тот же конвейер, что в Android-приложении (OfflineOcrEngine.kt): Tesseract (LSTM), модели rus+eng из
 * tessdata_fast той же ревизии, подготовка снимка web/ocr-prep.js (порт OcrPreprocess.java, совпадает бит в бит),
 * те же три прохода и тот же формат ответа — дальше его разбирает общий AutoHubDocumentParser.
 * PDF рендерится pdf.js (300 dpi, до 4 Мп на страницу — как PdfRenderer на Android).
 *
 * Движок (~4 МБ), модели (~8 МБ) и pdf.js лежат на своём сервере в папке AUTOHUB_OCR_DIR (собирает
 * tools/web_ocr.py, версии закреплены в tools/web-ocr/package-lock.json). Скачиваются при первом
 * распознавании, дальше берутся из кэша сервис-воркера — и без интернета.
 */
(function () {
  "use strict";

  var DIR = window.AUTOHUB_OCR_DIR || "ocr/";
  // Проходы — как на Android: серый 2400 px «колонка» и «блок», чёрно-белый 3000 px «колонка»
  var PASSES = [
    { name: "gray-2400-psm4", key: "2400/1/0", longSide: 2400, removeLines: true, binarize: false, psm: "4" },
    { name: "gray-2400-psm6", key: "2400/1/0", longSide: 2400, removeLines: true, binarize: false, psm: "6" },
    { name: "bw-3000-psm4", key: "3000/1/1", longSide: 3000, removeLines: true, binarize: true, psm: "4" }
  ];
  var MAX_DECODED_PIXELS = 12000000, MAX_PAGES = 10, MAX_BYTES = 16 * 1024 * 1024;

  var gen = 0, tess = null, prep = null, prepSeq = 0, prepCbs = {}, onLoad = null, scripts = {}, abortRun = null;

  function abs(p) { return new URL(p, location.href).href; }
  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function cancelled() { return err("cancelled", "Распознавание отменено."); }

  /** Браузер умеет всё нужное: WebAssembly, воркеры, OffscreenCanvas (Chrome 69+, Safari 16.4+, Firefox 105+). */
  function available() {
    return typeof WebAssembly === "object" && typeof Worker === "function" && typeof OffscreenCanvas === "function" &&
      typeof createImageBitmap === "function" && !!(window.crypto && crypto.subtle) && location.protocol !== "file:";
  }

  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { delete scripts[src]; reject(new Error("load " + src)); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }

  var LOAD_TEXT = { "loading tesseract core": "Загружаем модуль распознавания", "loading language traineddata": "Загружаем словари русского и английского",
    "initializing api": "Запускаем распознавание", "initializing tesseract": "Запускаем распознавание" };
  function engine() {
    if (!tess) tess = loadScript(abs(DIR + "tesseract.min.js")).then(function () {
      return window.Tesseract.createWorker(["rus", "eng"], 1 /* LSTM_ONLY, как на Android */, {
        workerPath: abs(DIR + "worker.min.js"), corePath: abs(DIR + "core/"), langPath: abs(DIR + "lang"),
        gzip: false, cacheMethod: "none", workerBlobURL: false, // модели кэширует сервис-воркер, а не IndexedDB
        logger: function (m) {
          if (onLoad && LOAD_TEXT[m.status]) onLoad(LOAD_TEXT[m.status] + (m.progress > 0 && m.progress < 1 ? " — " + Math.round(m.progress * 100) + " %" : "") + "…");
        },
        errorHandler: function () {}
      });
    }).catch(function (e) {
      tess = null;
      throw err("ocr_load", navigator.onLine === false
        ? "Модуль распознавания ещё не загружен. При первом распознавании нужен интернет (около 12 МБ), дальше оно работает без сети."
        : "Не удалось загрузить модуль распознавания. Проверьте интернет и попробуйте ещё раз.");
    });
    return tess;
  }

  function prepWorker() {
    if (!prep) {
      prep = new Worker(abs("ocr-prep.js"));
      prep.onmessage = function (e) {
        var m = e.data, cb = prepCbs[m.id]; if (!cb) return;
        if (m.step) return cb.step(m.step);
        delete prepCbs[m.id];
        if (m.ok) cb.resolve(m.result); else cb.reject(err("ocr_prep", "Не удалось подготовить снимок: " + m.error));
      };
      prep.onerror = function (e) {
        Object.keys(prepCbs).forEach(function (id) { prepCbs[id].reject(err("ocr_prep", "Не удалось подготовить снимок.")); });
        prepCbs = {}; if (prep) prep.terminate(); prep = null;
        if (e && e.preventDefault) e.preventDefault();
      };
    }
    return prep;
  }
  function preparePage(bitmap, rotation, preps, step) {
    var w = prepWorker(), id = ++prepSeq;
    return new Promise(function (resolve, reject) {
      prepCbs[id] = { resolve: resolve, reject: reject, step: step || function () {} };
      w.postMessage({ id: id, bitmap: bitmap, rotation: rotation, preps: preps }, [bitmap]);
    });
  }

  /** Отменить текущее распознавание: воркеры останавливаются сразу, следующий запуск создаст их заново. */
  function cancel() {
    gen++;
    if (abortRun) { var a = abortRun; abortRun = null; a(cancelled()); } // ожидание движка или прохода обрывается сразу
    if (prep) { prep.terminate(); prep = null; }
    Object.keys(prepCbs).forEach(function (id) { prepCbs[id].reject(cancelled()); }); prepCbs = {};
    if (tess) { var t = tess; tess = null; t.then(function (w) { return w.terminate(); }).catch(function () {}); }
  }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function sha256(data) { return crypto.subtle.digest("SHA-256", data).then(hex); }
  function dataUrl(blob) {
    return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsDataURL(blob); });
  }
  function isPdf(bytes) { var b = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)); return String.fromCharCode.apply(null, b) === "%PDF-"; }

  var pdfjs = null;
  function pdfLib() {
    if (!pdfjs) pdfjs = import(abs(DIR + "pdf/pdf.min.mjs")).then(function (m) {
      m.GlobalWorkerOptions.workerSrc = abs(DIR + "pdf/pdf.worker.min.mjs"); return m;
    }).catch(function () { pdfjs = null; throw err("ocr_load", "Не удалось загрузить модуль чтения PDF. Проверьте интернет и попробуйте ещё раз."); });
    return pdfjs;
  }

  /** Фото → ImageBitmap с учётом EXIF-ориентации, не больше 12 Мп (как на Android). */
  function decodeImage(file) {
    var opts = { imageOrientation: "from-image" };
    return createImageBitmap(file, opts).catch(function () { return createImageBitmap(file); }).catch(function () {
      throw err("ocr_format", "Не удалось открыть «" + file.name + "». Подойдут JPEG, PNG, WEBP или PDF.");
    }).then(function (bmp) {
      var px = bmp.width * bmp.height;
      if (px <= MAX_DECODED_PIXELS) return bmp;
      var k = Math.sqrt(MAX_DECODED_PIXELS / px);
      return createImageBitmap(bmp, { resizeWidth: Math.max(1, Math.floor(bmp.width * k)), resizeHeight: Math.max(1, Math.floor(bmp.height * k)), resizeQuality: "high" })
        .then(function (small) { bmp.close(); return small; });
    });
  }
  /** Страница PDF → ImageBitmap: 300 dpi, но не больше 4 Мп, белый фон. */
  function renderPdfPage(doc, n) {
    return doc.getPage(n).then(function (page) {
      var v1 = page.getViewport({ scale: 1 });
      if (!(v1.width > 0 && v1.height > 0)) throw err("ocr_format", "Некорректный PDF.");
      var scale = Math.min(300 / 72, Math.sqrt(4000000 / (v1.width * v1.height))), vp = page.getViewport({ scale: scale });
      var c = document.createElement("canvas"); c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
      var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        page.cleanup(); return createImageBitmap(c);
      }).then(function (bmp) { c.width = c.height = 0; return bmp; });
    });
  }

  /**
   * entries — [{ file: File, rotation: 0|90|180|270 }]. progress(n) — номер страницы, progress("текст") — загрузка модуля.
   * Ответ — как у NativeOcr: { lines, passes, previews, pages, fileHashes, documentHash, engine }.
   */
  function recognize(entries, progress) {
    if (abortRun) cancel(); // новый запуск отменяет незавершённый
    var my = gen + 1;
    return new Promise(function (resolve, reject) {
      abortRun = reject;
      run(entries, progress).then(resolve, reject).then(function () { if (gen === my) abortRun = null; });
    });
  }
  async function run(entries, progress) {
    var my = ++gen; progress = progress || function () {};
    function alive() { if (my !== gen) throw cancelled(); }
    if (!available()) throw err("ocr_unsupported", "Этот браузер не умеет распознавать документы. Обновите его или откройте АвтоХаб в свежем Chrome, Safari или Firefox.");
    if (!entries || entries.length < 1 || entries.length > 10) throw err("bad_request", "Выберите от 1 до 10 файлов.");
    var total = entries.reduce(function (s, e) { return s + e.file.size; }, 0);
    if (!total || total > MAX_BYTES) throw err("bad_request", "Общий размер файлов — до 16 МБ.");

    // Сначала все файлы: хеши (повторная загрузка того же документа) и число страниц всего документа
    var sources = [], hashes = [];
    for (var i = 0; i < entries.length; i++) {
      var rot = +entries[i].rotation || 0;
      if ([0, 90, 180, 270].indexOf(rot) < 0) throw err("bad_request", "Недопустимый поворот страницы.");
      var bytes = await entries[i].file.arrayBuffer(); alive();
      hashes.push(await sha256(bytes));
      if (isPdf(bytes)) {
        var lib = await pdfLib(); alive();
        var doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: false, useSystemFonts: true }).promise.catch(function () {
          throw err("ocr_format", "Не удалось открыть PDF «" + entries[i].file.name + "». Если он защищён паролем, сохраните страницы как фото.");
        });
        if (doc.numPages < 1) throw err("ocr_format", "Некорректный PDF.");
        sources.push({ pdf: doc, pages: doc.numPages, rotation: rot });
      } else sources.push({ file: entries[i].file, pages: 1, rotation: rot });
      if (sources.reduce(function (s, x) { return s + x.pages; }, 0) > MAX_PAGES) throw err("bad_request", "Не больше 10 страниц в одном документе.");
    }
    // Больше 3 страниц — один проход, чтобы не ждать минутами (как на Android)
    var pageTotal = sources.reduce(function (s, x) { return s + x.pages; }, 0);
    var passes = pageTotal > 3 ? [PASSES[0]] : PASSES, preps = [];
    passes.forEach(function (p) { if (!preps.some(function (q) { return q.key === p.key; })) preps.push({ key: p.key, longSide: p.longSide, removeLines: p.removeLines, binarize: p.binarize }); });

    onLoad = progress;
    var worker;
    try { worker = await engine(); } finally { onLoad = null; }
    alive();

    var lines = [], previews = [], pageCount = 0, passLines = passes.map(function () { return []; }), passConf = passes.map(function () { return 0; });
    async function page(bitmap, rotation) {
      alive();
      if (++pageCount > MAX_PAGES) { bitmap.close(); throw err("bad_request", "Не больше 10 страниц в одном документе."); }
      if (Math.min(bitmap.width, bitmap.height) < 300) { bitmap.close(); throw err("bad_request", "Слишком маленькое изображение. Используйте полный снимок."); }
      progress(pageCount);
      var r = await preparePage(bitmap, rotation, preps); alive();
      var size = [r.w, r.h];
      for (var p = 0; p < passes.length; p++) {
        await worker.setParameters({ tessedit_pageseg_mode: passes[p].psm }); alive();
        var res = await worker.recognize(r.preps[passes[p].key]); alive();
        var conf = +res.data.confidence || 0;
        passConf[p] += conf;
        String(res.data.text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (text) {
          var item = { page: pageCount, text: text, confidence: conf, box: null, imageSize: size };
          passLines[p].push(item); if (p === 0) lines.push(item);
        });
      }
      previews.push(await dataUrl(r.preview));
    }
    try {
      for (var s = 0; s < sources.length; s++) {
        var src = sources[s];
        if (src.pdf) {
          for (var n = 1; n <= src.pages; n++) { alive(); await page(await renderPdfPage(src.pdf, n), src.rotation); }
          src.pdf.destroy();
        } else await page(await decodeImage(src.file), src.rotation);
      }
    } catch (e) {
      sources.forEach(function (x) { if (x.pdf) x.pdf.destroy(); });
      if (my !== gen) throw cancelled();
      throw e;
    }
    alive();
    if (!lines.length) { var first = passLines.filter(function (l) { return l.length; })[0]; if (first) lines = first.slice(); }
    var passList = [];
    passes.forEach(function (p, k) { if (passLines[k].length) passList.push({ name: p.name, confidence: passConf[k] / pageCount, lines: passLines[k] }); });
    return {
      lines: lines, passes: passList, previews: previews, pages: pageCount, fileHashes: hashes,
      documentHash: await sha256(new TextEncoder().encode(hashes.slice().sort().join("|"))),
      engine: "tesseract-wasm-rus-eng-browser"
    };
  }

  window.AutoHubWebOcr = { available: available, recognize: recognize, cancel: cancel, passes: PASSES };
})();
