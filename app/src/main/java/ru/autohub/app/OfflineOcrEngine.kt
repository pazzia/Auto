package ru.autohub.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
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
import kotlin.math.sqrt

/** CPU-only OCR. Models ship in assets; this class has no network dependencies. */
class OfflineOcrEngine(private val context: Context) {
    private val cancelled = AtomicBoolean(false)
    private val engineLock = Any()
    private var tess: TessBaseAPI? = null

    fun cancel() {
        cancelled.set(true)
        synchronized(engineLock) { tess?.stop() }
    }
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

    private fun image(bytes: ByteArray, rotation: Int): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 25_000_000) { "Изображение повреждено или больше 25 мегапикселей." }
        require(bounds.outMimeType in listOf("image/jpeg", "image/png", "image/webp")) { "Поддерживаются JPG, PNG, WEBP и PDF." }
        var sample = 1
        while (bounds.outWidth.toLong() * bounds.outHeight / (sample * sample) > 4_000_000) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
        val decoded = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) { "Не удалось прочитать фото." }
        try {
            val matrix = Matrix()
            val exif = ExifInterface(ByteArrayInputStream(bytes))
            matrix.postRotate(exif.rotationDegrees.toFloat())
            if (exif.isFlipped) matrix.postScale(-1f, 1f)
            matrix.postRotate(rotation.toFloat())
            val oriented = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
            try {
                val white = Bitmap.createBitmap(oriented.width, oriented.height, Bitmap.Config.ARGB_8888)
                Canvas(white).apply { drawColor(Color.WHITE); drawBitmap(oriented, 0f, 0f, null) }
                return white
            } finally { if (oriented !== decoded) oriented.recycle() }
        } finally { decoded.recycle() }
    }

    fun process(files: JSONArray, progress: (Int) -> Unit = {}): JSONObject {
        require(files.length() in 1..10) { "Выберите от 1 до 10 файлов." }
        val dataPath = installModels()
        val api = TessBaseAPI()
        val lines = JSONArray(); val previews = JSONArray(); val hashes = mutableListOf<String>()
        var totalBytes = 0; var pageCount = 0
        try {
            check(api.init(dataPath.absolutePath, "rus+eng", TessBaseAPI.OEM_LSTM_ONLY)) { "Не удалось запустить OCR. Переустановите приложение." }
            synchronized(engineLock) { tess = api }
            api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK)
            fun page(bitmap: Bitmap) {
                try {
                    checkCancelled()
                    require(++pageCount <= 10) { "Не больше 10 страниц в одном документе." }
                    require(minOf(bitmap.width, bitmap.height) >= 300) { "Слишком маленькое изображение. Используйте полный снимок." }
                    progress(pageCount)
                    api.setImage(bitmap)
                    api.getHOCRText(pageCount - 1) // interruptible pass; UTF8 below reads its cached result
                    checkCancelled()
                    val text = api.getUTF8Text().orEmpty()
                    val confidence = api.meanConfidence()
                    text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.forEach { line ->
                        lines.put(JSONObject().put("page", pageCount).put("text", line).put("confidence", confidence)
                            .put("box", JSONObject.NULL).put("imageSize", JSONArray(listOf(bitmap.width, bitmap.height))))
                    }
                    val scale = minOf(1.0, 1400.0 / maxOf(bitmap.width, bitmap.height))
                    val preview = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
                    try {
                        val out = ByteArrayOutputStream(); preview.compress(Bitmap.CompressFormat.JPEG, 70, out)
                        previews.put("data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
                    } finally { if (preview !== bitmap) preview.recycle() }
                    api.clear()
                } finally { bitmap.recycle() }
            }
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
                    try {
                        file.writeBytes(bytes)
                        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                            PdfRenderer(descriptor).use { pdf ->
                                require(pdf.pageCount in 1..(10 - pageCount)) { "Не больше 10 страниц в одном документе." }
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
                    } finally { file.delete() }
                } else page(image(bytes, rotation))
            }
            checkCancelled()
            require(lines.length() > 0) { "Текст не найден. Снимите документ чётче, без бликов." }
            return JSONObject().put("lines", lines).put("previews", previews).put("pages", pageCount)
                .put("fileHashes", JSONArray(hashes)).put("documentHash", hash(hashes.sorted().joinToString("|").toByteArray()))
                .put("engine", "tesseract-android-rus-eng-offline")
        } finally {
            synchronized(engineLock) { tess = null; api.recycle() }
        }
    }
}
