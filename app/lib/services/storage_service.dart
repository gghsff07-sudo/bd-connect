import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'package:path_provider/path_provider.dart';
import '../models/monitor_item.dart';

/// WhatsApp-style local storage on SQLite.
///
/// Tables:
///   messages - all items, with WhatsApp-style tick state (local/queued/
///              sending/synced/failed) and updatedAt for sync conflict
///              resolution (last-write-wins).
///   outbox   - pending local edits that must be pushed to the cloud
///              (WhatsApp's "send queue": works offline, drains when online).
///   tombs    - tombstones for deleted items so the cloud learns about
///              deletions, and so a re-pull doesn't resurrect them.
///   meta     - key/value: last sync cursor, last poll, config values.
///
/// Everything is guarded: the app must never crash because storage failed.
class StorageService {
  StorageService._();
  static final StorageService _i = StorageService._();
  factory StorageService() => _i;

  Database? _db;
  static const _kSchema = 1;

  Future<Database> get db async {
    if (_db != null && _db!.isOpen) return _db!;
    try {
      final dir = await getApplicationDocumentsDirectory();
      final path = p.join(dir.path, 'dbmonitor.db');
      _db = await openDatabase(
        path,
        version: _kSchema,
        onCreate: (db, v) => _create(db),
      );
      return _db!;
    } catch (_) {
      // Fallback: in-memory DB so the app still works this session.
      _db = await openDatabase(
        inMemoryDatabasePath,
        version: _kSchema,
        onCreate: (db, v) => _create(db),
      );
      return _db!;
    }
  }

  Future<void> _create(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        seen INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        state TEXT NOT NULL DEFAULT 'synced'
      )
    ''');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(createdAt DESC)');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        op TEXT NOT NULL,             -- 'upsert' | 'delete'
        payload TEXT NOT NULL,        -- json of the item
        queuedAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS tombs (
        id TEXT PRIMARY KEY,
        deletedAt INTEGER NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    ''');
  }

  // ---------------- messages ----------------

  Future<List<MonitorItem>> loadItems({int limit = 500}) async {
    try {
      final d = await db;
      final rows = await d.query('messages',
          orderBy: 'createdAt DESC, id', limit: limit);
      return rows.map(_rowToItem).toList();
    } catch (_) {
      return [];
    }
  }

  Future<MonitorItem?> getItem(String id) async {
    try {
      final d = await db;
      final rows = await d
          .query('messages', where: 'id = ?', whereArgs: [id], limit: 1);
      return rows.isEmpty ? null : _rowToItem(rows.first);
    } catch (_) {
      return null;
    }
  }

  Future<int> pendingCount() async {
    try {
      final d = await db;
      final r = await d.rawQuery(
          'SELECT COUNT(*) c FROM messages WHERE done = 0');
      return Sqflite.firstIntValue(r) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// Insert-or-replace, keeping WhatsApp semantics: newer updatedAt wins.
  Future<void> upsertItem(MonitorItem item) async {
    try {
      final d = await db;
      await d.insert('messages', _itemToRow(item),
          conflictAlgorithm: ConflictAlgorithm.replace);
    } catch (_) {}
  }

  /// Merge a remotely-fetched item with the local copy (last-write-wins on
  /// updatedAt; local done/seen flags survive if the remote has no flags).
  Future<void> mergeRemoteItem(MonitorItem remote) async {
    final local = await getItem(remote.id);
    if (local == null) {
      // Was it deleted here? Then keep the tombstone (do not resurrect).
      if (await isTombstoned(remote.id)) return;
      await upsertItem(remote.copyWith(state: DeliveryState.synced));
      return;
    }
    if (!remote.updatedAt.isAfter(local.updatedAt)) return; // local newer
    await upsertItem(remote.copyWith(
      done: remote.done || local.done,
      seen: remote.seen || local.seen,
      state: DeliveryState.synced,
    ));
  }

  Future<void> setDone(String id, bool done) async {
    final item = await getItem(id);
    if (item == null) return;
    final updated = item.copyWith(
        done: done, seen: true, updatedAt: DateTime.now());
    await upsertItem(updated);
    await enqueue(updated, op: 'upsert'); // WhatsApp: local edit → outbox → cloud
  }

  Future<void> markSeen(String id) async {
    final item = await getItem(id);
    if (item == null || item.seen) return;
    await upsertItem(
        item.copyWith(seen: true, updatedAt: DateTime.now()));
    await enqueue(item.copyWith(seen: true, updatedAt: DateTime.now()),
        op: 'upsert');
  }

  Future<void> markAllDone() async {
    final items = await loadItems();
    for (final it in items.where((e) => !e.done)) {
      await setDone(it.id, true);
    }
  }

  /// WhatsApp-style delete: remove locally, tombstone + outbox for cloud.
  Future<void> deleteItem(String id) async {
    try {
      final d = await db;
      await d.delete('messages', where: 'id = ?', whereArgs: [id]);
      await d.insert('tombs',
          {'id': id, 'deletedAt': DateTime.now().millisecondsSinceEpoch},
          conflictAlgorithm: ConflictAlgorithm.replace);
      await d.insert('outbox', {
        'id': id,
        'op': 'delete',
        'payload': '',
        'queuedAt': DateTime.now().millisecondsSinceEpoch,
        'attempts': 0,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    } catch (_) {}
  }

  /// Insert a locally composed item (settings screen or future composer).
  Future<void> addLocalItem(MonitorItem item) async {
    final withState =
        item.state == DeliveryState.synced && item.source == 'local'
            ? item.copyWith(state: DeliveryState.queued)
            : item;
    await upsertItem(withState);
    await enqueue(withState, op: 'upsert');
  }

  /// All locally stored TECMIS notices (id + source columns only), used by
  /// the sync engine to reconcile cloud deletions. Returns null when the
  /// database cannot be read - callers must treat null as "unknown", never
  /// as "no notices", so a broken DB never wipes the cloud.
  Future<List<Map<String, Object?>>?> tecmisRows() async {
    try {
      final d = await db;
      return await d.query('messages',
          columns: const ['id', 'source'],
          where: "substr(id, 1, 7) = 'tecmis-'");
    } catch (_) {
      return null;
    }
  }

  // ---------------- outbox (send queue) ----------------

  Future<void> enqueue(MonitorItem item, {String op = 'upsert'}) async {
    try {
      final d = await db;
      await d.insert('outbox', {
        'id': item.id,
        'op': op,
        'payload': op == 'delete' ? '' : jsonEncode(item.toJson()),
        'queuedAt': DateTime.now().millisecondsSinceEpoch,
        'attempts': 0,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    } catch (_) {}
  }

  Future<List<Map<String, Object?>>> drainOutbox({int limit = 50}) async {
    try {
      final d = await db;
      return await d.query('outbox',
          orderBy: 'queuedAt', limit: limit);
    } catch (_) {
      return [];
    }
  }

  Future<void> outboxProcessed(String id) async {
    try {
      final d = await db;
      await d.delete('outbox', where: 'id = ?', whereArgs: [id]);
    } catch (_) {}
  }

  Future<void> outboxAttempted(String id, {int maxAttempts = 8}) async {
    try {
      final d = await db;
      final rows = await d
          .query('outbox', where: 'id = ?', whereArgs: [id], limit: 1);
      if (rows.isEmpty) return;
      final attempts = (rows.first['attempts'] as int? ?? 0) + 1;
      if (attempts >= maxAttempts) {
        await outboxProcessed(id); // give up, like WhatsApp's failed send
        final it = await getItem(id);
        if (it != null && it.source == 'local') {
          await upsertItem(it.copyWith(state: DeliveryState.failed));
        }
      } else {
        await d.update('outbox', {'attempts': attempts},
            where: 'id = ?', whereArgs: [id]);
      }
    } catch (_) {}
  }

  Future<int> outboxCount() async {
    try {
      final d = await db;
      final r = await d.rawQuery('SELECT COUNT(*) c FROM outbox');
      return Sqflite.firstIntValue(r) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// Mark items that are queued/sending as failed after a hard error.
  Future<void> failAllPending() async {
    try {
      final d = await db;
      await d.update('messages', {'state': DeliveryState.failed.name},
          where: "state IN ('queued','sending')");
      await d.delete('outbox');
    } catch (_) {}
  }

  // ---------------- tombstones ----------------

  Future<bool> isTombstoned(String id) async {
    try {
      final d = await db;
      final r = await d
          .query('tombs', where: 'id = ?', whereArgs: [id], limit: 1);
      return r.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<void> clearTombstone(String id) async {
    try {
      final d = await db;
      await d.delete('tombs', where: 'id = ?', whereArgs: [id]);
    } catch (_) {}
  }

  // ---------------- meta ----------------

  Future<String?> getMeta(String key) async {
    try {
      final d = await db;
      final r = await d
          .query('meta', where: 'key = ?', whereArgs: [key], limit: 1);
      return r.isEmpty ? null : r.first['value'] as String?;
    } catch (_) {
      return null;
    }
  }

  Future<void> setMeta(String key, String value) async {
    try {
      final d = await db;
      await d.insert('meta', {'key': key, 'value': value},
          conflictAlgorithm: ConflictAlgorithm.replace);
    } catch (_) {}
  }

  // ---------------- settings (kept in meta, SharedPreferences-free) ------

  Future<String> getApiUrl() async => await getMeta('api_url') ?? '';
  Future<void> setApiUrl(String v) async => await setMeta('api_url', v);

  Future<String> getFirebaseUrl() async =>
      await getMeta('firebase_url') ?? '';
  Future<void> setFirebaseUrl(String v) async =>
      await setMeta('firebase_url', v);

  Future<String> getFirebasePath() async =>
      await getMeta('firebase_path') ?? 'items';
  Future<void> setFirebasePath(String v) async =>
      await setMeta('firebase_path', v.isEmpty ? 'items' : v);

  /// Home-screen widget ring size: 's' | 'm' | 'l' | 'off' (default 's').
  /// 'off' hides the countdown ring entirely (text-only widget).
  Future<String> getWidgetSize() async =>
      await getMeta('widget_size') ?? 's';
  Future<void> setWidgetSize(String v) async =>
      await setMeta('widget_size', ['m', 'l', 'off'].contains(v) ? v : 's');

  /// Sync interval in minutes (5 | 15 | 30 | 60, default 15). Shorter
  /// intervals notice database changes sooner but use a bit more battery.
  static const validPollMinutes = [5, 15, 30, 60];
  Future<int> getPollMinutes() async =>
      int.tryParse(await getMeta('poll_minutes') ?? '') ??
      15;
  Future<void> setPollMinutes(int v) async =>
      await setMeta('poll_minutes', validPollMinutes.contains(v) ? '$v' : '15');

  /// The sync interval as a Duration, for timers and the widget countdown.
  Future<Duration> getPollInterval() async =>
      Duration(minutes: await getPollMinutes());

  /// Message bubble density: 'compact' | 'normal' | 'full'.
  Future<String> getBubbleDensity() async =>
      await getMeta('bubble_density') ?? 'normal';
  Future<void> setBubbleDensity(String v) async =>
      await setMeta('bubble_density',
          ['compact', 'normal', 'full'].contains(v) ? v : 'normal');

  /// 24-hour clock in bubbles and dividers (default true).
  Future<bool> getUse24Hour() async =>
      (await getMeta('use_24h') ?? '1') == '1';
  Future<void> setUse24Hour(bool v) async =>
      await setMeta('use_24h', v ? '1' : '0');

  /// Per-type notification switches. Stored as a comma list of ENABLED
  /// types ('' = all off, missing key = all on).
  static const notifyTypeKeys = [
    'alert', 'warning', 'info', 'success', 'tecmis'
  ];
  Future<Map<String, bool>> getNotifyTypes() async {
    final raw = await getMeta('notify_types');
    if (raw == null) {
      return {for (final k in notifyTypeKeys) k: true};
    }
    final enabled = raw.split(',').toSet();
    return {
      for (final k in notifyTypeKeys) k: enabled.contains(k),
    };
  }

  Future<void> setNotifyTypes(Map<String, bool> on) async {
    final enabled = notifyTypeKeys.where((k) => on[k] ?? true).toList();
    await setMeta('notify_types', enabled.join(','));
  }

  /// TECMIS cloud-cleanup sweep cadence: 'off' | 'daily' | 'weekly'.
  Future<String> getTecmisSweepMode() async =>
      await getMeta('tecmis_sweep') ?? 'daily';
  Future<void> setTecmisSweepMode(String v) async =>
      await setMeta('tecmis_sweep',
          ['off', 'daily', 'weekly'].contains(v) ? v : 'daily');

  Future<DateTime?> getLastPoll() async {
    final v = await getMeta('last_poll');
    return v == null ? null : DateTime.tryParse(v);
  }

  Future<void> setLastPoll(DateTime t) async =>
      await setMeta('last_poll', t.toIso8601String());

  Future<DateTime?> getLastSync() async {
    final v = await getMeta('last_sync');
    return v == null ? null : DateTime.tryParse(v);
  }

  Future<void> setLastSync(DateTime t) async =>
      await setMeta('last_sync', t.toIso8601String());

  // ---------------- storage management (WhatsApp style) ----------------

  /// Total size of the SQLite DB file in bytes.
  Future<int> dbSizeBytes() async {
    try {
      final d = await db;
      if (d.path == inMemoryDatabasePath) return 0;
      final f = File(d.path);
      return await f.exists() ? await f.length() : 0;
    } catch (_) {
      return 0;
    }
  }

  Future<int> messageCount() async {
    try {
      final d = await db;
      final r = await d.rawQuery('SELECT COUNT(*) c FROM messages');
      return Sqflite.firstIntValue(r) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// WhatsApp's "clear chat": remove messages but keep settings + tombstones.
  Future<void> clearAllMessages() async {
    try {
      final d = await db;
      await d.delete('messages');
      await d.delete('outbox');
    } catch (_) {}
  }

  /// WhatsApp's "free up space": drop messages older than [days], keep
  /// tombstones so the cloud still knows about old deletions.
  Future<int> trimOlderThan(int days) async {
    try {
      final d = await db;
      final cutoff =
          DateTime.now().subtract(Duration(days: days)).millisecondsSinceEpoch;
      return await d
          .delete('messages', where: 'createdAt < ?', whereArgs: [cutoff]);
    } catch (_) {
      return 0;
    }
  }

  // ---------------- row mapping ----------------

  Map<String, Object?> _itemToRow(MonitorItem it) => {
        'id': it.id,
        'title': it.title,
        'body': it.body,
        'type': it.type,
        'createdAt': it.createdAt.millisecondsSinceEpoch,
        'updatedAt': it.updatedAt.millisecondsSinceEpoch,
        'done': it.done ? 1 : 0,
        'seen': it.seen ? 1 : 0,
        'source': it.source,
        'state': it.state.name,
      };

  MonitorItem _rowToItem(Map<String, Object?> r) => MonitorItem(
        id: r['id']?.toString() ?? '',
        title: r['title']?.toString() ?? '(untitled)',
        body: r['body']?.toString() ?? '',
        type: r['type']?.toString() ?? 'info',
        createdAt: DateTime.fromMillisecondsSinceEpoch(
            (r['createdAt'] as int?) ?? 0),
        updatedAt:
            DateTime.fromMillisecondsSinceEpoch((r['updatedAt'] as int?) ?? 0),
        done: (r['done'] as int?) == 1,
        seen: (r['seen'] as int?) == 1,
        source: r['source']?.toString(),
        state: DeliveryState.fromName(r['state']?.toString()),
      );
}
