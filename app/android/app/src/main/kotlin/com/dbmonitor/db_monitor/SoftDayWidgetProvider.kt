package com.dbmonitor.db_monitor

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetPlugin

/**
 * Soft Day themed REAL-TIME home-screen widget.
 *
 * Reads values pushed by the Flutter side (WidgetService via home_widget):
 *   pending       - Int    count of not-done messages
 *   nextCheckMs   - Long   epoch ms of the next 15-minute sync
 *   latestTitle   - String newest message title ("● title" when pending)
 *   lastUpdateMs  - Long   wall clock of the last data change
 *
 * A Handler re-renders every second while a widget instance exists, so
 * WITHOUT the Flutter engine running the UI still updates in real time:
 *   - countdown text ticks down to the next sync
 *   - the terracotta ring drains proportionally
 *   - "updated Ns ago" counts up from the last data change
 */
class SoftDayWidgetProvider : AppWidgetProvider() {

    /**
     * Layout for the current widget size setting (s/m/l/off), pushed by the
     * Flutter side as "widgetSize". Ring sits on the right side in s/m/l;
     * "off" swaps to a text-only layout with a compact countdown line.
     */
    private fun layoutFor(prefs: android.content.SharedPreferences): Int =
        when (prefs.getString("widgetSize", "s")) {
            "m" -> R.layout.soft_day_widget_med
            "l" -> R.layout.soft_day_widget_big
            "off" -> R.layout.soft_day_widget_noring
            else -> R.layout.soft_day_widget
        }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val prefs = HomeWidgetPlugin.getData(context)
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context, prefs))
        }
        scheduleTick(context)
    }

    override fun onEnabled(context: Context) {
        scheduleTick(context)
    }

    override fun onDisabled(context: Context) {
        tickHandler.removeCallbacksAndMessages(null)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray?) {
        super.onDeleted(context, appWidgetIds)
        // Stop ticking when the last widget instance is gone.
        val mgr = AppWidgetManager.getInstance(context)
        val remaining =
            mgr.getAppWidgetIds(ComponentName(context, SoftDayWidgetProvider::class.java))
        if (remaining.isEmpty()) {
            tickHandler.removeCallbacksAndMessages(null)
        }
    }

    /**
     * Re-renders every attached widget each second. Runs on the main looper
     * (RemoteViews require it); one 1s tick for all instances is cheap
     * because we build the views once per push, not per widget.
     */
    private fun scheduleTick(context: Context) {
        tickHandler.removeCallbacks(tickRunnable)
        tickRunnable = Runnable {
            pushUpdate(context.applicationContext)
            scheduleTick(context)
        }
        tickHandler.postDelayed(tickRunnable, 1000L)
    }

    private fun buildViews(context: Context, prefs: android.content.SharedPreferences): RemoteViews {
        val views = RemoteViews(context.packageName, layoutFor(prefs))
        render(context, views)
        // Tap opens the app (launch intent, MainActivity handles singleTop).
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (intent != null) {
            val pi = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_card, pi)
        }
        return views
    }

    private fun render(context: Context, views: RemoteViews) {
        val prefs = HomeWidgetPlugin.getData(context)
        val pending = prefs.getInt("pending", 0)
        val nextCheckMs = prefs.getLong("nextCheckMs", 0L)
        val latestTitle = prefs.getString("latestTitle", null)
        val lastUpdateMs = prefs.getLong("lastUpdateMs", 0L)
        val ringVisible = prefs.getBoolean("ringVisible", true)

        // --- countdown (ticks every second) ---
        val remainMs =
            if (nextCheckMs <= 0L) 0L else nextCheckMs - System.currentTimeMillis()
        val totalSecs = ((remainMs / 1000L).coerceAtLeast(0L)).toInt()
        val mm = (totalSecs / 60).coerceAtMost(99)
        val ss = totalSecs % 60

        if (ringVisible) {
            views.setTextViewText(
                R.id.widget_countdown,
                String.format("%02d:%02d", mm, ss)
            )
            // Ring drains as the countdown progresses, over the configured
            // interval (intervalSecs, default 900s = 15 min).
            val total = (prefs.getInt("intervalSecs", 900)).coerceAtLeast(60)
            views.setProgressBar(
                R.id.widget_ring, total,
                totalSecs.coerceAtMost(total), false
            )
        } else {
            // Ring-less layout: the countdown line carries the remaining time.
            views.setTextViewText(
                R.id.widget_countdown,
                String.format("next sync %02d:%02d", mm, ss)
            )
        }

        // --- pending count ---
        views.setTextViewText(
            R.id.widget_pending,
            if (pending == 1) "1 pending item" else "$pending pending items"
        )

        // --- latest message ---
        views.setTextViewText(
            R.id.widget_latest,
            latestTitle?.takeIf { it.isNotBlank() } ?: "no messages yet"
        )

        // --- real-time "updated Ns ago" ---
        views.setTextViewText(R.id.widget_updated, updatedAgoLabel(lastUpdateMs))
    }

    private fun updatedAgoLabel(lastUpdateMs: Long): String {
        if (lastUpdateMs <= 0L) return "waiting for first sync…"
        val agoSec = ((System.currentTimeMillis() - lastUpdateMs) / 1000L)
            .coerceAtLeast(0L)
        return when {
            agoSec < 5 -> "updated just now"
            agoSec < 60 -> "updated ${agoSec}s ago"
            agoSec < 3600 -> {
                val m = agoSec / 60
                "updated ${m}min ago"
            }
            else -> {
                val h = agoSec / 3600
                "updated ${h}h ago"
            }
        }
    }

    private fun pushUpdate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, SoftDayWidgetProvider::class.java))
        if (ids.isEmpty()) {
            // No widgets left: stop the ticker.
            tickHandler.removeCallbacksAndMessages(null)
            return
        }
        val prefs = HomeWidgetPlugin.getData(context)
        val views = RemoteViews(context.packageName, layoutFor(prefs))
        render(context, views)
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (intent != null) {
            val pi = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_card, pi)
        }
        mgr.updateAppWidget(ids, views)
    }

    companion object {
        private val tickHandler = Handler(Looper.getMainLooper())
        private var tickRunnable: Runnable = Runnable {}
    }
}
