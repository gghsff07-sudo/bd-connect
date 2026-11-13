# Keep plugin entry points for R8 (workmanager dispatcher, home_widget
# receiver, notification receivers are kept via manifest rules; these cover
# the Flutter callback paths).
-keep class com.dbmonitor.db_monitor.** { *; }
