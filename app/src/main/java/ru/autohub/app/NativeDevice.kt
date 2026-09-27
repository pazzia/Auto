package ru.autohub.app

import android.webkit.JavascriptInterface

/**
 * Мост к возможностям телефона для веб-интерфейса: геолокация, фото, напоминания.
 * Методы вызываются из JS в фоновом потоке WebView, поэтому всё передаём в главный поток активности.
 * Ответы приходят в JS через window.__nativeGeoCb / window.__nativePhotoCb.
 */
class NativeDevice(private val activity: MainActivity) {

    /** Текущие координаты (GPS работает и без интернета). */
    @JavascriptInterface
    fun getLocation(callbackId: String) {
        activity.runOnUiThread { activity.requestLocation(callbackId) }
    }

    /** Снимок камерой (превью системной камеры, для фото места парковки). */
    @JavascriptInterface
    fun takePhoto(callbackId: String) {
        activity.runOnUiThread { activity.takePhoto(callbackId) }
    }

    /** Напоминание-уведомление в момент atMillis (строка — время в мс с 1970 года). */
    @JavascriptInterface
    fun schedule(id: Int, atMillis: String, title: String, text: String) {
        val at = atMillis.toLongOrNull() ?: return
        activity.runOnUiThread { activity.scheduleReminder(id, at, title, text) }
    }

    @JavascriptInterface
    fun cancel(id: Int) {
        activity.runOnUiThread { activity.cancelReminder(id) }
    }
}
