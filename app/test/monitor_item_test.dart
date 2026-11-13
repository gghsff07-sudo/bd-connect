import 'package:flutter_test/flutter_test.dart';
import 'package:db_monitor/models/monitor_item.dart';

void main() {
  test('fromRemote maps common field names', () {
    final item = MonitorItem.fromRemote({
      'id': 7,
      'name': 'CPU high',
      'message': 'Database CPU at 96%',
      'severity': 'ALERT',
      'timestamp': '2026-11-12T10:00:00Z',
    });
    expect(item.id, '7');
    expect(item.title, 'CPU high');
    expect(item.body, 'Database CPU at 96%');
    expect(item.type, 'alert'); // normalized lower-case
    expect(item.createdAt.year, 2026);
  });

  test('fromRemote falls back to info and generates id', () {
    final item = MonitorItem.fromRemote({'subject': 'hello'});
    expect(item.type, 'info');
    expect(item.id, isNotEmpty);
    expect(item.title, 'hello');
  });

  test('json roundtrip keeps done/seen/state', () {
    final now = DateTime(2026, 1, 2, 3, 4);
    final a = MonitorItem(
        id: 'x',
        title: 't',
        body: 'b',
        type: 'warning',
        createdAt: now,
        done: true,
        seen: true,
        source: 'api',
        state: DeliveryState.queued);
    final b = MonitorItem.fromJson(a.toJson());
    expect(b.done, true);
    expect(b.seen, true);
    expect(b.source, 'api');
    expect(b.state, DeliveryState.queued);
    expect(b.createdAt, now);
  });

  test('copyWith only changes given fields', () {
    final a = MonitorItem(
        id: 'x',
        title: 't',
        body: 'b',
        type: 'info',
        createdAt: DateTime(2026));
    final b = a.copyWith(done: true);
    expect(b.done, true);
    expect(b.title, 't');
    expect(a.done, false);
  });

  test('hasMarkdown detects rich content', () {
    expect(
        MonitorItem(
                id: '1',
                title: 't',
                body: '# Heading\n\n**bold** and `code`',
                type: 'info',
                createdAt: DateTime(2026))
            .hasMarkdown,
        isTrue);
    expect(
        MonitorItem(
                id: '1',
                title: 't',
                body: '![chart](https://x/y.png)',
                type: 'info',
                createdAt: DateTime(2026))
            .hasMarkdown,
        isTrue);
    expect(
        MonitorItem(
                id: '1',
                title: 't',
                body: '[video](https://x/y.mp4)',
                type: 'info',
                createdAt: DateTime(2026))
            .hasMarkdown,
        isTrue);
    expect(
        MonitorItem(
                id: '1',
                title: 't',
                body: 'plain text only',
                type: 'info',
                createdAt: DateTime(2026))
            .hasMarkdown,
        isFalse);
  });

  test('DeliveryState parses names and defaults to synced', () {
    expect(DeliveryState.fromName('queued'), DeliveryState.queued);
    expect(DeliveryState.fromName('bogus'), DeliveryState.synced);
    expect(DeliveryState.fromName(null), DeliveryState.synced);
  });
}
