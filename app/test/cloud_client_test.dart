import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:db_monitor/models/monitor_item.dart';
import 'package:db_monitor/services/cloud_client.dart';

const _base = 'https://proj.vercel.app/api/items?key=S3cret';

/// MockClient that always answers with the same status/body and records
/// every request as {'method', 'url', 'body'} maps.
MockClient _recorder(List<Map<String, String>> log,
        {int status = 200, String body = '{}'}) =>
    MockClient((req) async {
      log.add(
          {'method': req.method, 'url': req.url.toString(), 'body': req.body});
      return http.Response(body, status);
    });

/// MockClient that answers with a scripted sequence of (status, body)
/// responses, also recording every request.
MockClient _script(List<(int, String)> responses, List<Map<String, String>> log) =>
    MockClient((req) {
      log.add(
          {'method': req.method, 'url': req.url.toString(), 'body': req.body});
      final r = responses.removeAt(0);
      return http.Response(r.$2, r.$1);
    });

MonitorItem _item(String id) => MonitorItem(
    id: id,
    title: 'Replication lag warning',
    body: 'Lag is 18s.',
    type: 'warning',
    createdAt: DateTime(2026, 11, 12, 21, 44));

void main() {
  group('ApiTarget URL building', () {
    test('rejects non-web and unusable URLs', () {
      expect(ApiTarget.tryParse('ftp://h/api/items'), isNull);
      expect(ApiTarget.tryParse('not a url at all'), isNull);
      expect(ApiTarget.tryParse(''), isNull);
    });

    test('builds item URLs with the original query and encoded id', () {
      final t = ApiTarget.tryParse(_base)!;
      expect(t.hasTecmisSiblings, isTrue);
      expect(t.itemUri('evt-1').toString(),
          'https://proj.vercel.app/api/items/evt-1?key=S3cret');
      // ids containing spaces must be percent-encoded, never raw.
      expect(t.itemUri('tecmis-file-ICT - Exam Timetable.pdf').toString(),
          'https://proj.vercel.app/api/items/'
          'tecmis-file-ICT%20-%20Exam%20Timetable.pdf?key=S3cret');
    });

    test('builds the TECMIS sibling URLs one level up', () {
      final t = ApiTarget.tryParse(_base)!;
      expect(t.tecmisDeleteUri('tecmis notice 2').toString(),
          'https://proj.vercel.app/api/tecmis-delete?key=S3cret&id=tecmis%20notice%202');
      expect(t.tecmisDeleteOldUri().toString(),
          'https://proj.vercel.app/api/tecmis-delete-old?key=S3cret');
    });

    test('no sibling endpoints for other shapes', () {
      expect(ApiTarget.tryParse('https://h.dev/items')!.hasTecmisSiblings,
          isFalse); // no parent path
      expect(ApiTarget.tryParse('https://h.dev/api/other?key=k')!
          .hasTecmisSiblings, isFalse); // collection is not "items"
      expect(ApiTarget.tryParse('https://h.dev')!.hasTecmisSiblings, isFalse);
    });

    test('works without a query string too', () {
      final t = ApiTarget.tryParse('https://h.dev/api/items')!;
      expect(t.itemUri('x').toString(), 'https://h.dev/api/items/x');
      expect(t.tecmisDeleteUri('y').toString(),
          'https://h.dev/api/tecmis-delete?id=y');
    });
  });

  group('CloudClient against the db-monitor-api shape', () {
    test('pushUpsert sends an authenticated PUT to <base>/<id>', () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(client: _recorder(log), api: _base, fb: '');
      final (ok, err) = await c.pushUpsert(_item('evt-8842'));
      expect(ok, isTrue);
      expect(err, isNull);
      expect(log.single['method'], 'PUT');
      expect(log.single['url'],
          'https://proj.vercel.app/api/items/evt-8842?key=S3cret');
      expect(log.single['body'], contains('"id":"evt-8842"'));
    });

    test('pushDelete (non-TECMIS) sends an authenticated DELETE', () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(client: _recorder(log), api: _base, fb: '');
      final (ok, err) = await c.pushDelete('evt-9');
      expect(ok, isTrue);
      expect(err, isNull);
      expect(log.single['method'], 'DELETE');
      expect(log.single['url'],
          'https://proj.vercel.app/api/items/evt-9?key=S3cret');
    });

    test('a server 404 on the generic delete still counts as done', () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(
          client: _recorder(log, status: 404, body: '{"error":"not found"}'),
          api: _base,
          fb: '');
      final (ok, err) = await c.pushDelete('evt-gone');
      expect(ok, isTrue);
      expect(err, isNull);
    });

    test('pushDelete (TECMIS) routes to the dedicated endpoint', () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(client: _recorder(log), api: _base, fb: '');
      final (ok, err) = await c.pushDelete('tecmis-notice-3190');
      expect(ok, isTrue);
      expect(err, isNull);
      expect(log.length, 1); // only the dedicated call, no fallback
      expect(log.single['method'], 'DELETE');
      expect(log.single['url'],
          'https://proj.vercel.app/api/tecmis-delete?key=S3cret&id=tecmis-notice-3190');
    });

    test('dedicated 404 "Notice not found" = already gone = success', () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(
          client: _recorder(log,
              status: 404,
              body: '{"error":"Notice not found","id":"tecmis-x"}'),
          api: _base,
          fb: '');
      final (ok, err) = await c.pushDelete('tecmis-x');
      expect(ok, isTrue);
      expect(err, isNull);
      expect(log.length, 1);
    });

    test('a route-level 404 (missing endpoint) falls back to the generic delete',
        () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(
          client: _script(
              // 1st: dedicated endpoint missing (Vercel HTML 404 page),
              // 2nd: generic collection delete succeeds.
              [
                (404, '<html>DEPLOYMENT_NOT_FOUND</html>'),
                (200, '{"id":"tecmis-y","deleted":true}'),
              ],
              log),
          api: _base,
          fb: '');
      final (ok, err) = await c.pushDelete('tecmis-y');
      expect(ok, isTrue);
      expect(err, isNull);
      expect(log.length, 2);
      expect(log[0]['url'],
          'https://proj.vercel.app/api/tecmis-delete?key=S3cret&id=tecmis-y');
      expect(log[1]['url'],
          'https://proj.vercel.app/api/items/tecmis-y?key=S3cret');
    });

    test('reconcileTecmis posts currentIds to tecmis-delete-old', () async {
      final log = <Map<String, String>>[];
      final c = CloudClient(
          client: _recorder(log,
              status: 200,
              body:
                  '{"deleted":3,"deletedIds":["a","b","c"],"message":"Deleted 3 old notice(s)"}'),
          api: _base,
          fb: '');
      final (n, err) = await c.reconcileTecmis(['tecmis-a', 'tecmis-b']);
      expect(n, 3);
      expect(err, isNull);
      expect(log.single['method'], 'DELETE');
      expect(log.single['url'],
          'https://proj.vercel.app/api/tecmis-delete-old?key=S3cret');
      expect(log.single['body'],
          '{"currentIds":["tecmis-a","tecmis-b"]}');
      expect(log.single['body'], contains('tecmis-a'));
    });

    test('reconcileTecmis is a no-op for other shapes / Firebase / no cloud',
        () async {
      final log = <Map<String, String>>[];
      // collection is not "items"
      final a = CloudClient(
          client: _recorder(log), api: 'https://h.dev/api/other?key=k', fb: '');
      expect((await a.reconcileTecmis(['tecmis-a'])), (0, null));
      // Firebase configured: REST endpoints are never used
      final b = CloudClient(client: _recorder(log), api: _base, fb: 'https://fb.example.com');
      expect((await b.reconcileTecmis(['tecmis-a'])), (0, null));
      // no cloud at all
      final d = CloudClient(client: _recorder(log), api: '', fb: '');
      expect((await d.reconcileTecmis(['tecmis-a'])), (0, null));
      expect(log, isEmpty); // not a single request was sent
    });
  });
}
