package ru.autohub.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Нативный слой без OCR: выборка больших фото, EXIF-ориентации, хранение напоминаний. */
@RunWith(AndroidJUnit4::class)
class NativeLayerTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun sampleKeepsLongSideAtLeast2400() {
        val engine = OfflineOcrEngine(context)
        assertEquals(1, engine.sampleSize(1800, 1400))
        assertEquals(1, engine.sampleSize(4000, 3000))   // 12 Мп: уменьшение до 2000 px потеряло бы мелкий текст
        assertEquals(2, engine.sampleSize(6000, 4000))   // 24 Мп → 3000×2000
        assertEquals(2, engine.sampleSize(8160, 6120))   // 50 Мп → 4080×3060
        assertEquals(4, engine.sampleSize(12000, 9000))  // 108 Мп → 3000×2250
        assertEquals(4, engine.sampleSize(16320, 12240)) // 200 Мп → 4080×3060
    }

    /** Блоки 3×2 по 10 px разного цвета; после преобразования сверяются центры блоков (как PIL exif_transpose). */
    @Test fun exifOrientationsMatchSpecification() {
        val w = 3; val h = 2; val block = 10
        val colors = intArrayOf(Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW, Color.CYAN, Color.MAGENTA)
        val src = Bitmap.createBitmap(w * block, h * block, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(src); val paint = Paint()
        for (y in 0 until h) for (x in 0 until w) {
            paint.color = colors[y * w + x]
            canvas.drawRect((x * block).toFloat(), (y * block).toFloat(), ((x + 1) * block).toFloat(), ((y + 1) * block).toFloat(), paint)
        }
        // Где в исходнике лежит блок (x, y) результата
        val expected: Map<Int, (Int, Int) -> Pair<Int, Int>> = mapOf(
            ExifInterface.ORIENTATION_NORMAL to { x, y -> x to y },
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL to { x, y -> (w - 1 - x) to y },
            ExifInterface.ORIENTATION_ROTATE_180 to { x, y -> (w - 1 - x) to (h - 1 - y) },
            ExifInterface.ORIENTATION_FLIP_VERTICAL to { x, y -> x to (h - 1 - y) },
            ExifInterface.ORIENTATION_TRANSPOSE to { x, y -> y to x },
            ExifInterface.ORIENTATION_ROTATE_90 to { x, y -> y to (h - 1 - x) },
            ExifInterface.ORIENTATION_TRANSVERSE to { x, y -> (w - 1 - y) to (h - 1 - x) },
            ExifInterface.ORIENTATION_ROTATE_270 to { x, y -> (w - 1 - y) to x },
        )
        try {
            for ((orientation, map) in expected) {
                val out = Bitmap.createBitmap(src, 0, 0, src.width, src.height, OfflineOcrEngine.exifMatrix(orientation), false)
                val swapped = orientation >= ExifInterface.ORIENTATION_TRANSPOSE
                val ow = if (swapped) h else w; val oh = if (swapped) w else h
                assertEquals("ширина, ориентация $orientation", ow * block, out.width)
                assertEquals("высота, ориентация $orientation", oh * block, out.height)
                for (y in 0 until oh) for (x in 0 until ow) {
                    val (sx, sy) = map(x, y)
                    assertEquals("ориентация $orientation, блок ($x, $y)", colors[sy * w + sx], out.getPixel(x * block + block / 2, y * block + block / 2))
                }
                if (out !== src) out.recycle()
            }
        } finally { src.recycle() }
    }

    @Test fun remindersArePersistedAndCancelled() {
        val id = 990_001
        val prefs = context.getSharedPreferences("reminders", Context.MODE_PRIVATE)
        try {
            val mode = Reminders.schedule(context, id, System.currentTimeMillis() + 3_600_000, "Тест", "Напоминание")
            assertTrue(mode, mode == "exact" || mode == "window")
            assertTrue(prefs.contains("r$id"))
            Reminders.restore(context) // будущее напоминание остаётся
            assertTrue(prefs.contains("r$id"))
        } finally {
            Reminders.cancel(context, id)
        }
        assertFalse(prefs.contains("r$id"))
    }
}
