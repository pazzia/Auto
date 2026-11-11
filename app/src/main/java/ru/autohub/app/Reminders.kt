package ru.autohub.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Напоминания-уведомления (окончание парковки, сроки документов).
 * Каждое запланированное напоминание хранится в SharedPreferences, чтобы его можно было поставить заново
 * после перезагрузки телефона, обновления приложения или выдачи разрешения на точные будильники
 * (ReminderRestoreReceiver) и при запуске приложения. Прошедшие напоминания удаляются.
 */
object Reminders {
    private const val PREFS = "reminders"
    private const val KEY_PREFIX = "r"

    /** Окно для неточного будильника, если точные запрещены. Android 12+ может расширить его до 10 минут. */
    private const val WINDOW_MS = 2 * 60_000L

    private class Reminder(val id: Int, val at: Long, val title: String, val text: String)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun key(id: Int) = KEY_PREFIX + id

    private fun read(context: Context): List<Reminder> = prefs(context).all.mapNotNull { (key, value) ->
        if (!key.startsWith(KEY_PREFIX) || value !is String) return@mapNotNull null
        val id = key.removePrefix(KEY_PREFIX).toIntOrNull() ?: return@mapNotNull null
        try {
            val json = JSONObject(value)
            Reminder(id, json.getLong("at"), json.optString("title"), json.optString("text"))
        } catch (_: Exception) { null }
    }

    /** Точные будильники доступны: Android < 12 или выдано «Будильники и напоминания». */
    fun exactAlarmsAllowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val am = context.getSystemService(AlarmManager::class.java) ?: return false
        return am.canScheduleExactAlarms()
    }

    /** Уведомления будут показаны: разрешение (Android 13+), уведомления приложения и канал напоминаний включены. */
    fun notificationsEnabled(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        val channel = context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(ReminderReceiver.CHANNEL)
        return channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    /**
     * Запланировать (или перепланировать) напоминание с тем же id. Возвращает "exact" — точный будильник,
     * "window" — неточный (точные запрещены). Время в прошлом — уведомление сразу (как раньше).
     */
    fun schedule(context: Context, id: Int, atMillis: Long, title: String, text: String): String {
        val reminder = Reminder(id, atMillis, title, text)
        prefs(context).edit()
            .putString(key(id), JSONObject().put("at", atMillis).put("title", title).put("text", text).toString())
            .apply()
        return if (arm(context, reminder)) "exact" else "window"
    }

    fun cancel(context: Context, id: Int) {
        prefs(context).edit().remove(key(id)).apply()
        val pending = PendingIntent.getBroadcast(
            context, id, Intent(context, ReminderReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) ?: return
        context.getSystemService(AlarmManager::class.java)?.cancel(pending)
        pending.cancel()
    }

    /** Напоминание сработало: убрать из списка, если его не перепланировали на другое время. */
    fun fired(context: Context, id: Int, atMillis: Long) {
        val stored = read(context).firstOrNull { it.id == id } ?: return
        if (stored.at == atMillis || stored.at <= System.currentTimeMillis()) prefs(context).edit().remove(key(id)).apply()
    }

    /** Заново поставить будущие напоминания (после перезагрузки, обновления, при запуске), прошедшие — удалить. */
    fun restore(context: Context) {
        val now = System.currentTimeMillis()
        val editor = prefs(context).edit()
        for (reminder in read(context)) {
            if (reminder.at <= now) editor.remove(key(reminder.id)) else arm(context, reminder)
        }
        editor.apply()
    }

    /** true — точный будильник, false — неточный с коротким окном. */
    private fun arm(context: Context, reminder: Reminder): Boolean {
        val am = context.getSystemService(AlarmManager::class.java) ?: return false
        val pending = PendingIntent.getBroadcast(
            context, reminder.id,
            Intent(context, ReminderReceiver::class.java)
                .putExtra(ReminderReceiver.EXTRA_ID, reminder.id)
                .putExtra(ReminderReceiver.EXTRA_AT, reminder.at)
                .putExtra(ReminderReceiver.EXTRA_TITLE, reminder.title)
                .putExtra(ReminderReceiver.EXTRA_TEXT, reminder.text),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        if (exactAlarmsAllowed(context)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.at, pending)
                return true
            } catch (_: SecurityException) {
                // Разрешение на точные будильники отозвали между проверкой и вызовом — ставим неточный
            }
        }
        am.setWindow(AlarmManager.RTC_WAKEUP, reminder.at, WINDOW_MS, pending)
        return false
    }
}
