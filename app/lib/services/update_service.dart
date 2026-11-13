import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:flutter/services.dart';

/// In-app updater backed by the project's public GitHub releases:
///   https://github.com/gghsff07-sudo/bd-connect/releases
///
/// checkForUpdate() compares the latest release tag with the installed
/// version (supplied natively via the db_monitor/update method channel, so
/// no extra plugin is needed); downloadAndInstall() fetches the APK asset
/// into the cache dir and asks MainActivity to launch the system installer
/// through a FileProvider URI.
///
/// The release feed is fixed (the repo is the app's home). If GitHub is
/// unreachable the check simply fails softly — nothing else breaks.
class UpdateService {
  static const _repo = 'gghsff07-sudo/bd-connect';
  static const _channel = MethodChannel('db_monitor/update');

  /// Info about the latest GitHub release if it is newer than the installed
  /// version; null when up to date, offline, or the feed is unreadable.
  static Future<UpdateInfo?> checkForUpdate() async {
    try {
      final res = await http
          .get(Uri.parse('https://api.github.com/repos/$_repo/releases/latest'))
          .timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) return null;
      final j = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final tagName = ((j['tag_name'] as String?) ?? '').replaceFirst('v', '');
      if (tagName.isEmpty) return null;

      String? apkUrl;
      for (final a in (j['assets'] as List? ?? [])) {
        if (a is Map<String, dynamic> &&
            ((a['name'] as String?) ?? '').endsWith('.apk')) {
          apkUrl = a['browser_download_url'] as String?;
          break;
        }
      }
      if (apkUrl == null) return null;

      final installed = await installedVersion();
      if (installed == null) return null;
      if (compareVersions(tagName, installed) <= 0) return null; // up to date

      return UpdateInfo(
        version: tagName,
        apkUrl: apkUrl,
        notes: (j['body'] as String?) ?? '',
        htmlUrl: (j['html_url'] as String?) ?? '',
      );
    } catch (_) {
      return null;
    }
  }

  /// Version name of the installed build (e.g. "2.4.0"), from the native side.
  static Future<String?> installedVersion() async {
    try {
      return await _channel.invokeMethod<String>('appVersion');
    } catch (_) {
      return null;
    }
  }

  /// Downloads the APK into the app cache and opens the system installer.
  /// [onProgress] receives 0.0–1.0 while downloading (null = unknown size).
  static Future<void> downloadAndInstall(
      UpdateInfo info, void Function(double?) onProgress) async {
    final dir = await _cacheDir();
    final file = File('${dir.path}/db-monitor-update.apk');
    final client = http.Client();
    try {
      final res = await client
          .send(http.Request('GET', Uri.parse(info.apkUrl)))
          .timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) {
        throw Exception('Download failed (HTTP ${res.statusCode})');
      }
      final total = res.contentLength ?? 0;
      var received = 0;
      final sink = file.openWrite();
      await for (final chunk in res.stream) {
        sink.add(chunk);
        received += chunk.length;
        onProgress(total > 0 ? received / total : null);
      }
      await sink.flush();
      await sink.close();
    } finally {
      client.close();
    }
    await _channel.invokeMethod('installApk', {'path': file.path});
  }

  /// "2.4.0" vs "2.3.0" → 1; missing segments count as 0.
  static int compareVersions(String a, String b) {
    final pa = a.split('.').map((s) => int.tryParse(s) ?? 0).toList();
    final pb = b.split('.').map((s) => int.tryParse(s) ?? 0).toList();
    for (var i = 0; i < 3; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x.compareTo(y);
    }
    return 0;
  }

  static Future<Directory> _cacheDir() async {
    try {
      final path = await _channel.invokeMethod<String>('cacheDir');
      if (path != null && path.isNotEmpty) return Directory(path);
    } catch (_) {}
    return Directory.systemTemp;
  }
}

/// One GitHub release worth installing.
class UpdateInfo {
  final String version;
  final String apkUrl;
  final String notes;
  final String htmlUrl;

  const UpdateInfo({
    required this.version,
    required this.apkUrl,
    required this.notes,
    required this.htmlUrl,
  });
}
