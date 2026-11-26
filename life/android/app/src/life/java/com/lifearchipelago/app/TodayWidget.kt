package com.lifearchipelago.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONArray

/**
 * R38 home-screen widget. The web app sends today's first tasks (bridge setToday); MainActivity saves
 * them and broadcasts UPDATE_WIDGET, which lands here. Tapping a line opens Today; + opens the input.
 */
class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, views(context))
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION) {
            val m = AppWidgetManager.getInstance(context)
            onUpdate(context, m, m.getAppWidgetIds(ComponentName(context, TodayWidget::class.java)))
        }
    }

    private fun views(context: Context): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_today)
        val json = context.getSharedPreferences("widget", Context.MODE_PRIVATE).getString("today", "[]") ?: "[]"
        val items = try { JSONArray(json) } catch (e: Exception) { JSONArray() }
        val lines = intArrayOf(R.id.w_line1, R.id.w_line2, R.id.w_line3)
        for (i in lines.indices) {
            val o = items.optJSONObject(i)
            val text = when {
                o != null -> (if (o.optBoolean("late")) "• " else "◦ ") + o.optString("title")
                i == 0 -> context.getString(R.string.widget_empty)
                else -> ""
            }
            v.setTextViewText(lines[i], text)
        }
        v.setOnClickPendingIntent(R.id.w_root, open(context, "lifearchipelago://today", 1))
        v.setOnClickPendingIntent(R.id.w_add, open(context, "lifearchipelago://add", 2))
        return v
    }

    private fun open(context: Context, link: String, code: Int): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(link)).setClassName(context, "com.lifearchipelago.app.MainActivity")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    companion object { const val ACTION = "com.lifearchipelago.app.UPDATE_WIDGET" }
}
