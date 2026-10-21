package ru.autohub.app

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Dedicated upload bridge for the user's configured HTTPS OCR server. No redirects. */
class NativeOcr(private val webView: WebView) {
    private val pool = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val busy = AtomicBoolean(false)

    private fun reply(id: String, status: Int, body: String) {
        main.post { webView.evaluateJavascript("window.__nativeOcrCb(${JSONObject.quote(id)}, $status, ${JSONObject.quote(body)})", null) }
    }

    @JavascriptInterface
    fun recognize(address: String, token: String, body: String, callbackId: String) {
        if (!busy.compareAndSet(false, true)) {
            reply(callbackId, 429, "{\"detail\":\"Распознавание уже выполняется\"}")
            return
        }
        pool.execute {
            var status = 0
            var result = "{\"detail\":\"Не удалось подключиться к OCR-серверу\"}"
            try {
                val url = URL(address)
                require(url.protocol == "https" && url.userInfo == null && url.query == null && url.ref == null)
                require(url.path.endsWith("/v1/documents/recognize"))
                require(token.length in 24..4096 && !token.contains('\n') && !token.contains('\r'))
                val bytes = body.toByteArray(Charsets.UTF_8)
                require(bytes.size <= 24 * 1024 * 1024)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 15000
                    readTimeout = 760000
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer $token")
                    setFixedLengthStreamingMode(bytes.size)
                }
                try {
                    conn.outputStream.use { it.write(bytes) }
                    status = conn.responseCode
                    val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                    result = stream?.use {
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            val n = it.read(buffer)
                            if (n < 0) break
                            require(output.size() + n <= 4 * 1024 * 1024)
                            output.write(buffer, 0, n)
                        }
                        output.toString("UTF-8")
                    } ?: result
                } finally { conn.disconnect() }
            } catch (_: Exception) {
                status = 0
            } finally {
                busy.set(false)
                reply(callbackId, status, result)
            }
        }
    }
}
