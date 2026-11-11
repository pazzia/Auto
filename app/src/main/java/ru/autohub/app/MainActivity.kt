package ru.autohub.app

import android.Manifest
import android.annotation.SuppressLint
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
import android.view.ViewGroup
import android.webkit.ValueCallback
import androidx.core.content.FileProvider
import java.io.File
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
    private lateinit var offlineOcr: NativeOcr
    private lateinit var nativeHttp: NativeHttp
    private val main = Handler(Looper.getMainLooper())
    private var destroyed = false

    // Ожидающие ответа запросы из веб-интерфейса (сохраняются в onSaveInstanceState)
    private var pendingLocation: String? = null
    private var pendingPhoto: String? = null
    private val pendingNotify = ArrayList<String>()
    // Активные подписки на координаты — снимаются в onDestroy, чтобы GPS не работал после закрытия
    private val locationListeners = mutableSetOf<LocationListener>()

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

    // Document capture is separate from the low-resolution parking preview.
    // Снимок документа лежит в cacheDir/documents, пока его не прочитает веб-интерфейс:
    // удаляется при отмене съёмки, если отдать его некому, по releaseDocumentCaptures() и при запуске.
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var documentCameraUri: Uri? = null
    private var documentCameraFile: File? = null
    private val documentPicker = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        fileCallback?.onReceiveValue(uris.takeIf { it.isNotEmpty() }?.toTypedArray())
        fileCallback = null
    }
    private val documentCamera = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val callback = fileCallback
        val uri = documentCameraUri
        val file = documentCameraFile
        fileCallback = null
        documentCameraUri = null
        documentCameraFile = null
        if (ok && callback != null && uri != null && file != null && file.length() > 0) {
            callback.onReceiveValue(arrayOf(uri))
        } else {
            // Съёмку отменили, или активность пересоздана и окно выбора файла в WebView уже закрыто
            callback?.onReceiveValue(null)
            file?.delete()
        }
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ ->
            val ids = ArrayList(pendingNotify)
            pendingNotify.clear()
            val enabled = Reminders.notificationsEnabled(this)
            ids.forEach { notifyCallback(it, enabled) }
        }

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION") // statusBarColor/navigationBarColor устарели только с API 35
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) {
            pendingLocation = savedInstanceState.getString(STATE_PENDING_LOCATION)
            pendingPhoto = savedInstanceState.getString(STATE_PENDING_PHOTO)
            savedInstanceState.getStringArrayList(STATE_PENDING_NOTIFY)?.let { pendingNotify.addAll(it) }
            documentCameraUri = savedInstanceState.getString(STATE_CAMERA_URI)?.let { Uri.parse(it) }
            documentCameraFile = savedInstanceState.getString(STATE_CAMERA_FILE)?.let { File(it) }
        }
        // Старые снимки документов: страница загружается заново, ссылок на них в JS уже нет
        releaseDocumentCaptures()
        // Будильники не переживают перезагрузку и «Остановить» в настройках — ставим будущие напоминания заново
        Reminders.restore(this)
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
            // file:///android_asset/ грузится и без доступа к файловой системе; origin страницы не меняется
            // (на нём localStorage и IndexedDB пользователей)
            settings.allowFileAccess = false
            overScrollMode = WebView.OVER_SCROLL_NEVER
            // Диалоги JS (подтверждения, ввод пробега)
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    var photo: File? = null
                    try {
                        if (params.isCaptureEnabled) {
                            val folder = documentsFolder().apply { mkdirs() }
                            folder.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86400000 }?.forEach { it.delete() }
                            val file = File.createTempFile("capture-", ".jpg", folder)
                            photo = file
                            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
                            documentCameraFile = file
                            documentCameraUri = uri
                            documentCamera.launch(uri)
                        } else {
                            documentPicker.launch(arrayOf("image/jpeg", "image/png", "image/webp", "application/pdf"))
                        }
                    } catch (_: Exception) {
                        fileCallback?.onReceiveValue(null)
                        fileCallback = null
                        photo?.delete()
                        documentCameraFile = null
                        documentCameraUri = null
                    }
                    return true
                }
            }
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
        nativeHttp = NativeHttp(webView)
        webView.addJavascriptInterface(nativeHttp, "NativeHttp")
        offlineOcr = NativeOcr(webView)
        webView.addJavascriptInterface(offlineOcr, "NativeOcr")
        webView.addJavascriptInterface(NativeDevice(this), "NativeDevice")
        setContentView(webView)

        // restoreState() возвращает null, если восстановить нечего (или формат состояния не подошёл) — тогда с начала
        val restored = savedInstanceState?.let { webView.restoreState(it) }
        if (restored == null || restored.size == 0) webView.loadUrl(START_URL)

        // Кнопка «Назад» возвращает на предыдущий экран прототипа
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
        webView.onResume()
    }

    override fun onPause() {
        // JS-таймеры (опрос координат на экране парковки) и отрисовка не работают в фоне
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
        destroyed = true
        main.removeCallbacksAndMessages(null)
        val lm = getSystemService(LOCATION_SERVICE) as? LocationManager
        locationListeners.forEach { listener -> runCatching { lm?.removeUpdates(listener) } }
        locationListeners.clear()
        if (::offlineOcr.isInitialized) offlineOcr.close()
        if (::nativeHttp.isInitialized) nativeHttp.close()
        if (::webView.isInitialized) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
            webView.stopLoading()
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
        outState.putString(STATE_PENDING_LOCATION, pendingLocation)
        outState.putString(STATE_PENDING_PHOTO, pendingPhoto)
        outState.putStringArrayList(STATE_PENDING_NOTIFY, ArrayList(pendingNotify))
        outState.putString(STATE_CAMERA_URI, documentCameraUri?.toString())
        outState.putString(STATE_CAMERA_FILE, documentCameraFile?.absolutePath)
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
        if (destroyed) return
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
                locationListeners.remove(this)
                geoCallback(callbackId, location, "")
            }
            // Явные реализации нужны для Android 8–10: там эти методы без реализации по умолчанию
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
            @Deprecated("Deprecated in Java")
            @Suppress("DEPRECATION")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }
        locationListeners.add(listener)
        providers.forEach { lm.requestLocationUpdates(it, 0L, 0f, listener, Looper.getMainLooper()) }
        // Не дольше 25 секунд: иначе — последняя известная точка или ошибка
        main.postDelayed({
            if (!done) {
                done = true
                lm.removeUpdates(listener)
                locationListeners.remove(listener)
                val last = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
                geoCallback(callbackId, last, if (last == null) "timeout" else "stale")
            }
        }, 25_000)
    }

    private fun geoCallback(id: String, loc: Location?, error: String) {
        if (destroyed) return
        val js = if (loc == null) {
            "window.__nativeGeoCb(${JSONObject.quote(id)}, false, 0, 0, 0, ${JSONObject.quote(error)})"
        } else {
            "window.__nativeGeoCb(${JSONObject.quote(id)}, true, ${loc.latitude}, ${loc.longitude}, ${loc.accuracy}, ${JSONObject.quote(error)})"
        }
        webView.evaluateJavascript(js, null)
    }

    /* ---------- Фото ---------- */

    fun takePhoto(callbackId: String) {
        if (destroyed) return
        pendingPhoto = callbackId
        try {
            photoCapture.launch(null)
        } catch (e: ActivityNotFoundException) {
            pendingPhoto = null
            photoCallback(callbackId, null)
        }
    }

    private fun photoCallback(id: String, dataUrl: String?) {
        if (destroyed) return
        val arg = if (dataUrl == null) "null" else JSONObject.quote(dataUrl)
        webView.evaluateJavascript("window.__nativePhotoCb(${JSONObject.quote(id)}, $arg)", null)
    }

    /* ---------- Уведомления и снимки документов ---------- */

    /** Ответ JS: покажет ли система напоминания. На Android 13+ при необходимости спрашивает разрешение. */
    fun requestNotifications(callbackId: String) {
        if (destroyed) return
        if (Reminders.notificationsEnabled(this)) { notifyCallback(callbackId, true); return }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingNotify.add(callbackId)
            // Несколько напоминаний подряд (парковка ставит два) — один системный диалог
            if (pendingNotify.size == 1) {
                try {
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                } catch (_: Exception) {
                    val ids = ArrayList(pendingNotify)
                    pendingNotify.clear()
                    ids.forEach { notifyCallback(it, false) }
                }
            }
            return
        }
        // Уведомления выключены в настройках телефона — системным диалогом их не включить
        notifyCallback(callbackId, false)
    }

    private fun notifyCallback(id: String, enabled: Boolean) {
        if (destroyed) return
        webView.evaluateJavascript("window.__nativeNotifyCb && window.__nativeNotifyCb(${JSONObject.quote(id)}, $enabled)", null)
    }

    private fun documentsFolder() = File(cacheDir, "documents")

    /** Удалить снимки документов, кроме того, что камера снимает прямо сейчас. */
    fun releaseDocumentCaptures() {
        val keep = documentCameraFile?.absolutePath
        documentsFolder().listFiles()?.filter { it.absolutePath != keep }?.forEach { it.delete() }
    }

    private companion object {
        const val START_URL = "file:///android_asset/www/index.html#Garage"
        const val STATE_PENDING_LOCATION = "autohub.pendingLocation"
        const val STATE_PENDING_PHOTO = "autohub.pendingPhoto"
        const val STATE_PENDING_NOTIFY = "autohub.pendingNotify"
        const val STATE_CAMERA_URI = "autohub.documentCameraUri"
        const val STATE_CAMERA_FILE = "autohub.documentCameraFile"
    }
}
