package ru.autohub.app

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Мост для запросов из веб-интерфейса к открытым API.
 * Запросы идут из нативного кода, поэтому не упираются в CORS.
 * Разрешены только HTTPS и хосты из белого списка.
 */
class NativeHttp(private val webView: WebView) {

    // Используется только в режиме live (web/api.js). Адрес бэкенда добавить сюда же.
    private val allowedHosts = setOf("vpic.nhtsa.dot.gov")
    private val pool = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun get(url: String, callbackId: String) {
        pool.execute {
            var ok = false
            val body: String = try {
                val u = URL(url)
                require(u.protocol == "https" && u.host in allowedHosts) { "host not allowed" }
                val conn = (u.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 15_000
                    setRequestProperty("Accept", "application/json")
                }
                try {
                    val code = conn.responseCode
                    val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                    val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
                    ok = code in 200..299
                    if (ok) text else "HTTP $code"
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                e.message ?: "network error"
            }
            val js = "window.__nativeHttpCb(${JSONObject.quote(callbackId)}, $ok, ${JSONObject.quote(body)})"
            main.post { webView.evaluateJavascript(js, null) }
        }
    }
}
