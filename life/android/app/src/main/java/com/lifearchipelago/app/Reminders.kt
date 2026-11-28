package com.lifearchipelago.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * R11 + R59 reminders. The web app sends the list (core/reminders.js): tasks, goals and a goal's first
 * step, each with a date, a time ("HH:MM", or 09:00 when it has none) and a kind: "notify" (a
 * notification with sound) or "alarm" (rings like an alarm clock until stopped). Alarms are exact.
 * The list is kept in preferences so it can be scheduled again after the phone restarts.
 */
object Reminders {
    const val CHANNEL = "reminders_v2"
    const val ALARM_CHANNEL = "alarms"
    const val ACTION_SNOOZE = "com.lifearchipelago.app.SNOOZE"
    const val ACTION_STOP = "com.lifearchipelago.app.STOP"
    private const val PREFS = "reminders"
    private const val HOUR = 9
    private val HHMM = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

    /** When to ring for an item due on [dueIso] at [time] (09:00 when empty or invalid), or null when that moment has passed. Pure, so it is unit-tested. */
    fun triggerAt(dueIso: String, nowMs: Long, zone: ZoneId = ZoneId.systemDefault(), time: String = ""): Long? = try {
        val t = if (HHMM.matches(time)) LocalTime.parse(time) else LocalTime.of(HOUR, 0)
        val at = LocalDate.parse(dueIso).atTime(t).atZone(zone).toInstant().toEpochMilli()
        if (at > nowMs) at else null
    } catch (e: Exception) {
        null
    }

    /** "Snooze" rings again ten minutes later. */
    fun snoozeAt(nowMs: Long): Long = nowMs + 10 * 60 * 1000L

    /** Ids that were scheduled before but are not in the new list: their alarms must be cancelled. */
    fun stale(before: Set<String>, now: Set<String>): Set<String> = before - now

    fun apply(context: Context, json: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val before = ids(prefs.getString("list", "[]") ?: "[]")
        val list = try { JSONArray(json) } catch (e: Exception) { return }
        for (id in stale(before, ids(json))) alarms(context).cancel(pending(context, JSONObject().put("id", id)))
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
            val pi = pending(context, o)
            val at = triggerAt(o.optString("due"), now, ZoneId.systemDefault(), o.optString("time"))
            if (at == null) alarms(context).cancel(pi) else setAt(context, at, pi)
        }
    }

    private fun ids(json: String): Set<String> = try {
        val a = JSONArray(json); (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("id") }.toSet()
    } catch (e: Exception) { emptySet() }

    private fun alarms(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    /** Exact when the phone allows it (always for this app on Android 13+, by USE_EXACT_ALARM). */
    private fun setAt(context: Context, at: Long, pi: PendingIntent) {
        val am = alarms(context)
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    private fun pending(context: Context, o: JSONObject, code: String = o.optString("id")): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java)
            .putExtra("id", o.optString("id")).putExtra("title", o.optString("title")).putExtra("due", o.optString("due"))
            .putExtra("time", o.optString("time")).putExtra("kind", o.optString("kind", "notify")).putExtra("open", o.optString("open", o.optString("id")))
        return PendingIntent.getBroadcast(context, code.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** The two buttons on a notification: "Snooze 10 min" and, for alarms, "Stop". */
    fun actionIntent(context: Context, from: Intent, action: String): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).setAction(action).putExtras(from)
        val code = (from.getStringExtra("id") + action).hashCode()
        return PendingIntent.getBroadcast(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun snooze(context: Context, from: Intent) {
        val o = JSONObject().put("id", from.getStringExtra("id")).put("title", from.getStringExtra("title")).put("due", from.getStringExtra("due"))
            .put("time", from.getStringExtra("time")).put("kind", from.getStringExtra("kind")).put("open", from.getStringExtra("open"))
        setAt(context, snoozeAt(System.currentTimeMillis()), pending(context, o, o.optString("id") + ":snooze"))
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.deleteNotificationChannel("reminders") // the old quiet channel (before R59)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Tasks and goals at their time, with sound"
            })
            nm.createNotificationChannel(NotificationChannel(ALARM_CHANNEL, "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Rings like an alarm clock until you stop it"
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                enableVibration(true); vibrationPattern = longArrayOf(0, 600, 400, 600)
                setBypassDnd(true)
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

/** Shows the notification (or rings the alarm) for one item; also handles "Snooze 10 min" and "Stop". */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val nm = NotificationManagerCompat.from(context)
        if (intent.action == Reminders.ACTION_STOP) { nm.cancel(id.hashCode()); return }
        if (intent.action == Reminders.ACTION_SNOOZE) { nm.cancel(id.hashCode()); Reminders.snooze(context, intent); return }
        val title = intent.getStringExtra("title") ?: ""
        val time = intent.getStringExtra("time") ?: ""
        val alarm = intent.getStringExtra("kind") == "alarm"
        val open = intent.getStringExtra("open") ?: id
        Reminders.ensureChannel(context)
        val b = NotificationCompat.Builder(context, if (alarm) Reminders.ALARM_CHANNEL else Reminders.CHANNEL)
            .setSmallIcon(if (alarm) android.R.drawable.ic_lock_idle_alarm else android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(if (time.isNotEmpty()) time else "Due today")
            .setContentIntent(Reminders.openIntent(context, open))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (alarm) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
            .addAction(0, "Snooze 10 min", Reminders.actionIntent(context, intent, Reminders.ACTION_SNOOZE))
        if (alarm) {
            b.addAction(0, "Stop", Reminders.actionIntent(context, intent, Reminders.ACTION_STOP))
            b.setFullScreenIntent(Reminders.openIntent(context, open), true)
            b.setOngoing(true)
        }
        val n = b.build()
        if (alarm) n.flags = n.flags or Notification.FLAG_INSISTENT // keeps ringing until stopped, opened or snoozed
        try { nm.notify(id.hashCode(), n) } catch (e: SecurityException) { /* notifications not allowed */ }
    }
}

/** Alarms are lost when the phone restarts: schedule them again from the saved list. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) Reminders.reschedule(context)
    }
}
