package ru.autohub.app

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.CancellationException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** WebView bridge to local OCR. No URLs, keys, sockets or HTTP clients. */
class NativeOcr(private val webView: WebView) {
    private val pool = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val busy = AtomicBoolean(false)
    @Volatile private var current: OfflineOcrEngine? = null

    @JavascriptInterface fun isOffline(): Boolean = true
    @JavascriptInterface fun cancel() { current?.cancel() }
    fun close() { cancel(); pool.shutdown() }

    private fun reply(id: String, status: Int, result: JSONObject) {
        main.post { webView.evaluateJavascript("window.__nativeOcrCb(${JSONObject.quote(id)}, $status, ${JSONObject.quote(result.toString())})", null) }
    }

    @JavascriptInterface
    fun recognize(body: String, callbackId: String) {
        if (!busy.compareAndSet(false, true)) {
            reply(callbackId, 429, JSONObject().put("detail", "Предыдущее распознавание завершается. Повторите через несколько секунд.")); return
        }
        val engine = OfflineOcrEngine(webView.context.applicationContext)
        current = engine
        pool.execute {
            try {
                require(body.length <= 24 * 1024 * 1024) { "Общий размер файлов — до 16 МБ." }
                val result = engine.process(JSONObject(body).getJSONArray("files")) { page ->
                    main.post { webView.evaluateJavascript("window.__nativeOcrProgress(${JSONObject.quote(callbackId)}, $page)", null) }
                }
                reply(callbackId, 200, result)
            } catch (_: CancellationException) {
                reply(callbackId, 499, JSONObject().put("detail", "Распознавание отменено. Данные не сохранены."))
            } catch (_: OutOfMemoryError) {
                reply(callbackId, 413, JSONObject().put("detail", "Недостаточно памяти. Выберите меньше страниц или закройте другие приложения."))
            } catch (e: Exception) {
                val message = if (e is IllegalArgumentException || e is IllegalStateException) e.message else null
                reply(callbackId, 422, JSONObject().put("detail", message ?: "Не удалось прочитать документ. Проверьте формат или снимите чётче. PDF не должен быть защищён паролем."))
            } finally { current = null; busy.set(false) }
        }
    }
}
