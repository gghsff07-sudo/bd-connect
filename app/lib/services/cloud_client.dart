import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/monitor_item.dart';
import 'storage_service.dart';

/// Cloud operations for the sync engine. Two interchangeable backends:
///
///   A) Firebase Realtime Database (default for this app):
///      - items live at  <dbUrl>/<path>/<id>.json
///      - push  = PUT    (id-keyed, no token needed for open rules)
///      - pull  = GET    <dbUrl>/<path>.json  (returns map keyed by id)
///      - delete= DELETE <dbUrl>/<path>/<id>.json
///
///   B) Generic REST API:
///      - pull = GET apiUrl (JSON list or {items:[...]})
///      - push = PUT/PATCH apiUrl/{id} (best effort; many read-only APIs
///        will 405 - the sync engine then reports "cloud is read-only"
///        instead of failing)
///
/// All methods return typed results; nothing throws.
class CloudClient {
  final http.Client _http;
  CloudClient({http.Client? client}) : _http = client ?? http.Client();

  Future<(String api, String fb, String fbPath)> _config() async {
    final s = StorageService();
    var api = (await s.getApiUrl()).trim();
    var fb = (await s.getFirebaseUrl()).trim();
    var fbPath = await s.getFirebasePath();
    api = api.isNotEmpty ? api : (AppConfig.hasApiConfig ? AppConfig.apiBaseUrl : '');
    fb = fb.isNotEmpty ? fb : (AppConfig.hasFirebaseConfig ? AppConfig.firebaseDbUrl : '');
    return (api, fb, fbPath);
  }

  bool _sameHost(String a, String b) {
    Uri? ua, ub;
    try {
      ua = Uri.parse(a);
      ub = Uri.parse(b);
    } catch (_) {
      return false;
    }
    return ua.host == ub.host;
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
        final uri = Uri.parse(
            api.endsWith('/') ? '$api${item.id}' : '$api/${item.id}');
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

  /// Push one deletion (tombstone) to the cloud.
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
      if (api.isNotEmpty && _sameHost(api, api)) {
        final uri =
            Uri.parse(api.endsWith('/') ? '${api}id' : '$api/$id');
        final res =
            await _http.delete(uri).timeout(const Duration(seconds: 20));
        if (res.statusCode >= 200 && res.statusCode < 300) return (true, null);
        return (false, 'API delete ${res.statusCode}');
      }
      return (true, null); // no cloud configured
    } catch (e) {
      return (false, 'delete failed: $e');
    }
  }

  void close() => _http.close();
}
