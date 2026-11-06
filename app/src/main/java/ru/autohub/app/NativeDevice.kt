package ru.autohub.app

import android.webkit.JavascriptInterface

/**
 * Мост к возможностям телефона для веб-интерфейса: геолокация, фото, напоминания.
 * Методы вызываются из JS в фоновом потоке WebView; то, что требует активности, передаётся в главный поток.
 * Ответы приходят в JS через window.__nativeGeoCb / window.__nativePhotoCb / window.__nativeNotifyCb.
 */
class NativeDevice(private val activity: MainActivity) {

    private val app = activity.applicationContext

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

    /**
     * Напоминание-уведомление в момент atMillis (строка — время в мс с 1970 года). Переживает перезагрузку.
     * Возвращает "exact" (точный будильник), "window" (точные запрещены — может опоздать на несколько минут)
     * или "" (неверное время).
     */
    @JavascriptInterface
    fun schedule(id: Int, atMillis: String, title: String, text: String): String {
        val at = atMillis.toLongOrNull() ?: return ""
        return Reminders.schedule(app, id, at, title, text)
    }

    @JavascriptInterface
    fun cancel(id: Int) {
        Reminders.cancel(app, id)
    }

    /** Покажет ли система уведомление-напоминание (Android 13+: разрешение; везде: уведомления не выключены). */
    @JavascriptInterface
    fun notificationsEnabled(): Boolean = Reminders.notificationsEnabled(app)

    /** Точные будильники разрешены (Android 12+ «Будильники и напоминания»). */
    @JavascriptInterface
    fun exactAlarmsAllowed(): Boolean = Reminders.exactAlarmsAllowed(app)

    /**
     * Запросить разрешение на уведомления (Android 13+), если его ещё нет и спросить можно.
     * Ответ — window.__nativeNotifyCb(callbackId, enabled).
     */
    @JavascriptInterface
    fun requestNotifications(callbackId: String) {
        activity.runOnUiThread { activity.requestNotifications(callbackId) }
    }

    /**
     * Удалить снимки документов с камеры (cacheDir/documents). Вызывать, когда выбранные файлы больше не нужны:
     * после сохранения наряда или закрытия окна сканирования. Снимок, который камера снимает прямо сейчас, не трогается.
     */
    @JavascriptInterface
    fun releaseDocumentCaptures() {
        activity.runOnUiThread { activity.releaseDocumentCaptures() }
    }
}
