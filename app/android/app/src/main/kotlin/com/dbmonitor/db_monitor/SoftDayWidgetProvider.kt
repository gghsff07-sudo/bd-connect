package com.dbmonitor.db_monitor

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetPlugin

/**
 * Soft Day themed home-screen widget.
 *
 * Reads values pushed by the Flutter side (WidgetService via home_widget)
 * from the "HomeWidgetPreferences" SharedPreferences:
 *   pending       - String count of not-done messages ("5")
 *   nextCheckMs   - String epoch ms of the next sync
 *   latestTitle   - String newest incomplete notice ("● title" or
 *                   "TECMIS · title")
 *   lastUpdateMs  - String wall clock of the last data change
 *   intervalSecs  - String sync interval seconds (default 900)
 *   widgetSize    - String s | m | l | off (layout variant)
 *   ringVisible   - Bool false when the ring is hidden
 *
 * Numeric values arrive as STRINGS: home_widget 0.6.0 cannot persist
 * Kotlin Long values (it throws for anything but Boolean/Float/String/
 * Double/Int), and epoch-ms ints cross the platform channel as Long.
 * They are parsed here with safe fallbacks.
 *
 * ## Refresh model (v2.8)
 *
 *  - While the app process lives, a 1s Handler tick re-renders attached
 *    widgets so the countdown and "updated ago" labels run in real time.
 *  - When the process is killed the ticker dies with it, so the provider
 *    ALSO schedules a periodic AlarmManager tick as a process-independent
 *    fallback (inexact + allow-while-idle; no exact-alarm permission
 *    needed). The alarm re-renders at a calmer 60s cadence and re-arms
 *    itself, keeping the widget truthful without the app running.
 *  - android:updatePeriodMillis (soft_day_widget_info.xml, 30 min) is the
 *    system's own backstop; it triggers onUpdate, which re-arms everything.
 *  - Every Flutter-side data change calls HomeWidget.updateWidget, which
 *    broadcasts ACTION_APPWIDGET_UPDATE straight to this provider.
 */
class SoftDayWidgetProvider : AppWidgetProvider() {

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
        scheduleAlarm(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        scheduleTick(context)
        scheduleAlarm(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        tickHandler.removeCallbacksAndMessages(null)
        cancelAlarm(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray?) {
        super.onDeleted(context, appWidgetIds)
        // Stop ticking when the last widget instance is gone.
        val mgr = AppWidgetManager.getInstance(context)
        val remaining =
            mgr.getAppWidgetIds(ComponentName(context, SoftDayWidgetProvider::class.java))
        if (remaining.isEmpty()) {
            tickHandler.removeCallbacksAndMessages(null)
            cancelAlarm(context)
        }
    }

    /**
     * AlarmManager fallback so the widget keeps refreshing (at a calmer
     * 60s cadence) even when the app process has been killed. Uses an
     * inexact, allow-while-idle alarm: no SCHEDULE_EXACT_ALARM permission
     * or user grant is required, and the system still batches it kindly.
     * Each alarm re-renders and re-arms itself; onDisabled/onDeleted cancel
     * it when the last widget goes away.
     */
    private fun scheduleAlarm(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pi = alarmPendingIntent(context)
        val at = System.currentTimeMillis() + ALARM_PERIOD_MS
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi)
            } else {
                am.setInexactRepeating(AlarmManager.RTC, at, ALARM_PERIOD_MS, pi)
            }
        } catch (_: SecurityException) {
            // Odd ROMs can refuse alarms; updatePeriodMillis still fires.
        }
    }

    private fun cancelAlarm(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        am.cancel(alarmPendingIntent(context))
    }

    private fun alarmPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, SoftDayWidgetProvider::class.java).apply {
            action = ACTION_ALARM_TICK
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags = flags or PendingIntent.FLAG_IMMUTABLE
        }
        return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags)
    }

    /**
     * Re-renders every attached widget each second while the app process
     * lives. Runs on the main looper (RemoteViews require it); one 1s
     * tick for all instances is cheap because we build the views once
     * per push, not per widget.
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
        launchPendingIntent(context)?.let {
            views.setOnClickPendingIntent(R.id.widget_card, it)
        }
        return views
    }

    /**
     * Tap opens the app. Uses the package launch intent (MainActivity is
     * the launcher activity, singleTop), like the v2.7 behaviour - no
     * custom action string to resolve, works on every launcher.
     */
    private fun launchPendingIntent(context: Context): PendingIntent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return null
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags = flags or PendingIntent.FLAG_IMMUTABLE
        }
        return PendingIntent.getActivity(context, LAUNCH_REQUEST_CODE, intent, flags)
    }

    private fun render(context: Context, views: RemoteViews) {
        val prefs = HomeWidgetPlugin.getData(context)
        // Numeric values are stored as Strings (see class doc); parse with
        // safe fallbacks so a missing/garbage value renders as "unknown",
        // never crashes the widget. prefString() also tolerates values
        // left as Int/Long by pre-v2.8 installs (v2.7 managed to save the
        // "pending" count as an Int before the epoch-ms save threw and
        // aborted the push) - SharedPreferences.getString would throw a
        // ClassCastException on those, so read through the type-agnostic
        // map instead.
        val pending = prefString(prefs, "pending")?.toIntOrNull() ?: -1
        val nextCheckMs = prefString(prefs, "nextCheckMs")?.toLongOrNull() ?: 0L
        val latestTitle = prefString(prefs, "latestTitle")
        val lastUpdateMs = prefString(prefs, "lastUpdateMs")?.toLongOrNull() ?: 0L
        val ringVisible = (prefs.all["ringVisible"] as? Boolean) ?: true

        // --- countdown (ticks while re-renders happen) ---
        val remainMs =
            if (nextCheckMs <= 0L) 0L else nextCheckMs - System.currentTimeMillis()
        val totalSecs = ((remainMs / 1000L).coerceAtLeast(0L)).toInt()
        val mm = (totalSecs / 60).coerceAtMost(99)
        val ss = totalSecs % 60

        if (ringVisible) {
            views.setTextViewText(
                R.id.widget_countdown,
                String.format(java.util.Locale.US, "%02d:%02d", mm, ss)
            )
            // Ring drains as the countdown progresses, over the configured
            // interval (intervalSecs, default 900s = 15 min).
            val total = (prefString(prefs, "intervalSecs")?.toIntOrNull() ?: 900)
                .coerceAtLeast(60)
            views.setProgressBar(
                R.id.widget_ring, total,
                totalSecs.coerceAtMost(total), false
            )
        } else {
            // Ring-less layout: the countdown line carries the remaining time.
            views.setTextViewText(
                R.id.widget_countdown,
                String.format(java.util.Locale.US, "next sync %02d:%02d", mm, ss)
            )
        }

        // --- pending count ---
        views.setTextViewText(
            R.id.widget_pending,
            when {
                pending < 0 -> "count unknown"
                pending == 1 -> "1 pending item"
                else -> "$pending pending items"
            }
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

    /** Read a pref as a String regardless of the stored type (Int/Long/
     *  String/Boolean); null when absent. Avoids ClassCastException on
     *  values written with a different type by an older app version. */
    private fun prefString(
        prefs: android.content.SharedPreferences,
        key: String
    ): String? = prefs.all[key]?.toString()

    /** Read a pref as a String via [prefString], used for layout choice. */
    private fun layoutFor(prefs: android.content.SharedPreferences): Int =
        when (prefString(prefs, "widgetSize")) {
            "m" -> R.layout.soft_day_widget_med
            "l" -> R.layout.soft_day_widget_big
            "off" -> R.layout.soft_day_widget_noring
            else -> R.layout.soft_day_widget
        }

    private fun pushUpdate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, SoftDayWidgetProvider::class.java))
        if (ids.isEmpty()) {
            // No widgets left: stop the ticker (alarm stops via onDeleted).
            tickHandler.removeCallbacksAndMessages(null)
            return
        }
        val prefs = HomeWidgetPlugin.getData(context)
        val views = RemoteViews(context.packageName, layoutFor(prefs))
        render(context, views)
        launchPendingIntent(context)?.let {
            views.setOnClickPendingIntent(R.id.widget_card, it)
        }
        mgr.updateAppWidget(ids, views)
    }

    companion object {
        private const val ACTION_ALARM_TICK =
            "com.dbmonitor.db_monitor.ACTION_WIDGET_ALARM_TICK"
        private const val ALARM_REQUEST_CODE = 4242
        private const val LAUNCH_REQUEST_CODE = 0

        /** Widget refresh cadence while the app process is dead. */
        private const val ALARM_PERIOD_MS = 60_000L

        private val tickHandler = Handler(Looper.getMainLooper())
        private var tickRunnable: Runnable = Runnable {}
    }

    /**
     * The alarm delivers a broadcast to this provider (the receiver is
     * exported=false but same-app PendingIntent delivery is allowed).
     * Route it through onUpdate so every instance re-renders and the
     * alarm re-arms itself.
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_ALARM_TICK) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(
                ComponentName(context, SoftDayWidgetProvider::class.java)
            )
            if (ids.isEmpty()) {
                cancelAlarm(context)
                return
            }
            onUpdate(context, mgr, ids)
        }
    }
}
