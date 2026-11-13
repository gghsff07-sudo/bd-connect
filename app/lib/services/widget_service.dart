import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:home_widget/home_widget.dart';
import 'storage_service.dart';

/// Bridges app state to the Android home-screen widget via home_widget.
///
/// The native SoftDayWidgetProvider reads these SharedPreferences keys and
/// re-renders itself every second (live countdown + last-updated label):
///   pending       - Int    not-done message count
///   nextCheckMs   - Long   epoch ms of the next 15-minute check
///   latestTitle   - String newest message title (with pending dot)
///   lastPollLabel - String "last: HH:mm" for the second line
///   lastUpdateMs  - Long   wall-clock of the last data change (widget shows
///                   this as "updated Xs ago", ticking in real time)
class WidgetService {
  static const _widgetName = 'DbMonitorWidget';

  /// Push the current state so the widget re-renders immediately.
  static Future<void> updateWidget() async {
    try {
      final s = StorageService();
      final items = await s.loadItems(limit: 1);
      final pending = await s.pendingCount();
      final lastPoll = await s.getLastPoll();

      final lastPollLabel = lastPoll == null
          ? 'never'
          : '${_two(lastPoll.hour)}:${_two(lastPoll.minute)}';

      // Next check timestamp (ms) so the widget computes its own countdown
      // and keeps ticking even when the Flutter engine is not running.
      final nextCheckMs = (lastPoll ?? DateTime.now())
          .add(const Duration(minutes: 15))
          .millisecondsSinceEpoch;

      final latest = items.isEmpty ? null : items.first;
      final latestTitle = latest == null
          ? 'No messages yet'
          : (latest.done
              ? latest.title
              : '● ${latest.title}'); // pending dot, WhatsApp-style

      await HomeWidget.saveWidgetData('pending', pending);
      await HomeWidget.saveWidgetData('nextCheckMs', nextCheckMs);
      await HomeWidget.saveWidgetData('latestTitle', latestTitle);
      await HomeWidget.saveWidgetData('lastPollLabel', lastPollLabel);
      await HomeWidget.saveWidgetData(
          'lastUpdateMs', DateTime.now().millisecondsSinceEpoch);
      await HomeWidget.updateWidget(androidName: _widgetName);
    } catch (_) {
      // Widget is optional polish - never let it break the app.
    }
  }

  static String _two(int n) => n.toString().padLeft(2, '0');
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
    if (!kReleaseMode) {
      // no-op in release; debug prints are noise
    }
    _ctrl.add(null);
  }

  void dispose() => _ctrl.close();
}
