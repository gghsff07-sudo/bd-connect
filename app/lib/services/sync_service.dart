import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:workmanager/workmanager.dart';
import '../models/monitor_item.dart';
import 'cloud_client.dart';
import 'storage_service.dart';
import 'widget_service.dart';
import 'notification_service.dart';

/// Poll/sync cadence shared by the UI, the timers and the background worker.
const Duration kPollInterval = Duration(minutes: 15);

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      await SyncService().syncOnce(background: true);
      await WidgetService.updateWidget();
    } catch (e) {
      if (kDebugMode) print('bg task error: $e');
    }
    return true;
  });
}

/// WhatsApp-style sync engine.
///
/// 1. DRAIN OUTBOX: every local change (done/seen/delete/compose) sits in the
///    outbox table and is pushed to the cloud one by one. Failed pushes are
///    retried with the next cycle (attempt counter, max 8).
/// 2. PULL: fetch the remote collection, merge with last-write-wins on
///    updatedAt, honoring local tombstones so nothing deleted resurrects.
/// 3. NOTIFY: items that are new locally trigger a styled notification.
/// 4. WIDGET: always refreshed, with a fresh lastUpdateMs for the
///    "updated Ns ago" real-time label.
class SyncService {
  SyncService._();
  static final SyncService _i = SyncService._();
  factory SyncService() => _i;

  final StorageService _store = StorageService();
  final CloudClient _cloud = CloudClient();

  bool _busy = false;
  bool get isBusy => _busy;

  String lastError = '';
  int lastNewCount = 0;

  /// One full sync cycle. Safe to call concurrently (locks itself).
  Future<void> syncOnce({bool background = false}) async {
    if (_busy) return;
    _busy = true;
    try {
      await _drainOutbox();
      final pulled = await _pullAndMerge();
      lastError = pulled;
      if (pulled.isEmpty) {
        // Only sweep after a good pull: a failed pull means the local id
        // list may be stale, and a stale list must never drive deletions.
        await _maybeReconcileTecmis();
      }
      await _store.setLastSync(DateTime.now());
      await _store.setLastPoll(DateTime.now());
      DataBus().notify();
      await WidgetService.updateWidget();
    } catch (e) {
      lastError = 'sync error: $e';
    } finally {
      _busy = false;
    }
  }

  Future<void> _drainOutbox() async {
    final batch = await _store.drainOutbox(limit: 50);
    for (final op in batch) {
      final id = op['id']?.toString() ?? '';
      final kind = op['op']?.toString() ?? 'upsert';
      try {
        if (kind == 'delete') {
          final (ok, err) = await _cloud.pushDelete(id);
          if (ok) {
            await _store.outboxProcessed(id);
          } else {
            await _store.outboxAttempted(id);
          }
        } else {
          final item = await _store.getItem(id);
          if (item == null) {
            await _store.outboxProcessed(id); // gone locally, skip
            continue;
          }
          final (ok, err) = await _cloud.pushUpsert(item);
          if (ok) {
            // Confirm the item as fully synced (double tick equivalent).
            await _store.upsertItem(
                item.copyWith(state: DeliveryState.synced));
            await _store.outboxProcessed(id);
          } else {
            await _store.outboxAttempted(id);
          }
        }
      } catch (_) {
        await _store.outboxAttempted(id);
      }
    }
  }

  /// Returns an error string or '' when OK. Notifies for brand-new items.
  Future<String> _pullAndMerge() async {
    final (remote, err) = await _cloud.pull();
    if (err != null) return err;

    var newCount = 0;
    for (final r in remote) {
      final existed = await _store.getItem(r.id);
      if (existed == null &&
          !(await _store.isTombstoned(r.id)) &&
          r.source != null) {
        newCount++;
      }
      await _store.mergeRemoteItem(r);
    }
    lastNewCount = newCount;

    if (newCount > 0) {
      final items = await _store.loadItems(limit: newCount);
      for (final item in items.take(newCount)) {
        await NotificationService.notifyItem(item);
      }
    }
    return '';
  }

  /// How often the TECMIS reconcile sweep may run (per device).
  static const Duration _tecmisReconcileInterval = Duration(hours: 24);

  /// Best-effort cloud cleanup using the db-monitor-api's
  /// tecmis-delete-old endpoint: deletes every TECMIS notice in the cloud
  /// that this device no longer holds. This heals outbox deletes that
  /// gave up after 8 failed attempts - by then the local copy is already
  /// gone and tombstoned, so the per-item retry cannot fire anymore.
  ///
  /// Safety rules - a broken or empty local list must never wipe the cloud:
  ///  - runs at most once every 24 hours (meta key `tecmis_reconcile_at`);
  ///  - only called from [syncOnce] AFTER a successful pull;
  ///  - skipped entirely when the local TECMIS list is empty or unreadable,
  ///    so a fresh install or a cleared database deletes nothing.
  Future<void> _maybeReconcileTecmis() async {
    try {
      final last = await _store.getMeta('tecmis_reconcile_at');
      final lastMs = int.tryParse(last ?? '') ?? 0;
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      if (nowMs - lastMs < _tecmisReconcileInterval.inMilliseconds) return;
      final rows = await _store.tecmisRows();
      if (rows == null) return; // DB unreadable -> unknown state, do nothing
      final ids = rows
          .map((r) => r['id']?.toString() ?? '')
          .where((s) => s.isNotEmpty)
          .toList();
      if (ids.isEmpty) return; // an empty list would delete EVERYTHING: never
      final (deleted, err) = await _cloud.reconcileTecmis(ids);
      if (err != null) {
        if (kDebugMode) print('tecmis reconcile: $err');
        return; // do not stamp the clock: retry next cycle
      }
      await _store.setMeta('tecmis_reconcile_at', nowMs.toString());
      if (kDebugMode && deleted > 0) {
        print('tecmis reconcile: removed $deleted orphaned notice(s)');
      }
    } catch (_) {
      // Never let housekeeping break a sync cycle.
    }
  }
}

/// Registers the 15-minute background sync with WorkManager.
Future<void> registerPeriodicPoll() async {
  try {
    await Workmanager().initialize(callbackDispatcher);
    await Workmanager().cancelByUniqueName('db-monitor-poll');
    await Workmanager().registerPeriodicTask(
      'db-monitor-poll',
      'dbMonitorSync',
      frequency: kPollInterval, // 15 min = Android's minimum periodic interval
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingWorkPolicy.replace,
      backoffPolicy: BackoffPolicy.exponential,
    );
  } catch (_) {
    // WorkManager can fail on odd devices; in-app timer still runs.
  }
}

/// Background entry used by Workmanager AND a fast path for the app UI.
Future<void> pollAndNotify({bool background = false}) async {
  await SyncService().syncOnce(background: background);
}

/// Android 13+ runtime notification permission + config glue lives here so
/// MainActivity's widget click can also trigger a fresh sync.
Future<void> ensureNotificationPermission() async {
  try {
    await NotificationService.requestPermission();
  } catch (_) {}
}

/// Backwards-compatible import shim (dart:io used for Platform checks in
/// NotificationService).
final platformIsAndroid = Platform.isAndroid;
