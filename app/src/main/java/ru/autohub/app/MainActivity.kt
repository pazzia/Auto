package ru.autohub.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        // Прозрачные системные панели: верхние отступы экранов уже учитывают статус-бар
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.WHITE, Color.WHITE)
        )
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#F3F1EC"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            // Диалоги JS (например, ввод пробега)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // Всё, что не внутри прототипа, не открываем
                    return !request.url.toString().startsWith("file:///android_asset/")
                }
            }
        }
        // Доступ к открытым API (NHTSA vPIC) из веб-интерфейса
        webView.addJavascriptInterface(NativeHttp(webView), "NativeHttp")
        setContentView(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl("file:///android_asset/www/index.html#Garage")
        }

        // Кнопка «Назад» возвращает на предыдущий экран прототипа
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
