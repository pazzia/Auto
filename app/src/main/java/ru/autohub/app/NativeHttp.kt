package ru.autohub.app

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Мост для запросов из веб-интерфейса к открытым API.
 * Запросы идут из нативного кода, поэтому не упираются в CORS.
 * Разрешены только HTTPS и хосты из белого списка; редирект — ошибка (иначе он увёл бы с белого списка),
 * ответ — не больше 1 МБ.
 */
class NativeHttp(private val webView: WebView) {

    /** После onDestroy активности ответы в уничтоженный WebView не отправляются. */
    @Volatile private var closed = false

    fun close() { closed = true }

    @JavascriptInterface
    fun get(url: String, callbackId: String) = fetch(url, null, callbackId)

    /**
     * GET с токеном «Authorization: Bearer …» — только для хостов из [bearerHosts] (ключ пользователя
     * к платному API хранится в приложении на телефоне и не уходит ни на какой другой хост).
     */
    @JavascriptInterface
    fun getAuth(url: String, bearer: String, callbackId: String) = fetch(url, bearer, callbackId)

    private fun fetch(url: String, bearer: String?, callbackId: String) {
        pool.execute {
            var ok = false
            var status = 0
            val body: String = try {
                val u = URL(url)
                require(u.protocol == "https" && u.host in allowedHosts) { "host not allowed" }
                require(bearer == null || u.host in bearerHosts) { "token not allowed for host" }
                // видимые ASCII-символы без пробелов: перевод строки в заголовок попасть не может
                require(bearer == null || bearer.matches(Regex("[\\x21-\\x7E]{8,256}"))) { "bad token" }
                val conn = (u.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    // платные и государственные источники отвечают долго (проверка идёт в реальном времени)
                    readTimeout = slowHosts[u.host] ?: 15_000
                    instanceFollowRedirects = false
                    useCaches = false
                    setRequestProperty("Accept", "application/json")
                    if (bearer != null) setRequestProperty("Authorization", "Bearer $bearer")
                }
                try {
                    val code = conn.responseCode
                    status = code
                    when (code) {
                        in 200..299 -> {
                            if (conn.contentLengthLong > MAX_RESPONSE_BYTES) throw IOException("response too large")
                            val text = conn.inputStream.use { readLimited(it) }
                            ok = true
                            text
                        }
                        in 300..399 -> "redirect not allowed (HTTP $code)"
                        // 4xx: тело с описанием ошибки (API Assist: {"error", "error_code"}), тот же лимит размера
                        in 400..499 -> conn.errorStream?.use { readLimited(it) } ?: "HTTP $code"
                        else -> "HTTP $code"
                    }
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                e.message ?: "network error"
            }
            val js = "window.__nativeHttpCb(${JSONObject.quote(callbackId)}, $ok, ${JSONObject.quote(body)}, $status)"
            main.post { if (!closed) webView.evaluateJavascript(js, null) }
        }
    }

    private fun readLimited(stream: InputStream): String {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val n = stream.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            if (out.size() > MAX_RESPONSE_BYTES) throw IOException("response too large")
        }
        return String(out.toByteArray(), Charsets.UTF_8)
    }

    companion object {
        private const val MAX_RESPONSE_BYTES = 1024 * 1024

        // Используется только в режиме live (web/api.js). Адрес бэкенда добавить сюда же.
        // service.api-assist.com — госданные по ключу владельца (web/gov.js, AUTO-45)
        // api.avtovincod.ru — спецификация по VIN и VIN по госномеру по ключу владельца (web/vincod.js, AUTO-46)
        private val allowedHosts = setOf("vpic.nhtsa.dot.gov", "service.api-assist.com", "api.avtovincod.ru")
        private val bearerHosts = setOf("api.avtovincod.ru")
        private val slowHosts = mapOf("api.avtovincod.ru" to 90_000, "service.api-assist.com" to 60_000)

        /** Один пул на процесс: при пересоздании активности потоки не копятся. */
        private val pool: ExecutorService = Executors.newFixedThreadPool(4) { runnable ->
            Thread(runnable, "native-http").apply { isDaemon = true }
        }
        private val main = Handler(Looper.getMainLooper())
    }
}
