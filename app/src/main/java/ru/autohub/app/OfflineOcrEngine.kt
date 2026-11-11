package ru.autohub.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import com.googlecode.tesseract.android.TessBaseAPI
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.sqrt

/** CPU-only OCR. Models ship in assets; this class has no network dependencies. */
class OfflineOcrEngine(private val context: Context) {
    private val cancelled = AtomicBoolean(false)
    private val engineLock = Any()
    private var tess: TessBaseAPI? = null

    /**
     * Отмена. Tesseract сбрасывает флаг stop() в начале каждого распознавания, поэтому stop(), пришедший во время
     * подготовки снимка или setImage, потерялся бы до конца прохода. Пока движок занят, stop() повторяется.
     */
    fun cancel() {
        if (!cancelled.compareAndSet(false, true)) return
        if (!stopTesseract()) return
        thread(isDaemon = true, name = "ocr-cancel") {
            val until = SystemClock.elapsedRealtime() + 60_000
            while (SystemClock.elapsedRealtime() < until) {
                try { Thread.sleep(150) } catch (_: InterruptedException) { return@thread }
                if (!stopTesseract()) return@thread
            }
        }
    }
    /** stop() текущему движку; false — движка уже (или ещё) нет. */
    private fun stopTesseract(): Boolean = synchronized(engineLock) { tess?.let { it.stop(); true } ?: false }
    private fun checkCancelled() { if (cancelled.get()) throw CancellationException() }
    private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun installModels(): File {
        val base = File(context.noBackupFilesDir, "ocr")
        val folder = File(base, "tessdata").apply { mkdirs() }
        val checksums = context.assets.open("ocr-models.json").bufferedReader().use { JSONObject(it.readText()) }
        for (lang in listOf("rus", "eng")) {
            checkCancelled()
            val file = File(folder, "$lang.traineddata")
            val expected = checksums.getString(lang)
            if (!file.exists() || hash(file.readBytes()) != expected) {
                val bytes = context.assets.open("tessdata/$lang.traineddata").use { it.readBytes() }
                check(hash(bytes) == expected) { "Языковые данные повреждены. Переустановите APK." }
                val temp = File(folder, "$lang.tmp")
                try { temp.writeBytes(bytes); check(temp.renameTo(file)) { "Не удалось установить языки OCR. Освободите место." } }
                finally { temp.delete() }
            }
        }
        return base
    }

    /**
     * Выборка при декодировании: максимальная степень двойки, при которой длинная сторона остаётся не меньше
     * 2400 px (первый проход OCR — 2400 px, мелкий текст не должен теряться), и не больше ~12 Мп в памяти (ARGB ≈ 48 МБ, поворот удваивает).
     * Фото 50/108 Мп принимаются: 4000×3000 → без уменьшения, 8160×6120 → 2040×1530, 12000×9000 → 3000×2250.
     */
    fun sampleSize(width: Int, height: Int): Int {
        val longSide = maxOf(width, height)
        var sample = 1
        while (longSide / (sample * 2) >= MIN_LONG_SIDE) sample *= 2
        while (sampledPixels(width, height, sample) > MAX_DECODED_PIXELS) sample *= 2
        return sample
    }
    private fun sampledPixels(width: Int, height: Int, sample: Int): Long =
        ((width + sample - 1) / sample).toLong() * ((height + sample - 1) / sample)

    private fun image(bytes: ByteArray, rotation: Int): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= MAX_SOURCE_PIXELS) { "Изображение повреждено или больше 250 мегапикселей." }
        require(bounds.outMimeType in listOf("image/jpeg", "image/png", "image/webp")) { "Поддерживаются JPG, PNG, WEBP и PDF." }
        val sample = sampleSize(bounds.outWidth, bounds.outHeight)
        // Лимит 12 Мп — для уже уменьшенного снимка (то, что реально окажется в памяти), а не для исходника
        require(sampledPixels(bounds.outWidth, bounds.outHeight, sample) <= MAX_DECODED_PIXELS) { "Изображение слишком большое для памяти телефона." }
        checkCancelled()
        val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
        val decoded = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) { "Не удалось прочитать фото." }
        var oriented: Bitmap? = null
        var result: Bitmap? = null
        try {
            checkCancelled()
            val orientation = ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            val matrix = exifMatrix(orientation)
            matrix.postRotate(rotation.toFloat())
            val o = if (matrix.isIdentity) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
            oriented = o
            checkCancelled()
            // Прозрачные PNG/WEBP — на белую подложку; непрозрачные снимки не копируются лишний раз
            val r = if (!o.hasAlpha()) o else Bitmap.createBitmap(o.width, o.height, Bitmap.Config.ARGB_8888).also { white ->
                Canvas(white).apply { drawColor(Color.WHITE); drawBitmap(o, 0f, 0f, null) }
            }
            result = r
            return r
        } finally {
            val o = oriented
            if (o != null && o !== result && o !== decoded) o.recycle()
            if (decoded !== result) decoded.recycle()
        }
    }

    private data class Pass(val longSide: Int, val removeLines: Boolean, val binarize: Boolean, val mode: Int) {
        val name: String get() = if (longSide == 0) "original-psm$mode" else (if (binarize) "bw" else "gray") + "-$longSide-psm$mode"
    }

    /** Масштаб, бинаризация и удаление линий таблицы — алгоритм в OcrPreprocess.java. */
    private fun prepare(source: Bitmap, longSide: Int, removeLines: Boolean, binarize: Boolean): Bitmap {
        val w = source.width; val h = source.height
        val pixels = IntArray(w * h); source.getPixels(pixels, 0, w, 0, 0, w, h)
        val size = OcrPreprocess.targetSize(w, h, longSide, 8_000_000L)
        val out = OcrPreprocess.process(pixels, w, h, size[0], size[1], removeLines, binarize) { cancelled.get() }
        return Bitmap.createBitmap(out, size[0], size[1], Bitmap.Config.ARGB_8888)
    }

    /** Файл документа: байты картинки или временный PDF (страниц — по PdfRenderer). */
    private class Source(val bytes: ByteArray?, val pdf: File?, val rotation: Int, var pages: Int)

    fun process(files: JSONArray, progress: (Int) -> Unit = {}): JSONObject {
        require(files.length() in 1..10) { "Выберите от 1 до 10 файлов." }
        val sources = mutableListOf<Source>()
        try {
            val hashes = mutableListOf<String>()
            var totalBytes = 0
            // Сначала все файлы: проверки размера и число страниц всего документа (PDF — по PdfRenderer.pageCount)
            for (i in 0 until files.length()) {
                checkCancelled()
                val entry = files.getJSONObject(i)
                val rotation = entry.optInt("rotation", 0)
                require(rotation in listOf(0, 90, 180, 270)) { "Недопустимый поворот страницы." }
                val bytes = Base64.decode(entry.getString("data"), Base64.DEFAULT)
                totalBytes += bytes.size
                require(bytes.isNotEmpty() && totalBytes <= 16 * 1024 * 1024) { "Общий размер файлов — до 16 МБ." }
                hashes.add(hash(bytes))
                if (bytes.size >= 5 && String(bytes, 0, 5, Charsets.US_ASCII) == "%PDF-") {
                    val file = File.createTempFile("ocr-", ".pdf", context.cacheDir)
                    val source = Source(null, file, rotation, 0)
                    sources.add(source) // до записи — чтобы finally удалил файл при любой ошибке
                    file.writeBytes(bytes)
                    source.pages = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                        PdfRenderer(descriptor).use { it.pageCount }
                    }
                    require(source.pages >= 1) { "Некорректный PDF." }
                } else sources.add(Source(bytes, null, rotation, 1))
                require(sources.sumOf { it.pages } <= 10) { "Не больше 10 страниц в одном документе." }
            }
            // На многостраничных документах (больше 3 страниц всего) — один подготовленный проход, чтобы не ждать минутами.
            val singlePass = sources.sumOf { it.pages } > 3
            return recognizeAll(sources, hashes, singlePass, progress)
        } finally {
            sources.forEach { it.pdf?.delete() }
        }
    }

    private fun recognizeAll(sources: List<Source>, hashes: List<String>, singlePass: Boolean, progress: (Int) -> Unit): JSONObject {
        val dataPath = installModels()
        val api = TessBaseAPI()
        val lines = JSONArray(); val previews = JSONArray()
        var pageCount = 0
        try {
            check(api.init(dataPath.absolutePath, "rus+eng", TessBaseAPI.OEM_LSTM_ONLY)) { "Не удалось запустить OCR. Переустановите приложение." }
            synchronized(engineLock) { tess = api }
            /* Проходы (подобраны прогоном tools/ocr_replay на вариантах фото: масштаб, сжатие, наклон, тени):
               снимок увеличен до 2400/3000 px, фон выровнен, наклон исправлен, линии таблицы стёрты;
               серый (LSTM видит детали мелкого текста) в разметке «колонка» и «блок» + чёрно-белый 3000 px.
               Парсер голосует между проходами (AutoHubDocumentParser.extractBest). Первый проход — лучший одиночный. */
            val passes = listOf(Pass(2400, true, false, TessBaseAPI.PageSegMode.PSM_SINGLE_COLUMN),
                Pass(2400, true, false, TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK),
                Pass(3000, true, true, TessBaseAPI.PageSegMode.PSM_SINGLE_COLUMN))
            val passLines = List(passes.size) { JSONArray() }; val passConf = MutableList(passes.size) { 0.0 }
            fun recognize(bitmap: Bitmap, pass: Int, mode: Int, sourceSize: JSONArray, keep: Boolean) {
                checkCancelled()
                api.setPageSegMode(mode)
                api.setImage(bitmap)
                checkCancelled() // отмена во время setImage — не начинать проход
                api.getHOCRText(pageCount - 1) // interruptible pass; UTF8 below reads its cached result
                checkCancelled()
                val text = api.getUTF8Text().orEmpty()
                val confidence = api.meanConfidence()
                passConf[pass] += confidence.toDouble()
                text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.forEach { line ->
                    val item = JSONObject().put("page", pageCount).put("text", line).put("confidence", confidence)
                        .put("box", JSONObject.NULL).put("imageSize", sourceSize)
                    passLines[pass].put(item); if (keep) lines.put(item)
                }
                api.clear()
            }
            fun page(bitmap: Bitmap) {
                try {
                    checkCancelled()
                    require(++pageCount <= 10) { "Не больше 10 страниц в одном документе." }
                    require(minOf(bitmap.width, bitmap.height) >= 300) { "Слишком маленькое изображение. Используйте полный снимок." }
                    progress(pageCount)
                    val size = JSONArray(listOf(bitmap.width, bitmap.height))
                    val active = if (singlePass) listOf(0) else passes.indices.toList()
                    // Одинаковая подготовка (масштаб/режим) делается один раз на страницу
                    var cachedKey: String? = null; var cached: Bitmap? = null
                    try {
                        for (index in active) {
                            val pass = passes[index]
                            if (pass.longSide == 0) { recognize(bitmap, index, pass.mode, size, index == 0); continue }
                            val key = "${pass.longSide}/${pass.removeLines}/${pass.binarize}"
                            if (key != cachedKey) { cached?.recycle(); cached = null; cached = prepare(bitmap, pass.longSide, pass.removeLines, pass.binarize); cachedKey = key }
                            recognize(cached!!, index, pass.mode, size, index == 0)
                        }
                    } finally { cached?.recycle() }
                    checkCancelled()
                    val scale = minOf(1.0, 1400.0 / maxOf(bitmap.width, bitmap.height))
                    val preview = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
                    try {
                        val out = ByteArrayOutputStream(); preview.compress(Bitmap.CompressFormat.JPEG, 70, out)
                        previews.put("data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
                    } finally { if (preview !== bitmap) preview.recycle() }
                } finally { bitmap.recycle() }
            }
            for (src in sources) {
                checkCancelled()
                val rotation = src.rotation
                val pdfFile = src.pdf
                if (pdfFile != null) {
                    ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                        PdfRenderer(descriptor).use { pdf ->
                            for (p in 0 until pdf.pageCount) {
                                checkCancelled()
                                pdf.openPage(p).use { source ->
                                    require(source.width > 0 && source.height > 0) { "Некорректный PDF." }
                                    val scale = minOf(300.0 / 72, sqrt(4_000_000.0 / (source.width.toDouble() * source.height)))
                                    val bitmap = Bitmap.createBitmap((source.width * scale).toInt().coerceAtLeast(1), (source.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                                    bitmap.eraseColor(Color.WHITE)
                                    try { source.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY) }
                                    catch (e: Exception) { bitmap.recycle(); throw e }
                                    if (rotation == 0) page(bitmap)
                                    else {
                                        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
                                        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                                        if (rotated !== bitmap) bitmap.recycle()
                                        page(rotated)
                                    }
                                }
                            }
                        }
                    }
                } else page(image(requireNotNull(src.bytes), rotation))
            }
            checkCancelled()
            if (lines.length() == 0) passLines.firstOrNull { it.length() > 0 }?.let { for (i in 0 until it.length()) lines.put(it.get(i)) }
            require(lines.length() > 0) { "Текст не найден. Снимите документ чётче, без бликов." }
            val passList = JSONArray()
            passes.indices.filter { passLines[it].length() > 0 }.forEach { passList.put(JSONObject().put("name", passes[it].name)
                .put("confidence", passConf[it] / pageCount).put("lines", passLines[it])) }
            return JSONObject().put("lines", lines).put("passes", passList).put("previews", previews).put("pages", pageCount)
                .put("fileHashes", JSONArray(hashes)).put("documentHash", hash(hashes.sorted().joinToString("|").toByteArray()))
                .put("engine", "tesseract-android-rus-eng-offline")
        } finally {
            synchronized(engineLock) { tess = null; api.recycle() }
        }
    }

    companion object {
        /** Длинная сторона после выборки — не меньше первого прохода OCR. */
        private const val MIN_LONG_SIDE = 2400
        private const val MAX_DECODED_PIXELS = 12_000_000L // ARGB 12 Мп ≈ 48 МБ, при повороте ×2 — терпимо для бюджетных телефонов
        /** Защита от «бомб» с огромными размерами в заголовке; 200-Мп камеры проходят. */
        private const val MAX_SOURCE_PIXELS = 250_000_000L

        /**
         * EXIF-ориентация → преобразование снимка к виду «как показывает камера». Сначала отражение, потом поворот
         * (как androidx ExifInterface): 5 TRANSPOSE = отражение + 270°, 7 TRANSVERSE = отражение + 90°.
         * Проверено на всех 8 значениях против PIL ImageOps.exif_transpose.
         */
        fun exifMatrix(orientation: Int): Matrix = Matrix().apply {
            when (orientation) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)          // 2
                ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)                // 3
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)           // 4
                ExifInterface.ORIENTATION_TRANSPOSE -> { postScale(-1f, 1f); postRotate(270f) } // 5
                ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)                  // 6
                ExifInterface.ORIENTATION_TRANSVERSE -> { postScale(-1f, 1f); postRotate(90f) } // 7
                ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)                // 8
            }
        }
    }
}
