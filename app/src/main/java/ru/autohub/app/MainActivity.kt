package ru.autohub.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private val main = Handler(Looper.getMainLooper())

    // Ожидающие ответа запросы из веб-интерфейса
    private var pendingLocation: String? = null
    private var pendingPhoto: String? = null

    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val id = pendingLocation ?: return@registerForActivityResult
            pendingLocation = null
            val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (granted) readLocation(id) else geoCallback(id, null, "denied")
        }

    private val photoCapture =
        registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap: Bitmap? ->
            val id = pendingPhoto ?: return@registerForActivityResult
            pendingPhoto = null
            if (bitmap == null) {
                photoCallback(id, null)
            } else {
                val out = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 82, out)
                photoCallback(id, "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
            }
        }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION") // statusBarColor/navigationBarColor устарели только с API 35
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Страница занимает место строго между статус-баром и панелью навигации.
        // (При переходе на targetSdk 35 Android включит edge-to-edge принудительно —
        // тогда нужно будет отдать отступы через WindowInsets.)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#F3F1EC")
        window.navigationBarColor = Color.WHITE
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#F3F1EC"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            overScrollMode = WebView.OVER_SCROLL_NEVER
            // Диалоги JS (подтверждения, ввод пробега)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    when (url.scheme) {
                        // Звонок (112 на экране «Помощь на дороге») и почта — системными приложениями
                        "tel" -> { openExternal(Intent(Intent.ACTION_DIAL, url)); return true }
                        "mailto" -> { openExternal(Intent(Intent.ACTION_SENDTO, url)); return true }
                        // Маршрут к машине — в установленном приложении карт
                        "geo" -> {
                            if (!openExternal(Intent(Intent.ACTION_VIEW, url))) {
                                val q = url.schemeSpecificPart.substringBefore("?").split(",")
                                if (q.size == 2) openExternal(
                                    Intent(Intent.ACTION_VIEW, Uri.parse("https://yandex.ru/maps/?pt=${q[1]},${q[0]}&z=17&l=map"))
                                )
                            }
                            return true
                        }
                        // Внешние сайты — в браузере телефона
                        "http", "https" -> { openExternal(Intent(Intent.ACTION_VIEW, url)); return true }
                    }
                    // Всё остальное, что не внутри прототипа, не открываем
                    return !url.toString().startsWith("file:///android_asset/")
                }
            }
        }
        // Доступ к открытым API (NHTSA vPIC) и к возможностям телефона из веб-интерфейса
        webView.addJavascriptInterface(NativeHttp(webView), "NativeHttp")
        webView.addJavascriptInterface(NativeDevice(this), "NativeDevice")
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

    private fun openExternal(intent: Intent): Boolean = try {
        startActivity(intent); true
    } catch (e: ActivityNotFoundException) {
        false
    }

    /* ---------- Геолокация ---------- */

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun requestLocation(callbackId: String) {
        if (hasLocationPermission()) {
            readLocation(callbackId)
        } else {
            pendingLocation = callbackId
            locationPermission.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    @SuppressLint("MissingPermission")
    private fun readLocation(callbackId: String) {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
        if (providers.isEmpty()) { geoCallback(callbackId, null, "off"); return }

        // Свежая (до минуты) последняя точка — отдаём сразу
        val fresh = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .filter { System.currentTimeMillis() - it.time < 60_000 }
            .minByOrNull { it.accuracy }
        if (fresh != null) { geoCallback(callbackId, fresh, ""); return }

        var done = false
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                if (done) return
                done = true
                lm.removeUpdates(this)
                geoCallback(callbackId, location, "")
            }
            // Явные реализации нужны для Android 8–10: там эти методы без реализации по умолчанию
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
            @Deprecated("Deprecated in Java")
            @Suppress("DEPRECATION")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }
        providers.forEach { lm.requestLocationUpdates(it, 0L, 0f, listener, Looper.getMainLooper()) }
        // Не дольше 25 секунд: иначе — последняя известная точка или ошибка
        main.postDelayed({
            if (!done) {
                done = true
                lm.removeUpdates(listener)
                val last = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
                geoCallback(callbackId, last, if (last == null) "timeout" else "stale")
            }
        }, 25_000)
    }

    private fun geoCallback(id: String, loc: Location?, error: String) {
        val js = if (loc == null) {
            "window.__nativeGeoCb(${JSONObject.quote(id)}, false, 0, 0, 0, ${JSONObject.quote(error)})"
        } else {
            "window.__nativeGeoCb(${JSONObject.quote(id)}, true, ${loc.latitude}, ${loc.longitude}, ${loc.accuracy}, ${JSONObject.quote(error)})"
        }
        webView.evaluateJavascript(js, null)
    }

    /* ---------- Фото ---------- */

    fun takePhoto(callbackId: String) {
        pendingPhoto = callbackId
        try {
            photoCapture.launch(null)
        } catch (e: ActivityNotFoundException) {
            pendingPhoto = null
            photoCallback(callbackId, null)
        }
    }

    private fun photoCallback(id: String, dataUrl: String?) {
        val arg = if (dataUrl == null) "null" else JSONObject.quote(dataUrl)
        webView.evaluateJavascript("window.__nativePhotoCb(${JSONObject.quote(id)}, $arg)", null)
    }

    /* ---------- Напоминания ---------- */

    private fun reminderIntent(id: Int, title: String = "", text: String = ""): PendingIntent =
        PendingIntent.getBroadcast(
            this, id,
            Intent(this, ReminderReceiver::class.java)
                .putExtra(ReminderReceiver.EXTRA_ID, id)
                .putExtra(ReminderReceiver.EXTRA_TITLE, title)
                .putExtra(ReminderReceiver.EXTRA_TEXT, text),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    fun scheduleReminder(id: Int, atMillis: Long, title: String, text: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        val am = getSystemService(ALARM_SERVICE) as AlarmManager
        // Неточный будильник: не требует особого разрешения, в режиме сна может сдвинуться на несколько минут
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, reminderIntent(id, title, text))
    }

    fun cancelReminder(id: Int) {
        val am = getSystemService(ALARM_SERVICE) as AlarmManager
        am.cancel(reminderIntent(id))
    }
}
