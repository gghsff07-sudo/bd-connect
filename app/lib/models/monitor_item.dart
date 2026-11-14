import 'dart:convert';

/// Message delivery state for the WhatsApp-style sync ticks.
enum DeliveryState {
  local, // created on this device, not yet queued (should not persist long)
  queued, // in outbox waiting for network
  sending, // sync in flight
  synced, // confirmed by the cloud (single grey tick equivalent: stored)
  failed; // permanent failure after retries

  String get name => toString().split('.').last;
  static DeliveryState fromName(String? s) =>
      DeliveryState.values.firstWhere((v) => v.name == s, orElse: () => synced);
}

/// One monitored database message shown in the chat list / detail /
/// notifications / widget. `body` may contain Markdown: headings, lists,
/// bold/italic, code, links, images (![](url)) and videos ([](url.mp4) or
/// [video](...) which the renderer turns into an inline player).
class MonitorItem {
  final String id;
  final String title;
  final String body;
  final String type; // alert | warning | info | success
  final DateTime createdAt;
  final bool done;
  final bool seen;
  final String? source; // 'local' | 'api' | 'firebase'
  final DeliveryState state; // WhatsApp-style tick state
  final DateTime updatedAt; // last local change (for sync + ordering)

  const MonitorItem({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.createdAt,
    this.done = false,
    this.seen = false,
    this.source,
    this.state = DeliveryState.synced,
    DateTime? updatedAt,
  }) : updatedAt = updatedAt ?? createdAt;

  MonitorItem copyWith({
    String? id,
    String? title,
    String? body,
    String? type,
    DateTime? createdAt,
    bool? done,
    bool? seen,
    String? source,
    DeliveryState? state,
    DateTime? updatedAt,
  }) =>
      MonitorItem(
        id: id ?? this.id,
        title: title ?? this.title,
        body: body ?? this.body,
        type: type ?? this.type,
        createdAt: createdAt ?? this.createdAt,
        done: done ?? this.done,
        seen: seen ?? this.seen,
        source: source ?? this.source,
        state: state ?? this.state,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'body': body,
        'type': type,
        'createdAt': createdAt.toIso8601String(),
        'done': done,
        'seen': seen,
        'source': source,
        'state': state.name,
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory MonitorItem.fromJson(Map<String, dynamic> j) => MonitorItem(
        id: j['id']?.toString() ?? '',
        title: j['title']?.toString() ?? '(untitled)',
        body: j['body']?.toString() ?? '',
        type: j['type']?.toString() ?? 'info',
        createdAt:
            DateTime.tryParse(j['createdAt']?.toString() ?? '') ??
                DateTime.now(),
        done: j['done'] == true,
        seen: j['seen'] == true,
        source: j['source']?.toString(),
        state: DeliveryState.fromName(j['state']?.toString()),
        updatedAt:
            DateTime.tryParse(j['updatedAt']?.toString() ?? '') ??
                DateTime.now(),
      );

  /// Best-effort parse of an arbitrary remote JSON record into a MonitorItem.
  /// Recognizes many common field-name conventions so users can point the app
  /// at their own REST API / Firebase RTDB without server changes.
  factory MonitorItem.fromRemote(dynamic raw, {String? source}) {
    final j = raw is Map<String, dynamic> ? raw : <String, dynamic>{};
    String pick(List<String> keys) {
      for (final k in keys) {
        final v = j[k];
        if (v != null && v.toString().trim().isNotEmpty) return v.toString();
      }
      return '';
    }

    final idRaw = pick(['id', 'key', '_id', 'uid', 'uuid']);
    final title = pick(['title', 'name', 'subject', 'heading', 'label']);
    final body = pick([
      'body', 'message', 'description', 'text', 'content', 'detail', 'details',
      'md', 'markdown',
    ]);
    var type = pick(['type', 'level', 'severity', 'priority', 'kind'])
        .toLowerCase();
    // 'tecmis' is a first-class type (university notices synced from the
    // TECMIS scraper) - it keeps its own colour, icon and notification
    // channel instead of collapsing into 'info'. Older cloud entries carry
    // no type field at all; their id prefix is the reliable signal.
    if (type != 'alert' && type != 'warning' && type != 'success' &&
        type != 'tecmis') {
      type = idRaw.startsWith('tecmis-') ? 'tecmis' : 'info';
    }

    DateTime? dt;
    for (final k in [
      'createdAt', 'created_at', 'timestamp', 'time', 'date', 'updated_at'
    ]) {
      final v = j[k];
      if (v == null) continue;
      dt = DateTime.tryParse(v.toString()) ??
          (v is num
              ? DateTime.fromMillisecondsSinceEpoch(
                  v > 9999999999 ? v.toInt() : (v.toInt() * 1000))
              : null);
      if (dt != null) break;
    }

    // TECMIS notices: the cloud's createdAt/updatedAt are the *sync* time
    // (when the scraper pushed them), not when the university posted them.
    // Grouping must follow the original posted date, so prefer the date
    // embedded in the notice itself.
    if (type == 'tecmis' || idRaw.startsWith('tecmis-')) {
      dt = parsePostedAt(body: body, id: idRaw) ?? dt;
    }

    return MonitorItem(
      id: idRaw.isNotEmpty ? idRaw : 'r-${j.hashCode.abs()}',
      title: title.isNotEmpty ? title : '(untitled)',
      body: body,
      type: type,
      createdAt: dt ?? DateTime.now(),
      source: source,
    );
  }

  /// True when the body contains Markdown that needs the rich renderer.
  bool get hasMarkdown {
    final b = body;
    if (b.isEmpty) return false;
    return b.contains('**') ||
        b.contains('__') ||
        b.contains('##') ||
        b.contains('- ') ||
        b.contains('* ') ||
        b.contains('```') ||
        b.contains('`') ||
        b.contains('![') || // image
        b.contains('[](') || // bare video link
        b.contains('[video]') ||
        RegExp(r'\[([^\]]+)\]\(([^)]+)\)').hasMatch(b) || // link
        RegExp(r'^#{1,6} ', multiLine: true).hasMatch(b);
  }

  /// The original TECMIS posted date for this notice, when derivable.
  ///
  /// Sources, in order of trust:
  ///  1. `**Posted:** YYYY-MM-DD HH:MM` inside the markdown body (written
  ///     by the scraper for both AI-enhanced and plain bodies);
  ///  2. the id's upload-stamp prefix `tecmis-file-YYMMDDHHMMSS-…`
  ///     (file notices link the document directly).
  /// Returns null when neither is present.
  DateTime? get postedAt {
    if (type != 'tecmis' && !id.startsWith('tecmis-')) return null;
    return parsePostedAt(body: body, id: id);
  }

  @override
  String toString() => jsonEncode(toJson());
}

/// Extract the original posted timestamp of a TECMIS notice.
DateTime? parsePostedAt({required String body, required String id}) {
  // 1) "**Posted:** 2026-11-11 10:51" (or Posted: without bold, on its line).
  final m = RegExp(
          r'Posted:\*{0,2}\s*(\d{4})-(\d{2})-(\d{2})[ /](\d{2}):(\d{2})')
      .firstMatch(body);
  if (m != null) {
    final d = DateTime.tryParse(
        '${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00');
    if (d != null) return d;
  }
  // 2) tecmis-file-261111105101-…  →  2026-11-11 10:51:01
  final f = RegExp(r'tecmis-file-(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})')
      .firstMatch(id);
  if (f != null) {
    final yy = int.tryParse(f[1]!)!;
    final year = 2000 + yy; // TECMIS upload stamps are post-2000
    final d = DateTime.tryParse(
        '$year-${f[2]}-${f[3]} ${f[4]}:${f[5]}:${f[6]}');
    if (d != null) return d;
  }
  return null;
}
