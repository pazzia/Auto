package ru.autohub.app

import android.util.Base64
import android.util.Log
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Приёмочный прогон на реальных документах: тот же движок OfflineOcrEngine (Tesseract4Android),
 * затем document-parser.js ИЗ ASSETS ЭТОГО APK выполняется в Android WebView так же, как в web/documents.js.
 * Документы лежат в репозитории только в зашифрованном виде (tests/acceptance/*.enc) и расшифровываются в CI
 * в androidTest/assets/acceptance/, если задан секрет. Тест ничего не сравнивает сам: он пишет отчёт
 * ocr-acceptance.json, а сравнение с эталоном делает отдельный шаг CI (tools/ocr_replay/compare.cjs).
 */
@RunWith(AndroidJUnit4::class)
class RealDocumentAcceptanceTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun parseInWebView(ocr: JSONObject): JSONObject {
        val latch = CountDownLatch(1); var out: String? = null; var view: WebView? = null
        val js = """
            (function (result) {
              var parsed = window.AutoHubDocumentParser.extractBest(result.passes && result.passes.length ? result.passes : [result.lines]);
              var fields = {}; Object.keys(parsed.fields).forEach(function (k) { fields[k] = parsed.fields[k].value; });
              return JSON.stringify({ fields: fields, warnings: parsed.warnings,
                items: parsed.items.map(function (i) { return { kind: i.kind, name: i.name, quantity: i.quantity, price: i.price, total: i.total }; }) });
            })(${ocr})
        """.trimIndent()
        instrumentation.runOnMainSync {
            val web = WebView(context); view = web
            web.settings.javaScriptEnabled = true
            web.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(v: WebView, url: String?) {
                    v.evaluateJavascript(js) { value -> out = value; latch.countDown() }
                }
            }
            web.loadDataWithBaseURL("file:///android_asset/www/", "<!doctype html><html><head><script src=\"document-parser.js\"></script></head><body></body></html>", "text/html", "utf-8", null)
        }
        check(latch.await(60, TimeUnit.SECONDS)) { "WebView не ответил" }
        instrumentation.runOnMainSync { view?.destroy() }
        val raw = requireNotNull(out) { "Пустой ответ WebView" }
        return JSONObject(JSONArray("[$raw]").getString(0)) // evaluateJavascript возвращает JSON-строку
    }

    @Test fun realDocumentsThroughApkPipeline() {
        val assets = instrumentation.context.assets
        val files = (assets.list("acceptance") ?: emptyArray()).filter { it.endsWith(".jpg") || it.endsWith(".png") || it.endsWith(".pdf") }.sorted()
        assumeTrue("Нет расшифрованных документов для приёмки — пропуск", files.isNotEmpty())
        val parserBytes = context.assets.open("www/document-parser.js").use { it.readBytes() }
        val report = JSONObject()
            .put("parserSha256", MessageDigest.getInstance("SHA-256").digest(parserBytes).joinToString("") { "%02x".format(it) })
            .put("build", context.packageManager.getPackageInfo(context.packageName, 0).versionName)
        val docs = JSONArray()
        for (name in files) {
            val bytes = assets.open("acceptance/$name").use { it.readBytes() }
            val started = System.currentTimeMillis()
            val doc = JSONObject().put("image", name)
            try {
                val ocr = OfflineOcrEngine(context).process(JSONArray().put(JSONObject().put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("rotation", 0)))
                doc.put("ocrMs", System.currentTimeMillis() - started)
                val passes = ocr.getJSONArray("passes")
                doc.put("passes", JSONArray((0 until passes.length()).map { val p = passes.getJSONObject(it); "${p.getString("name")}:${p.getJSONArray("lines").length()}" }))
                doc.put("text", JSONArray((0 until passes.length()).map { i -> val ls = passes.getJSONObject(i).getJSONArray("lines"); (0 until ls.length()).joinToString("\n") { ls.getJSONObject(it).getString("text") } }))
                val parsed = parseInWebView(ocr)
                doc.put("fields", parsed.getJSONObject("fields")).put("items", parsed.getJSONArray("items")).put("warnings", parsed.getJSONArray("warnings"))
            } catch (e: Throwable) { doc.put("error", e.toString()) }
            Log.i("OcrAcceptance", JSONObject(doc.toString()).apply { remove("text") }.toString())
            docs.put(doc)
        }
        report.put("documents", docs)
        val outFile = File(context.getExternalFilesDir(null), "ocr-acceptance.json")
        outFile.writeText(report.toString(1))
        Log.i("OcrAcceptance", "report: ${outFile.absolutePath}")
        assertTrue("Нет ни одного результата разбора", (0 until docs.length()).any { docs.getJSONObject(it).has("fields") })
    }
}
