import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/monitor_item.dart';
import 'storage_service.dart';

/// Parsed view of the configured REST base URL.
///
/// The db-monitor-api backend (Vercel) authenticates with `?key=<API_TOKEN>`
/// in the URL, because the app cannot send custom headers. [ApiTarget] keeps
/// every query parameter of the configured URL and reapplies it to all
/// derived requests (item PUT / item DELETE / TECMIS deletes), so the whole
/// verb set stays authenticated. It also builds the URLs of the backend's
/// TECMIS housekeeping endpoints, which live one level up from `/items`:
///
///   DELETE <root>/tecmis-delete?id=<id>   (one specific notice)
///   DELETE <root>/tecmis-delete-old       (bulk reconcile, JSON body)
///
/// where `<root>` is the base without its last path segment
/// (`https://host/api/items` -> `https://host/api`).
///
/// Ids are percent-encoded ([Uri.encodeComponent]), so notices whose ids
/// contain spaces (e.g. `tecmis-file-...-ICT - Exam Timetable.pdf`) can be
/// pushed and deleted. Non-db-monitor APIs are untouched: sibling endpoints
/// are only derived when the base ends in `/items` with a parent path, and
/// are only used for ids starting with `tecmis-`.
class ApiTarget {
  final String _origin; // 'https://host:port'
  final String _path; // '/api/items' — leading slash, no trailing slash
  final Map<String, String> _query; // decoded query parameters

  ApiTarget._(this._origin, this._path, this._query);

  /// Parses an http(s) URL; null when it is not a usable web URL.
  static ApiTarget? tryParse(String url) {
    final u = Uri.tryParse(url.trim());
    if (u == null) return null;
    final scheme = u.scheme.toLowerCase();
    if ((scheme != 'http' && scheme != 'https') || u.host.isEmpty) return null;
    var path = u.path;
    while (path.length > 1 && path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }
    return ApiTarget._(
        '$scheme://${u.authority}', path, Map<String, String>.of(u.queryParameters));
  }

  List<String> get _segments =>
      _path.length > 1 ? _path.substring(1).split('/') : const <String>[];

  /// True when the base looks like the db-monitor-api items collection
  /// (`.../items` with a parent path), so the sibling TECMIS endpoints
  /// can be derived safely.
  bool get hasTecmisSiblings => _segments.length >= 2 && _segments.last == 'items';

  /// Parent directory of the collection: '/api/items' -> '/api'.
  /// Only ever used when [hasTecmisSiblings] is true.
  String get _parent => _path.substring(0, _path.lastIndexOf('/'));

  /// Query string for a derived URL: original params (plus [extra]),
  /// percent-encoded with %20-style encoding (no '+' for spaces).
  String _queryString([Map<String, String>? extra]) {
    final q = <String, String>{..._query};
    if (extra != null) q.addAll(extra);
    if (q.isEmpty) return '';
    final parts = q.entries
        .map((e) =>
            '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}')
        .join('&');
    return '?$parts';
  }

  /// PUT/DELETE target for one item: `<base>/<id>` plus the original query.
  Uri itemUri(String id) =>
      Uri.parse('$_origin$_path/${Uri.encodeComponent(id)}${_queryString()}');

  /// `DELETE <root>/tecmis-delete?id=<id>` for one specific TECMIS notice.
  Uri tecmisDeleteUri(String id) =>
      Uri.parse('$_origin$_parent/tecmis-delete${_queryString({'id': id})}');

  /// `DELETE <root>/tecmis-delete-old` (body: {"currentIds": [...]}).
  Uri tecmisDeleteOldUri() =>
      Uri.parse('$_origin$_parent/tecmis-delete-old${_queryString()}');
}

/// Cloud operations for the sync engine. Two interchangeable backends:
///
///   A) Firebase Realtime Database:
///      - items live at  <dbUrl>/<path>/<id>.json
///      - push  = PUT    (id-keyed, no token needed for open rules)
///      - pull  = GET    <dbUrl>/<path>.json  (returns map keyed by id)
///      - delete= DELETE <dbUrl>/<path>/<id>.json
///
///   B) Generic REST API (the db-monitor-api backend, or any read/write
///      REST source):
///      - pull   = GET  apiUrl (JSON list or {items:[...]})
///      - push   = PUT  apiUrl/<id>
///      - delete = DELETE apiUrl/<id>
///      - the configured URL's query string (e.g. `?key=<API_TOKEN>`) is
///        kept on every request, so push and delete authenticate exactly
///        like the pull does (no headers needed)
///      - TECMIS notices (ids starting with `tecmis-`) also use the
///        backend's dedicated deletion endpoints
///
/// All methods return typed results; nothing throws.
class CloudClient {
  final http.Client _http;

  // Test seam: when set, these bypass the stored settings entirely.
  final String? _apiOverride;
  final String? _fbOverride;
  final String? _fbPathOverride;

  CloudClient({http.Client? client, String? api, String? fb, String? fbPath})
      : _http = client ?? http.Client(),
        _apiOverride = api,
        _fbOverride = fb,
        _fbPathOverride = fbPath;

  Future<(String api, String fb, String fbPath)> _config() async {
    if (_apiOverride != null || _fbOverride != null || _fbPathOverride != null) {
      return (_apiOverride ?? '', _fbOverride ?? '',
          _fbPathOverride ?? 'items');
    }
    final s = StorageService();
    var api = (await s.getApiUrl()).trim();
    var fb = (await s.getFirebaseUrl()).trim();
    var fbPath = await s.getFirebasePath();
    api = api.isNotEmpty ? api : (AppConfig.hasApiConfig ? AppConfig.apiBaseUrl : '');
    fb = fb.isNotEmpty ? fb : (AppConfig.hasFirebaseConfig ? AppConfig.firebaseDbUrl : '');
    return (api, fb, fbPath);
  }

  // ---------------- pull ----------------

  /// Pull all remote items. Returns (items, error). Priority: API, then
  /// Firebase, then empty (preview mode handled by caller).
  Future<(List<MonitorItem>, String? err)> pull() async {
    final (api, fb, fbPath) = await _config();
    if (api.isNotEmpty) return _pullApi(api);
    if (fb.isNotEmpty) return _pullFirebase(fb, fbPath);
    return (<MonitorItem>[], null); // nothing configured - not an error
  }

  Future<(List<MonitorItem>, String? err)> _pullApi(String url) async {
    try {
      final res =
          await _http.get(Uri.parse(url)).timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) {
        return (
          <MonitorItem>[],
          'API error ${res.statusCode}: ${res.reasonPhrase ?? ''}'.trim()
        );
      }
      final data = jsonDecode(res.body);
      return (_listFrom(data, source: 'api'), null);
    } catch (e) {
      return (<MonitorItem>[], 'API unreachable: $e');
    }
  }

  Future<(List<MonitorItem>, String? err)> _pullFirebase(
      String url, String path) async {
    try {
      final uri = Uri.parse(
          '$url/${path.trim().replaceAll(RegExp(r'^/+'), '')}.json');
      final res =
          await _http.get(uri).timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) {
        return (
          <MonitorItem>[],
          'Firebase error ${res.statusCode}: ${res.reasonPhrase ?? ''}'.trim()
        );
      }
      if (res.body.trim() == 'null') return (<MonitorItem>[], null);
      final data = jsonDecode(res.body);
      final list = data is Map
          ? data.entries
              .map((e) {
                final m = Map<String, dynamic>.from(e.value as Map? ?? {});
                m['key'] ??= e.key;
                return m;
              })
              .toList()
          : data;
      return (_listFrom(list, source: 'firebase'), null);
    } catch (e) {
      return (<MonitorItem>[], 'Firebase unreachable: $e');
    }
  }

  List<MonitorItem> _listFrom(dynamic data, {String? source}) {
    List<dynamic> records = [];
    if (data is List) {
      records = data;
    } else if (data is Map) {
      for (final k in ['items', 'data', 'results', 'rows', 'records']) {
        if (data[k] is List) {
          records = data[k] as List;
          break;
        }
      }
      if (records.isEmpty && data.isNotEmpty) {
        records = data.values.whereType<Map>().toList();
      }
    }
    return records
        .whereType<Map>()
        .map((r) =>
            MonitorItem.fromRemote(Map<String, dynamic>.from(r), source: source))
        .toList();
  }

  // ---------------- push ----------------

  /// Push one upsert to the cloud. Returns (ok, error).
  Future<(bool ok, String? err)> pushUpsert(MonitorItem item) async {
    final (api, fb, fbPath) = await _config();
    final body = jsonEncode(item.toJson());
    try {
      if (fb.isNotEmpty) {
        final uri = Uri.parse(
            '$fb/${fbPath.replaceAll(RegExp(r'^/+'), '')}/${item.id}.json');
        final res = await _http
            .put(uri, body: body)
            .timeout(const Duration(seconds: 20));
        if (res.statusCode >= 200 && res.statusCode < 300) return (true, null);
        return (false, 'Firebase push ${res.statusCode}');
      }
      if (api.isNotEmpty) {
        final t = ApiTarget.tryParse(api);
        final uri = t != null
            ? t.itemUri(item.id) // keeps ?key=... and encodes the id
            : Uri.parse(api.endsWith('/') // legacy fallback for odd URLs
                ? '$api${item.id}'
                : '$api/${item.id}');
        final res = await _http
            .put(uri, body: body)
            .timeout(const Duration(seconds: 20));
        if (res.statusCode >= 200 && res.statusCode < 300) return (true, null);
        // Read-only API: treat as soft failure, keep local state.
        return (false, 'API push ${res.statusCode} (read-only endpoint?)');
      }
      // No cloud configured: local-only mode succeeds trivially.
      return (true, null);
    } catch (e) {
      return (false, 'push failed: $e');
    }
  }

  /// Push one deletion to the cloud. Returns (ok, error).
  ///
  /// TECMIS notices (ids starting with `tecmis-`, as created by the
  /// db-monitor-api backend) are deleted through the backend's dedicated
  /// endpoint `DELETE <root>/tecmis-delete?id=<id>`; a 404 carrying the
  /// API's own "Notice not found" body means "already gone from the cloud"
  /// and still counts as success. Everything else - and any fallback -
  /// uses the generic `DELETE <base>/<id>` collection delete.
  Future<(bool ok, String? err)> pushDelete(String id) async {
    final (api, fb, fbPath) = await _config();
    try {
      if (fb.isNotEmpty) {
        final uri = Uri.parse(
            '$fb/${fbPath.replaceAll(RegExp(r'^/+'), '')}/$id.json');
        final res =
            await _http.delete(uri).timeout(const Duration(seconds: 20));
        if (res.statusCode >= 200 && res.statusCode < 300) return (true, null);
        return (false, 'Firebase delete ${res.statusCode}');
      }
      if (api.isNotEmpty) {
        final t = ApiTarget.tryParse(api);
        // Dedicated TECMIS endpoint (db-monitor-api shape only).
        if (id.startsWith('tecmis-') && t != null && t.hasTecmisSiblings) {
          try {
            final res = await _http
                .delete(t.tecmisDeleteUri(id))
                .timeout(const Duration(seconds: 20));
            if (res.statusCode == 200) return (true, null);
            // The API's own 404 ("Notice not found") = already gone = ok.
            if (res.statusCode == 404 &&
                res.body.toLowerCase().contains('not found')) {
              return (true, null);
            }
            // 400 / 5xx / route-level 404: fall through to the generic delete.
          } catch (_) {
            // Network error on the dedicated call: try the generic one.
          }
        }
        final uri = t != null
            ? t.itemUri(id) // keeps ?key=... and encodes the id
            : Uri.parse(api.endsWith('/') // legacy fallback (bug-fixed)
                ? '$api$id'
                : '$api/$id');
        final res =
            await _http.delete(uri).timeout(const Duration(seconds: 20));
        if ((res.statusCode >= 200 && res.statusCode < 300) ||
            res.statusCode == 404) {
          return (true, null); // 404 = not on the server, goal achieved
        }
        return (false, 'API delete ${res.statusCode}');
      }
      return (true, null); // no cloud configured
    } catch (e) {
      return (false, 'delete failed: $e');
    }
  }

  // ---------------- TECMIS housekeeping ----------------

  /// Ask the db-monitor-api to drop every TECMIS notice that is not in
  /// [currentIds]: `DELETE <root>/tecmis-delete-old` with body
  /// `{"currentIds": [...]}`. This heals cloud copies of notices whose
  /// outbox deletes failed or gave up.
  ///
  /// Returns (deletedCount, error); (0, null) when not applicable (no REST
  /// cloud, Firebase backend, or not the db-monitor-api shape).
  Future<(int deleted, String? err)> reconcileTecmis(
      List<String> currentIds) async {
    final (api, fb, _) = await _config();
    if (fb.isNotEmpty) return (0, null); // Firebase: no such endpoints
    if (api.isEmpty) return (0, null);
    final t = ApiTarget.tryParse(api);
    if (t == null || !t.hasTecmisSiblings) return (0, null);
    try {
      final req = http.Request('DELETE', t.tecmisDeleteOldUri())
        ..headers['content-type'] = 'application/json'
        ..body = jsonEncode({'currentIds': currentIds});
      final streamed =
          await _http.send(req).timeout(const Duration(seconds: 20));
      final res = await http.Response.fromStream(streamed);
      if (res.statusCode == 200) {
        final j = jsonDecode(res.body);
        final n = (j is Map && j['deleted'] is int) ? j['deleted'] as int : 0;
        return (n, null);
      }
      return (0, 'tecmis-delete-old ${res.statusCode}');
    } catch (e) {
      return (0, 'reconcile failed: $e');
    }
  }

  void close() => _http.close();
}
