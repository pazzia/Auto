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
import androidx.core.view.WindowCompat

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION") // statusBarColor/navigationBarColor устарели только с API 35
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Страница занимает место строго между статус-баром и панелью навигации:
        // контент при прокрутке не заезжает под системные иконки.
        // (При переходе на targetSdk 35 Android включит edge-to-edge принудительно —
        // тогда нужно будет отдать отступы через WindowInsets.)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#F3F1EC")
        window.navigationBarColor = Color.WHITE
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true      // тёмные иконки на светлом фоне
            isAppearanceLightNavigationBars = true
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#F3F1EC"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            overScrollMode = WebView.OVER_SCROLL_NEVER
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
