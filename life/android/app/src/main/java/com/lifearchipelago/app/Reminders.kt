package com.lifearchipelago.app

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * R11 reminders. The web app sends the list of open tasks with a date (core/reminders.js);
 * this schedules one notification per task at 09:00 on its due day and keeps the list in
 * preferences so it can be scheduled again after a restart of the phone.
 */
object Reminders {
    const val CHANNEL = "reminders"
    private const val PREFS = "reminders"
    private const val HOUR = 9

    /** When to ring for a task due on [dueIso], or null when that moment has passed. Pure, so it is unit-tested. */
    fun triggerAt(dueIso: String, nowMs: Long, zone: ZoneId = ZoneId.systemDefault(), hour: Int = HOUR): Long? = try {
        val at = LocalDate.parse(dueIso).atTime(LocalTime.of(hour, 0)).atZone(zone).toInstant().toEpochMilli()
        if (at > nowMs) at else null
    } catch (e: Exception) {
        null
    }

    /** Ids that were scheduled before but are not in the new list: their alarms must be cancelled. */
    fun stale(before: Set<String>, now: Set<String>): Set<String> = before - now

    fun apply(context: Context, json: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val before = ids(prefs.getString("list", "[]") ?: "[]")
        val list = try { JSONArray(json) } catch (e: Exception) { return }
        for (id in stale(before, ids(json))) alarms(context).cancel(pending(context, id, "", ""))
        prefs.edit().putString("list", list.toString()).apply()
        schedule(context, list)
    }

    fun reschedule(context: Context) {
        val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("list", "[]") ?: "[]"
        schedule(context, try { JSONArray(json) } catch (e: Exception) { JSONArray() })
    }

    private fun schedule(context: Context, list: JSONArray) {
        val now = System.currentTimeMillis()
        for (i in 0 until list.length()) {
            val o = list.optJSONObject(i) ?: continue
            val id = o.optString("id"); val title = o.optString("title"); val due = o.optString("due")
            val pi = pending(context, id, title, due)
            val at = triggerAt(due, now)
            if (at == null) alarms(context).cancel(pi) else alarms(context).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    private fun ids(json: String): Set<String> = try {
        val a = JSONArray(json); (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("id") }.toSet()
    } catch (e: Exception) { emptySet() }

    private fun alarms(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun pending(context: Context, id: String, title: String, due: String): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).putExtra("id", id).putExtra("title", title).putExtra("due", due)
        return PendingIntent.getBroadcast(context, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Tasks that are due today"
            })
        }
    }

    /** Opens the app on a task: the same deep link the web app understands (core/links.js). */
    fun openIntent(context: Context, id: String): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("lifearchipelago://open?id=" + Uri.encode(id)))
            .setComponent(ComponentName(context, MainActivity::class.java))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}

/** Shows the notification for one task when its alarm rings. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val title = intent.getStringExtra("title") ?: ""
        Reminders.ensureChannel(context)
        val n = NotificationCompat.Builder(context, Reminders.CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText("Due today")
            .setContentIntent(Reminders.openIntent(context, id))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try { NotificationManagerCompat.from(context).notify(id.hashCode(), n) } catch (e: SecurityException) { /* notifications not allowed */ }
    }
}

/** Alarms are lost when the phone restarts: schedule them again from the saved list. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) Reminders.reschedule(context)
    }
}
