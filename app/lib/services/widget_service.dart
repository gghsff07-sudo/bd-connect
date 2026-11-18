import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:home_widget/home_widget.dart';
import '../models/monitor_item.dart';
import 'storage_service.dart';

/// Bridges app state to the Android home-screen widget via home_widget.
///
/// The native SoftDayWidgetProvider reads these SharedPreferences keys
/// (HomeWidgetPlugin.getData -> "HomeWidgetPreferences") and re-renders on
/// every update push:
///   pending       - String not-done message count (see note below!)
///   nextCheckMs   - String epoch ms of the next sync ("" = unknown)
///   latestTitle   - String newest incomplete notice title (with dot /
///                   TECMIS label)
///   lastUpdateMs  - String wall-clock of the last data change (widget
///                   shows "updated Xs ago" ticking in real time)
///   intervalSecs  - String sync interval in seconds
///   widgetSize    - String 's' | 'm' | 'l' ring size, 'off' hides ring
///   ringVisible   - Bool   false when the countdown ring is hidden
///
/// ## Why the epoch/count values are saved as STRINGS (v2.8 root cause)
///
/// home_widget 0.6.0's Android `saveWidgetData` only handles Boolean /
/// Float / String / Double / Int. Epoch-millisecond values (and any Dart
/// int the platform channel maps to a Kotlin `Long`) hit the `else`
/// branch, which throws a PlatformException. In v2.7 that exception
/// aborted the whole push mid-way - the later keys were never written and
/// `HomeWidget.updateWidget` was never called - so the widget only ever
/// showed layout defaults and refreshed via its own in-app 1s ticker.
/// Saving numeric values as Strings (and letting the Kotlin side parse
/// them) sidesteps the limitation without forking the plugin. Each save
/// is also individually guarded so one bad key can never abort the rest.
///
/// NOTE: androidName must be the BARE class name of the provider
/// (home_widget prepends the package id). It is `SoftDayWidgetProvider`,
/// matching the <receiver android:name=".SoftDayWidgetProvider"> in the
/// manifest.
class WidgetService {
  static const _widgetName = 'SoftDayWidgetProvider';

  /// Push the current state so the widget re-renders immediately.
  static Future<void> updateWidget() async {
    try {
      final s = StorageService();
      // Main list = incomplete notices only (completed ones live in the
      // archive), so the widget surfaces what still needs attention.
      // byEffectiveDate: the "latest" notice must be the newest by its
      // ORIGINAL posted date (TECMIS notices), not by sync arrival.
      // Note the generous limit: loadItems applies `limit` in SQL by
      // createdAt BEFORE re-sorting in Dart, so a small limit would miss
      // the truly-newest posted notice when an old notice was re-synced
      // recently (fresh createdAt, old postedAt).
      final items =
          await s.loadItems(limit: 200, done: false, byEffectiveDate: true);
      final pending = await s.pendingCount();
      final lastPoll = await getLastPollForWidget(s);
      final widgetSize = await s.getWidgetSize();
      final interval = await s.getPollInterval();

      final nextCheckMs =
          (lastPoll ?? DateTime.now()).add(interval).millisecondsSinceEpoch;

      final latest = items.isEmpty ? null : items.first;
      final latestTitle = latest == null ? '' : _latestLabel(latest);

      await _save('pending', pending.toString());
      await _save('nextCheckMs', nextCheckMs.toString());
      await _save('latestTitle', latestTitle);
      await _save('lastUpdateMs',
          DateTime.now().millisecondsSinceEpoch.toString());
      await _save('intervalSecs', interval.inSeconds.toString());
      // Layout variant (s/m/l/off) the native provider picks per render.
      await _save('widgetSize', widgetSize);
      await _save('ringVisible', widgetSize != 'off');
      await HomeWidget.updateWidget(androidName: _widgetName);
    } catch (e) {
      // Widget is optional polish - never let it break the app.
      if (kDebugMode) print('widget update skipped: $e');
    }
  }

  /// Save one key without letting a failure abort the remaining pushes
  /// (the exact v2.7 failure mode: one bad save killed the whole update).
  static Future<void> _save(String key, Object? value) async {
    try {
      await HomeWidget.saveWidgetData(key, value);
    } catch (e) {
      if (kDebugMode) print('widget save $key failed: $e');
    }
  }

  /// "● title" for a normal pending notice; TECMIS notices keep their
  /// brand visible on the widget ("TECMIS · title") so university notices
  /// are recognisable at a glance, matching the in-app list treatment.
  static String _latestLabel(MonitorItem item) {
    final isTecmis = item.type == 'tecmis' || item.id.startsWith('tecmis-');
    return isTecmis ? 'TECMIS · ${item.title}' : '● ${item.title}';
  }

  /// The Kotlin provider renders "waiting for first sync…" when there is
  /// no last-poll value; we only need a non-null clock base.
  static Future<DateTime?> getLastPollForWidget(StorageService s) async {
    try {
      return await s.getLastPoll();
    } catch (_) {
      return null;
    }
  }
}

/// Streams data-change events so the UI can rebuild in real time without
/// polling the database on a timer.
class DataBus {
  DataBus._();
  static final DataBus _i = DataBus._();
  factory DataBus() => _i;

  final _ctrl = StreamController<void>.broadcast();
  Stream<void> get changes => _ctrl.stream;

  void notify() {
    if (!kDebugMode) {
      // no-op in release; debug prints are noise
    }
    _ctrl.add(null);
  }

  void dispose() => _ctrl.close();
}
