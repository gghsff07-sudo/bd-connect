import 'package:flutter_test/flutter_test.dart';
import 'package:db_monitor/models/monitor_item.dart';

/// v2.6: TECMIS notices keep their type and group by their ORIGINAL posted
/// date - recovered from the "**Posted:** YYYY-MM-DD HH:MM" line in the
/// body (both AI-enhanced and plain bodies) or, for file notices, from the
/// upload-stamp prefix in the id (tecmis-file-YYMMDDHHMMSS-…).
void main() {
  test('fromRemote keeps the tecmis type', () {
    final item = MonitorItem.fromRemote({
      'id': 'tecmis-notice-3190',
      'title': 'TECMIS: Amended ICT exam timetable',
      'body': '## Amended ICT exam timetable',
      'type': 'tecmis',
      'createdAt': '2026-11-14T02:16:00.000Z',
      'updatedAt': '2026-11-14T02:16:00.000Z',
    });
    expect(item.type, 'tecmis');
  });

  test('tecmis ids keep the type even without a type field', () {
    final item = MonitorItem.fromRemote({
      'id': 'tecmis-file-261111105101-ICT - Exam Timetable.pdf',
      'title': 'TECMIS: AMENDED ICT EXAM TIME TABLE',
      'body': 'anything',
    });
    expect(item.type, 'tecmis');
    expect(item.id, startsWith('tecmis-file-261111105101'));
  });

  test('parsePostedAt reads the Posted line (AI body)', () {
    const body = '## Amended ICT Exam Timetable\n\n'
        '**Posted:** 2026-11-11 10:51 · **Category:** Exam · '
        '**Section:** Recent\n\n'
        'The amended timetable is attached.\n\n'
        '[📄 View/Download Original](https://example.com/x.pdf)';
    final d = parsePostedAt(body: body, id: 'tecmis-notice-3190');
    expect(d, isNotNull);
    expect(d!.year, 2026);
    expect(d.month, 11);
    expect(d.day, 11);
    expect(d.hour, 10);
    expect(d.minute, 51);
  });

  test('parsePostedAt reads bold **Posted:** markup', () {
    const body = '## Something\n\n**Posted:** 2026-10-06 11:57\n\n'
        '**Section:** Previous';
    final d = parsePostedAt(body: body, id: 'tecmis-notice-3000');
    expect(d, isNotNull);
    expect(d!.year, 2026);
    expect(d.month, 10);
    expect(d.day, 6);
    expect(d.minute, 57);
  });

  test('parsePostedAt falls back to the file id timestamp', () {
    const body = 'no date in here at all';
    final d = parsePostedAt(
        body: body,
        id: 'tecmis-file-260918232401-ICT Mid Exam Timetable.pdf');
    expect(d, isNotNull);
    // 26 09 18 23 24 01 -> 2026-09-18 23:24:01
    expect(d!.year, 2026);
    expect(d.month, 9);
    expect(d.day, 18);
    expect(d.hour, 23);
    expect(d.minute, 24);
    expect(d.second, 1);
  });

  test('parsePostedAt returns null when nothing is parseable', () {
    expect(parsePostedAt(body: '', id: 'tecmis-notice-1'), isNull);
    expect(parsePostedAt(body: 'no dates', id: 'tecmis-notice-1'), isNull);
  });

  test('fromRemote prefers the posted date over the sync date', () {
    // Cloud createdAt = when the scraper pushed it (Nov 14); the notice
    // was actually posted on Nov 11 - grouping must use Nov 11.
    final item = MonitorItem.fromRemote({
      'id': 'tecmis-file-261111105101-ICT - Exam Timetable.pdf',
      'title': 'TECMIS: AMENDED ICT EXAM TIME TABLE',
      'body': '## AMENDED ICT EXAM TIME TABLE\n\n'
          '**Posted:** 2026-11-11 10:51\n\n'
          '**Section:** Recent\n\n'
          '[📄 View/Download Original](https://paravi.ruh.ac.lk/x.pdf)',
      'type': 'tecmis',
      'createdAt': '2026-11-14T02:16:00.000Z',
    });
    expect(item.type, 'tecmis');
    expect(item.postedAt, isNotNull);
    expect(item.postedAt!.day, 11);
    expect(item.postedAt!.month, 11);
    expect(item.createdAt.day, 11); // posted date wins over sync date
  });

  test('non-tecmis items never report a posted date', () {
    final item = MonitorItem.fromRemote({
      'id': 'evt-1',
      'title': 'Replication lag warning',
      'body': '**Posted:** 2026-11-11 10:51', // decoy
      'type': 'warning',
    });
    expect(item.postedAt, isNull);
  });

  test('old style date with slash (2026-11-11/10:51) parses too', () {
    const body = '**Posted:** 2026-11-11/10:51junk';
    final d = parsePostedAt(body: body, id: 'tecmis-notice-5');
    expect(d, isNotNull);
    expect(d!.day, 11);
    expect(d!.minute, 51);
  });
}
