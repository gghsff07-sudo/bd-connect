import 'dart:async';
import 'package:flutter/material.dart';
import 'package:home_widget/home_widget.dart';
import 'package:intl/intl.dart';
import 'config/app_config.dart';
import 'config/theme.dart';
import 'models/monitor_item.dart';
import 'services/notification_service.dart';
import 'services/storage_service.dart';
import 'services/sync_service.dart';
import 'services/widget_service.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/markdown_body_view.dart';
import 'widgets/notification_permission_card.dart';
import 'widgets/sync_ticks.dart';
import 'widgets/update_dialog.dart';

void main() {
  // Crash-proof entry: every init is guarded - worst case is an empty list.
  runApp(const DbMonitorApp());
}

class DbMonitorApp extends StatelessWidget {
  const DbMonitorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DB Monitor',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.accent,
          surface: AppColors.card,
        ),
        scaffoldBackgroundColor: AppColors.bg,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  List<MonitorItem> _items = [];
  String? _lastError;
  DateTime? _lastPoll;
  int _pendingCount = 0;
  Timer? _timer;
  bool _syncing = false;
  bool _hasCloud = false;
  bool _notifGranted = true;
  StreamSubscription? _busSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Refresh when coming back to the app (e.g. after tapping the widget).
    if (state == AppLifecycleState.resumed) {
      _reload();
      _sync(silent: true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _busSub?.cancel();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      await NotificationService.init();
    } catch (_) {}
    try {
      final granted = await NotificationService.requestPermission();
      if (mounted) setState(() => _notifGranted = granted);
    } catch (_) {}
    try {
      await registerPeriodicPoll();
    } catch (_) {}
    try {
      await HomeWidget.setAppGroupId('com.dbmonitor.db_monitor');
    } catch (_) {}
    await _reload();
    _startInAppTimer();
    // React to background syncs so the UI is real-time.
    _busSub = DataBus().changes.listen((_) => _reload());
    await _sync(silent: true);
  }

  Future<void> _reload() async {
    try {
      final s = StorageService();
      final items = await s.loadItems();
      final last = await s.getLastPoll();
      final pending = await s.pendingCount();
      final granted = await NotificationService.isPermissionGranted();
      final api = await s.getApiUrl();
      final fb = await s.getFirebaseUrl();
      if (mounted) {
        setState(() {
          _items = items;
          _lastPoll = last;
          _pendingCount = pending;
          _notifGranted = granted;
          _hasCloud = api.isNotEmpty ||
              fb.isNotEmpty ||
              AppConfig.hasApiConfig ||
              AppConfig.hasFirebaseConfig;
        });
      }
    } catch (_) {}
  }

  void _startInAppTimer() {
    _timer?.cancel();
    // Foreground fallback sync, every 15 minutes.
    _timer = Timer.periodic(kPollInterval, (_) => _sync());
  }

  Future<void> _sync({bool silent = false}) async {
    if (_syncing) return;
    if (!silent) setState(() => _syncing = true);
    try {
      await SyncService().syncOnce();
      if (!mounted) return;
      final err = SyncService().lastError;
      setState(() {
        _lastError = err.isEmpty ? null : err;
        _syncing = false;
      });
      await _reload();
    } catch (_) {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _toggleDone(MonitorItem item) async {
    await StorageService().setDone(item.id, !item.done);
    await WidgetService.updateWidget();
    await _reload();
  }

  Future<void> _delete(MonitorItem item) async {
    // WhatsApp-style: local delete + tombstone so the cloud learns too.
    await StorageService().deleteItem(item.id);
    await WidgetService.updateWidget();
    await _reload();
  }

  void _openDetail(MonitorItem item) {
    StorageService().markSeen(item.id);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => DetailScreen(
        itemId: item.id,
        onToggleDone: () => _toggleDone(item),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final missing = AppConfig.missingKeys;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RichText(
              text: const TextSpan(
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5),
                children: [
                  TextSpan(
                      text: 'DB ',
                      style: TextStyle(color: AppColors.heading)),
                  TextSpan(
                      text: 'MONITOR',
                      style: TextStyle(color: AppColors.accent)),
                ],
              ),
            ),
            Text(
              _syncing ? 'syncing…' : 'synced \u2022 every 15 min',
              style: const TextStyle(
                  fontSize: 11, letterSpacing: 1.2, color: AppColors.muted),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: _syncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.accent))
                : const Icon(Icons.sync, color: AppColors.heading),
            onPressed: _syncing ? null : () => _sync(),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: AppColors.heading),
            onPressed: () async {
              await Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SettingsScreen()));
              await _reload();
              await _sync(silent: true);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          if (!_notifGranted)
            NotificationPermissionCard(
              granted: _notifGranted,
              onRequest: () async {
                final granted =
                    await NotificationService.requestPermission();
                setState(() => _notifGranted = granted);
              },
            ),
          if (!_hasCloud || missing.isNotEmpty) _buildNoticeBanner(missing),
          if (_lastError != null) _buildErrorBanner(_lastError!),
          _buildCountdownCard(),
          Expanded(child: _buildChatList()),
        ],
      ),
      floatingActionButton: _items.isEmpty
          ? null
          : FloatingActionButton.extended(
              backgroundColor: AppColors.accent,
              foregroundColor: AppColors.onAccent,
              elevation: 0,
              icon: const Icon(Icons.done_all),
              label: const Text('Mark all done'),
              onPressed: () async {
                await StorageService().markAllDone();
                await WidgetService.updateWidget();
                await _reload();
              },
            ),
    );
  }

  Widget _buildCountdownCard() {
    return SoftCard(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          CountdownRing(
            lastPoll: _lastPoll,
            onElapsed: () => _sync(),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'NEXT SYNC IN',
                  style: TextStyle(
                      fontSize: 10.5,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w600,
                      color: AppColors.muted),
                ),
                const SizedBox(height: 2),
                Text(
                  _syncing ? 'Syncing now…' : 'Auto-sync countdown',
                  style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.heading),
                ),
                const SizedBox(height: 2),
                Text(
                  '$_pendingCount pending \u2022 '
                  '${_lastPoll == null ? 'not synced yet' : 'last: ${DateFormat('HH:mm').format(_lastPoll!)}'}',
                  style:
                      const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoticeBanner(List<String> missing) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined,
              size: 19, color: AppColors.accentDark),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Local mode: no cloud configured. Messages are stored on this '
              'device and sync once you add a REST API or Firebase URL in '
              'Settings \u2192 Cloud sync.',
              style: const TextStyle(
                  fontSize: 12.5, color: AppColors.accentDark, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBanner(String msg) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF6E3DF),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off, size: 18, color: AppColors.alert),
          const SizedBox(width: 8),
          Expanded(
            child: Text(msg,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.alert, height: 1.3)),
          ),
        ],
      ),
    );
  }

  /// WhatsApp-style chat list: newest at the bottom, grouped by day with
  /// soft dividers, right-aligned bubbles with tick + time.
  Widget _buildChatList() {
    if (_items.isEmpty) return _buildEmptyState();
    final oldestFirst = _items.reversed.toList();
    return StreamBuilder<void>(
      stream: DataBus().changes,
      builder: (context, _) => ListView.builder(
        padding: const EdgeInsets.only(bottom: 90, top: 4),
        itemCount: oldestFirst.length,
        itemBuilder: (context, i) {
          final item = oldestFirst[i];
          final showDay = i == 0 ||
              !_sameDay(oldestFirst[i - 1].createdAt, item.createdAt);
          return Column(
            children: [
              if (showDay) _dayDivider(item.createdAt),
              _Bubble(
                item: item,
                onTap: () => _openDetail(item),
                onToggleDone: () => _toggleDone(item),
                onDelete: () => _delete(item),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _dayDivider(DateTime t) {
    final label = _sameDay(t, DateTime.now())
        ? 'TODAY'
        : DateFormat('dd MMM yyyy').format(t).toUpperCase();
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 60),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
              color: Color(0x1E96826E), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: const TextStyle(
            fontSize: 10.5,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w700,
            color: AppColors.muted),
      ),
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: const BoxDecoration(
                color: AppColors.card, shape: BoxShape.circle),
            child: Icon(Icons.mark_chat_unread_outlined,
                size: 46, color: AppColors.accent),
          ),
          const SizedBox(height: 16),
          const Text('No messages yet',
              style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.heading)),
          const SizedBox(height: 6),
          SizedBox(
            width: 280,
            child: Text(
              _hasCloud
                  ? 'The database is synced every 15 minutes.\nNew messages will appear here as chat bubbles.'
                  : 'Local mode: everything is stored on this device.\n'
                    'Add a cloud (Firebase or REST API) in Settings \u2192 Cloud sync.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 13, color: AppColors.muted, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}

/// One WhatsApp-style message bubble (right-aligned, incoming tint).
class _Bubble extends StatelessWidget {
  final MonitorItem item;
  final VoidCallback onTap;
  final VoidCallback onToggleDone;
  final VoidCallback onDelete;

  const _Bubble({
    required this.item,
    required this.onTap,
    required this.onToggleDone,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final color = AppColors.typeColor(item.type);
    return Align(
      alignment: Alignment.centerRight,
      child: GestureDetector(
        onLongPress: () => _showActions(context),
        child: Container(
          margin: const EdgeInsets.fromLTRB(60, 3, 16, 3),
          padding: const EdgeInsets.fromLTRB(12, 9, 10, 7),
          decoration: BoxDecoration(
            color: item.done ? AppColors.card : AppColors.chatMe,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(18),
              topRight: Radius.circular(18),
              bottomLeft: Radius.circular(18),
              bottomRight: Radius.circular(4),
            ),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x1E96826E),
                  blurRadius: 8,
                  offset: Offset(0, 2)),
            ],
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_typeIcon(item.type), size: 15, color: color),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        item.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: item.seen || item.done
                              ? FontWeight.w600
                              : FontWeight.w700,
                          color: item.done ? AppColors.muted : AppColors.heading,
                        ),
                      ),
                    ),
                  ],
                ),
                if (item.body.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 250),
                    child: item.hasMarkdown
                        ? _PlainPreview(item.body)
                        : Text(
                            item.body,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 13,
                                height: 1.4,
                                color: item.done
                                    ? AppColors.disabled
                                    : AppColors.muted),
                          ),
                  ),
                ],
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (item.done)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.success.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text('DONE',
                            style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.success)),
                      ),
                    if (item.done) const SizedBox(width: 6),
                    Text(
                      DateFormat('HH:mm').format(item.createdAt),
                      style: const TextStyle(
                          fontSize: 10.5, color: AppColors.muted),
                    ),
                    const SizedBox(width: 4),
                    SyncTicks(state: item.state.name, color: AppColors.muted),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showActions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 6),
            ListTile(
              leading: Icon(item.done ? Icons.undo : Icons.check_circle,
                  color: AppColors.accent),
              title: Text(item.done ? 'Mark as undone' : 'Mark as done',
                  style: const TextStyle(color: AppColors.heading)),
              onTap: () {
                Navigator.pop(ctx);
                onToggleDone();
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: AppColors.alert),
              title: const Text('Delete everywhere',
                  style: TextStyle(color: AppColors.heading)),
              subtitle: const Text('Removes it locally and from the cloud',
                  style: TextStyle(fontSize: 12, color: AppColors.muted)),
              onTap: () {
                Navigator.pop(ctx);
                onDelete();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// One-line markdown preview inside the bubble (taps open the full render).
class _PlainPreview extends StatelessWidget {
  final String md;
  const _PlainPreview(this.md);

  @override
  Widget build(BuildContext context) {
    // Simple strip so bubbles stay readable; full render in the detail view.
    var t = md;
    t = t.replaceAll(RegExp(r'!\[([^\]]*)\]\([^)]*\)'), r'[🖼 $1]');
    t = t.replaceAll(RegExp(r'\[video\]\(([^)]*)\)'), '[🎬 video]');
    t = t.replaceAll(RegExp(r'\[([^\]]*)\]\(([^)]*)\)'), r'$1');
    t = t.replaceAll(RegExp(r'^#{1,6}\s*', multiLine: true), '');
    t = t.replaceAll('**', '').replaceAll('__', '');
    t = t.replaceAll('`', '');
    return Text(
      t.trim(),
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.muted),
    );
  }
}

IconData _typeIcon(String type) {
  switch (type) {
    case 'alert':
      return Icons.error_outline;
    case 'warning':
      return Icons.warning_amber_rounded;
    case 'success':
      return Icons.check_circle_outline;
    default:
      return Icons.info_outline;
  }
}

/// Detail screen: full Markdown render (headings, lists, code, links,
/// images, inline video) inside a big chat-style bubble.
class DetailScreen extends StatefulWidget {
  final String itemId;
  final VoidCallback onToggleDone;

  const DetailScreen(
      {super.key, required this.itemId, required this.onToggleDone});

  @override
  State<DetailScreen> createState() => _DetailScreenState();
}

class _DetailScreenState extends State<DetailScreen> {
  MonitorItem? _item;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final item = await StorageService().getItem(widget.itemId);
    if (mounted) setState(() => _item = item);
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    if (item == null) {
      return const Scaffold(
          backgroundColor: AppColors.bg,
          body: Center(child: CircularProgressIndicator()));
    }
    final color = AppColors.typeColor(item.type);
    final s = StorageService();
    String? cloudBase;
    final f = s.getFirebaseUrl();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: const BackButton(color: AppColors.heading),
        title: Row(
          children: [
            CircleAvatar(
              radius: 17,
              backgroundColor: color.withOpacity(0.16),
              child: Icon(_typeIcon(item.type), color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.heading)),
                  Row(
                    children: [
                      Text(
                          '${item.type.toUpperCase()} \u2022 ${DateFormat('dd MMM, HH:mm').format(item.createdAt)}',
                          style: const TextStyle(
                              fontSize: 11.5, color: AppColors.muted)),
                      const SizedBox(width: 6),
                      SyncTicks(
                          state: item.state.name, color: AppColors.muted),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: FutureBuilder<String?>(
        future: f,
        builder: (context, snap) {
          cloudBase = snap.data;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Full-width message card (not right-oriented)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: const [
                    BoxShadow(
                        color: Color(0x2E96826E),
                        blurRadius: 18,
                        offset: Offset(0, 6)),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    MarkdownBodyView(
                        body: item.body.isEmpty
                            ? '*(no details in this message)*'
                            : item.body,
                        baseUrl: (cloudBase ?? '').isEmpty ? null : cloudBase,
                        selectable: true,
                      ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            DateFormat('dd MMM yyyy, HH:mm')
                                .format(item.createdAt),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.muted),
                          ),
                          const SizedBox(width: 5),
                          SyncTicks(
                              state: item.state.name,
                              color: AppColors.muted),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Metadata card
              SoftCard(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('DETAILS',
                        style: TextStyle(
                            fontSize: 10.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted)),
                    const SizedBox(height: 8),
                    _metaRow('Type', item.type.toUpperCase(),
                        icon: _typeIcon(item.type), color: color),
                    _metaRow('ID', item.id),
                    _metaRow('Source', item.source ?? 'remote'),
                    _metaRow('Received',
                        DateFormat('dd MMM yyyy, HH:mm').format(item.createdAt)),
                    _metaRow('Status', item.done ? 'Done' : 'Pending',
                        icon: item.done
                            ? Icons.check_circle
                            : Icons.schedule,
                        color: item.done
                            ? AppColors.success
                            : AppColors.warning),
                    _metaRow(
                        'Sync state', _stateLabel(item.state.name)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: item.done ? AppColors.trackOff : AppColors.accent,
        foregroundColor:
            item.done ? AppColors.heading : AppColors.onAccent,
        elevation: 0,
        icon: Icon(item.done ? Icons.undo : Icons.check),
        label: Text(item.done ? 'Mark as undone' : 'Mark as done'),
        onPressed: () {
          widget.onToggleDone();
          Navigator.of(context).pop();
        },
      ),
    );
  }

  String _stateLabel(String state) {
    switch (state) {
      case 'local':
        return 'Local (not queued)';
      case 'queued':
        return 'Queued for cloud';
      case 'sending':
        return 'Uploading';
      case 'failed':
        return 'Failed after retries';
      default:
        return 'Synced with cloud';
    }
  }

  Widget _metaRow(String label, String value, {IconData? icon, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label,
                style:
                    const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ),
          if (icon != null) ...[
            Icon(icon, size: 15, color: color ?? AppColors.muted),
            const SizedBox(width: 5),
          ],
          Expanded(
            child: Text(value,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: color ?? AppColors.body)),
          ),
        ],
      ),
    );
  }
}

/// Settings screen: cloud sync config, notifications, widget help, and
/// WhatsApp-style storage management (usage, clear, trim).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _apiUrl = TextEditingController();
  final _fbUrl = TextEditingController();
  final _fbPath = TextEditingController();
  DateTime? _lastSync;
  int _outbox = 0;
  int _messages = 0;
  int _dbBytes = 0;
  bool _notifGranted = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = StorageService();
    _apiUrl.text = await s.getApiUrl();
    _fbUrl.text = await s.getFirebaseUrl();
    _fbPath.text = await s.getFirebasePath();
    _lastSync = await s.getLastSync();
    _outbox = await s.outboxCount();
    _messages = await s.messageCount();
    _dbBytes = await s.dbSizeBytes();
    _notifGranted = await NotificationService.isPermissionGranted();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _apiUrl.dispose();
    _fbUrl.dispose();
    _fbPath.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final s = StorageService();
    await s.setApiUrl(_apiUrl.text.trim());
    await s.setFirebaseUrl(_fbUrl.text.trim());
    await s.setFirebasePath(_fbPath.text.trim());
    await registerPeriodicPoll(); // re-register with new config
    await SyncService().syncOnce();
    await WidgetService.updateWidget();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.accent,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        content: const Text(
            'Saved. Cloud sync runs every 15 minutes.',
            style: TextStyle(color: AppColors.onAccent)),
      ));
      Navigator.of(context).pop();
    }
  }

  String _fmtBytes(int b) {
    if (b < 1024) return '$b B';
    if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
    return '${(b / 1024 / 1024).toStringAsFixed(1)} MB';
  }

  Future<void> _confirm(
      String title, String msg, Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Text(title,
            style: const TextStyle(
                color: AppColors.heading, fontWeight: FontWeight.w700)),
        content: Text(msg,
            style:
                const TextStyle(color: AppColors.body, height: 1.4)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel',
                style: TextStyle(color: AppColors.muted)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.accent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await action();
      await WidgetService.updateWidget();
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Settings',
            style: TextStyle(
                color: AppColors.heading,
                fontSize: 18,
                fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // --- Storage management (WhatsApp style) ---
          SoftCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.storage_outlined,
                        size: 18, color: AppColors.accent),
                    SizedBox(width: 8),
                    Text('STORAGE AND DATA',
                        style: TextStyle(
                            fontSize: 10.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted)),
                  ],
                ),
                const SizedBox(height: 10),
                _storageRow('Messages stored', '$_messages'),
                _storageRow('Pending uploads', '$_outbox'),
                _storageRow('Database size', _fmtBytes(_dbBytes)),
                _storageRow(
                    'Last sync',
                    _lastSync == null
                        ? 'never'
                        : DateFormat('dd MMM, HH:mm').format(_lastSync!)),
                const Divider(color: AppColors.trackOff, height: 24),
                SizedBox(
                  height: 40,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.accentDark,
                      side: const BorderSide(color: AppColors.accent),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20)),
                    ),
                    onPressed: () => _confirm(
                      'Trim old messages?',
                      'Messages older than 30 days will be removed from this '
                      'device. Cloud copies stay; deletions still sync.',
                      () async {
                        await StorageService().trimOlderThan(30);
                      },
                    ),
                    icon: const Icon(Icons.cleaning_services_outlined,
                        size: 17),
                    label: const Text('Free up space (30+ days)',
                        style: TextStyle(fontSize: 13)),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 40,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.alert,
                      side: const BorderSide(color: AppColors.alert),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20)),
                    ),
                    onPressed: () => _confirm(
                      'Clear all messages?',
                      'All messages will be removed from this device. '
                      'They may return if the cloud still holds them.',
                      () async {
                        await StorageService().clearAllMessages();
                      },
                    ),
                    icon: const Icon(Icons.delete_sweep_outlined, size: 17),
                    label: const Text('Clear all messages',
                        style: TextStyle(fontSize: 13)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // --- Notifications ---
          SoftCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.notifications_active_outlined,
                        size: 18, color: AppColors.accent),
                    SizedBox(width: 8),
                    Text('NOTIFICATIONS',
                        style: TextStyle(
                            fontSize: 10.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted)),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              _notifGranted
                                  ? 'Permission granted'
                                  : 'Permission needed',
                              style: const TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.heading)),
                          const SizedBox(height: 2),
                          const Text(
                            'Alerts ring and vibrate, warnings play a sound, '
                            'info and success are silent.',
                            style: TextStyle(
                                fontSize: 12.5,
                                color: AppColors.muted,
                                height: 1.4),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    _notifGranted
                        ? const Icon(Icons.check_circle,
                            color: AppColors.success, size: 24)
                        : SizedBox(
                            height: 36,
                            child: FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.accent,
                                foregroundColor: AppColors.onAccent,
                                shape: RoundedRectangleBorder(
                                    borderRadius:
                                        BorderRadius.circular(18)),
                              ),
                              onPressed: () async {
                                final g = await NotificationService
                                    .requestPermission();
                                setState(() => _notifGranted = g);
                              },
                              child: const Text('Allow',
                                  style: TextStyle(fontSize: 13)),
                            ),
                          ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // --- App updates (GitHub releases) ---
          SoftCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.system_update_alt,
                        size: 18, color: AppColors.accent),
                    SizedBox(width: 8),
                    Text('APP UPDATES',
                        style: TextStyle(
                            fontSize: 10.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted)),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            'Check for new versions',
                            style: TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.heading),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Updates are delivered from the project\'s GitHub '
                            'releases. The app downloads the APK and the '
                            'system installer finishes the job.',
                            style: TextStyle(
                                fontSize: 12.5,
                                color: AppColors.muted,
                                height: 1.4),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      height: 36,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.accent,
                          foregroundColor: AppColors.onAccent,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18)),
                        ),
                        onPressed: () => showUpdateDialog(context),
                        child: const Text('Check',
                            style: TextStyle(fontSize: 13)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // --- Widget help ---
          SoftCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.widgets_outlined,
                        size: 18, color: AppColors.accent),
                    SizedBox(width: 8),
                    Text('HOME-SCREEN WIDGET',
                        style: TextStyle(
                            fontSize: 10.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted)),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Add the DB Monitor widget: long-press an empty home-screen '
                  'area \u2192 Widgets \u2192 DB Monitor. It updates in real '
                  'time: a ticking countdown to the next sync, "updated Ns '
                  'ago" for the last data change, pending count and the '
                  'latest message.',
                  style: TextStyle(
                      fontSize: 13, color: AppColors.body, height: 1.45),
                ),
                const Divider(color: AppColors.trackOff, height: 26),
                // --- Widget countdown ring size ---
                Row(
                  children: const [
                    Icon(Icons.donut_small_outlined,
                        size: 16, color: AppColors.accent),
                    SizedBox(width: 8),
                    Text('COUNTDOWN RING SIZE',
                        style: TextStyle(
                            fontSize: 10.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted)),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'The countdown ring sits on the right side of the widget. '
                  'Pick a comfortable size; the widget refreshes instantly.',
                  style: TextStyle(
                      fontSize: 12.5, color: AppColors.muted, height: 1.4),
                ),
                const SizedBox(height: 10),
                _WidgetSizePicker(),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // --- Cloud sync config ---
          SoftCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('CLOUD SYNC',
                    style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 1.6,
                        fontWeight: FontWeight.w600,
                        color: AppColors.muted)),
                const SizedBox(height: 8),
                const Text(
                  'Optional. Without a cloud the app works fully offline '
                  '(local mode). With a cloud, messages sync every 15 '
                  'minutes: local changes upload first, then remote changes '
                  'merge in (newest wins).',
                  style: TextStyle(
                      fontSize: 13, color: AppColors.body, height: 1.45),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _apiUrl,
                  keyboardType: TextInputType.url,
                  decoration: _inputDec(
                      'REST API URL (returns JSON list)',
                      'https://example.com/api/items',
                      Icons.api),
                ),
                const SizedBox(height: 14),
                const Text('\u2014 or \u2014',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.muted)),
                const SizedBox(height: 14),
                TextField(
                  controller: _fbUrl,
                  keyboardType: TextInputType.url,
                  decoration: _inputDec(
                      'Firebase Realtime DB URL (optional)',
                      'https://your-db.firebaseio.com',
                      Icons.local_fire_department_outlined),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _fbPath,
                  decoration: _inputDec(
                      'Firebase path (default: items)', 'items',
                      Icons.account_tree),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 52,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: AppColors.onAccent,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(26)),
              ),
              onPressed: _save,
              icon: const Icon(Icons.cloud_sync),
              label: const Text('Save and sync now'),
            ),
          ),
          const SizedBox(height: 24),
          SoftCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text('HOW IT WORKS',
                    style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 1.6,
                        fontWeight: FontWeight.w600,
                        color: AppColors.muted)),
                SizedBox(height: 8),
                Text(
                  '\u2022 Messages are stored locally (SQLite) and synced with '
                  'the cloud every 15 minutes, even when the app is closed.\n'
                  '\u2022 Offline edits queue in the outbox and upload when '
                  'you are back online - the ticks show the state '
                  '(clock = queued, tick = uploading, double tick = synced).\n'
                  '\u2022 Message bodies understand Markdown: headings, lists, '
                  '**bold**, code, links, images and [video](url) players.\n'
                  '\u2022 Deletes propagate to the cloud via tombstones, so '
                  'nothing deleted comes back.\n'
                  '\u2022 The widget ticks in real time and shows the last '
                  'update time.',
                  style: TextStyle(
                      fontSize: 13, height: 1.55, color: AppColors.body),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _storageRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 13.5, color: AppColors.body)),
          ),
          Text(value,
              style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.heading)),
        ],
      ),
    );
  }

  InputDecoration _inputDec(String label, String hint, IconData icon) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      filled: true,
      fillColor: AppColors.cardAlt,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.trackOff),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.trackOff),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.6),
      ),
      prefixIcon: Icon(icon, color: AppColors.muted),
      labelStyle: const TextStyle(color: AppColors.muted, fontSize: 13.5),
      hintStyle: const TextStyle(color: AppColors.disabled, fontSize: 13),
    );
  }
}

/// Segmented picker for the home-screen widget's countdown ring size.
/// Saves to meta storage and pushes it to the widget right away, so the
/// widget re-renders with the new layout on the next tick (≤1s).
class _WidgetSizePicker extends StatefulWidget {
  const _WidgetSizePicker();

  @override
  State<_WidgetSizePicker> createState() => _WidgetSizePickerState();
}

class _WidgetSizePickerState extends State<_WidgetSizePicker> {
  String _size = 's';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final v = await StorageService().getWidgetSize();
    if (mounted) setState(() {
      _size = v;
      _loading = false;
    });
  }

  Future<void> _pick(String v) async {
    if (_loading) return;
    setState(() => _size = v);
    await StorageService().setWidgetSize(v);
    await WidgetService.updateWidget();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
          height: 40,
          child: Center(
              child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.accent))));
    }
    Widget option(String value, String label, String hint) {
      final selected = _size == value;
      return Expanded(
        child: GestureDetector(
          onTap: () => _pick(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? AppColors.accent : AppColors.cardAlt,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: selected
                      ? AppColors.accent
                      : AppColors.trackOff),
            ),
            child: Column(
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: selected
                            ? AppColors.onAccent
                            : AppColors.heading)),
                const SizedBox(height: 1),
                Text(hint,
                    style: TextStyle(
                        fontSize: 10.5,
                        color: selected
                            ? AppColors.onAccent
                            : AppColors.muted)),
              ],
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        option('s', 'S', '40dp ring'),
        const SizedBox(width: 8),
        option('m', 'M', '48dp ring'),
        const SizedBox(width: 8),
        option('l', 'L', '58dp ring'),
      ],
    );
  }
}
