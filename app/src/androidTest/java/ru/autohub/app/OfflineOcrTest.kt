package ru.autohub.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.provider.Settings
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.util.concurrent.CancellationException

@RunWith(AndroidJUnit4::class)
class OfflineOcrTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun bitmap(): Bitmap {
        val b = Bitmap.createBitmap(1800, 1400, Bitmap.Config.ARGB_8888)
        val c = Canvas(b); c.drawColor(Color.WHITE)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 42f; typeface = Typeface.create("sans-serif", Typeface.NORMAL) }
        listOf("Заказ-наряд № 125", "Автосервис: Тест", "Пробег: 125400 км", "Дата закрытия: 02.10.2026", "Выполненные работы", "Замена масла", "Замена фильтра", "Запчасти", "Масло моторное", "Итого к оплате: 3900,00").forEachIndexed { i, text -> c.drawText(text, 80f, 100f + i * 100, p) }
        return b
    }
    private fun entry(data: ByteArray, rotation: Int = 0) = JSONObject().put("data", Base64.encodeToString(data, Base64.NO_WRAP)).put("rotation", rotation)
    private fun png(): ByteArray { val b = bitmap(); try { return ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray() } finally { b.recycle() } }

    @Test fun firstUseRussianPhotoWithoutNetwork() {
        assertEquals("Test must run in airplane mode", 1, Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0))
        // Ensure first-use model setup succeeds with no previously extracted files.
        java.io.File(context.noBackupFilesDir, "ocr").deleteRecursively()
        val result = OfflineOcrEngine(context).process(JSONArray().put(entry(png())))
        val text = result.getJSONArray("lines").toString()
        assertTrue(text, text.contains("125400")); assertTrue(text, text.contains("02.10.2026")); assertTrue(text, text.contains("Замена"))
        assertEquals(1, result.getInt("pages")); assertEquals(1, result.getJSONArray("previews").length())
        assertEquals("tesseract-android-rus-eng-offline", result.getString("engine"))
    }
    @Test fun rasterPdfTwoPagesWithoutNetwork() {
        val b = bitmap(); val pdf = PdfDocument()
        val out = ByteArrayOutputStream()
        try {
            repeat(2) { i ->
                val page = pdf.startPage(PdfDocument.PageInfo.Builder(900, 700, i + 1).create())
                page.canvas.drawBitmap(b, null, android.graphics.Rect(0, 0, 900, 700), null)
                pdf.finishPage(page)
            }
            pdf.writeTo(out)
        } finally { pdf.close(); b.recycle() }
        val result = OfflineOcrEngine(context).process(JSONArray().put(entry(out.toByteArray())))
        assertEquals(2, result.getInt("pages"))
        assertTrue(result.getJSONArray("lines").toString().contains("125400"))
    }
    @Test fun cancellationAndInvalidFileDoNotProduceRecords() {
        val engine = OfflineOcrEngine(context); engine.cancel()
        try { engine.process(JSONArray().put(entry(png()))); fail("Expected cancellation") } catch (_: CancellationException) { }
        try { OfflineOcrEngine(context).process(JSONArray().put(entry(byteArrayOf(1, 2, 3)))); fail("Expected invalid image") } catch (_: IllegalArgumentException) { }
    }
}
