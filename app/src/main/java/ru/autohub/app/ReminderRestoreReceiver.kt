package ru.autohub.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Будильники Android не переживают перезагрузку, а после обновления приложения или выдачи разрешения
 * на точные будильники их стоит поставить заново. Список напоминаний хранит Reminders.
 * Широковещательные сообщения шлёт система, поэтому приёмник не экспортируется.
 */
class ReminderRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            ACTION_EXACT_ALARM_PERMISSION_CHANGED -> Reminders.restore(context)
        }
    }

    companion object {
        /** AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED (API 31) — строкой, чтобы не зависеть от уровня API. */
        const val ACTION_EXACT_ALARM_PERMISSION_CHANGED = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
    }
}
