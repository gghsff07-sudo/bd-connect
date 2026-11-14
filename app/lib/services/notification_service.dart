import 'dart:io';
import 'package:flutter/material.dart' show Color;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/monitor_item.dart';

/// Notification channels + showing, themed to Soft Day (terracotta).
/// Channels are the "notification categories":
///   alert   -> critical: sound + vibration, high priority
///   warning -> sound, default priority
///   info    -> silent
///   success -> silent
class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();

  static const _channelAlert = AndroidNotificationChannel(
    'db_alert',
    'Critical alerts',
    description: 'Critical database alerts - sound and vibration',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
  );
  static const _channelWarning = AndroidNotificationChannel(
    'db_warning',
    'Warnings',
    description: 'Database warnings - sound',
    importance: Importance.high,
    playSound: true,
  );
  static const _channelInfo = AndroidNotificationChannel(
    'db_info',
    'Info',
    description: 'Informational database updates - silent',
    importance: Importance.low,
    playSound: false,
  );
  static const _channelSuccess = AndroidNotificationChannel(
    'db_success',
    'Success',
    description: 'Successful operations - silent',
    importance: Importance.low,
    playSound: false,
  );
  static const _channelTecmis = AndroidNotificationChannel(
    'db_tecmis',
    'TECMIS notices',
    description: 'University notices synced from TECMIS - sound',
    importance: Importance.high,
    playSound: true,
  );

  static Future<void> init() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: android);
    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (resp) {
        // Tapping the notification opens the app (default launch intent).
      },
    );
    await _createChannels();
  }

  static Future<void> _createChannels() async {
    final impl = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await impl?.createNotificationChannel(_channelAlert);
    await impl?.createNotificationChannel(_channelWarning);
    await impl?.createNotificationChannel(_channelInfo);
    await impl?.createNotificationChannel(_channelSuccess);
    await impl?.createNotificationChannel(_channelTecmis);
  }

  /// Android 13+ requires the POST_NOTIFICATIONS runtime permission.
  static Future<bool> requestPermission() async {
    if (!Platform.isAndroid) return true;
    final impl = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (impl == null) return true;
    final granted = await impl.requestNotificationsPermission();
    return granted ?? true;
  }

  static Future<bool> isPermissionGranted() async {
    if (!Platform.isAndroid) return true;
    final impl = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    return await impl?.areNotificationsEnabled() ?? true;
  }

  static (AndroidNotificationChannel, Priority) _channelFor(String type) {
    switch (type) {
      case 'alert':
        return (_channelAlert, Priority.max);
      case 'warning':
        return (_channelWarning, Priority.high);
      case 'success':
        return (_channelSuccess, Priority.low);
      case 'tecmis':
        return (_channelTecmis, Priority.high);
      default:
        return (_channelInfo, Priority.low);
    }
  }

  /// Show a properly styled notification for one message: themed color,
  /// app-logo large icon, BigText so long Markdown bodies are readable
  /// (markdown syntax stripped to plain text for the shade view).
  static Future<void> notifyItem(MonitorItem item) async {
    final (channel, priority) = _channelFor(item.type);
    final id = item.id.hashCode & 0x7fffffff;
    final plain = _plainBody(item.body);
    final details = AndroidNotificationDetails(
      channel.id,
      channel.name,
      channelDescription: channel.description,
      importance: channel.importance,
      priority: priority,
      color: const Color(0xFFC0684F), // Soft Day terracotta
      largeIcon: const DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
      styleInformation: BigTextStyleInformation(
        plain.isEmpty ? '(no details)' : plain,
        htmlFormatBigText: false,
        contentTitle: item.title,
        summaryText: 'DB Monitor - ${item.type}',
      ),
      category: AndroidNotificationCategory.status,
      autoCancel: true,
    );
    await _plugin.show(
      id,
      item.title,
      plain.isEmpty ? '(no details)' : plain,
      NotificationDetails(android: details),
    );
  }

  /// Strip Markdown syntax so the notification shade reads clean text.
  static String _plainBody(String md) {
    var t = md;
    t = t.replaceAll(RegExp(r'!\[([^\]]*)\]\([^)]*\)'), r'[image: $1]');
    t = t.replaceAll(RegExp(r'\[video\]\(([^)]*)\)'), r'[video: $1]');
    t = t.replaceAll(RegExp(r'\[([^\]]*)\]\(([^)]*)\)'), r'$1 ($2)');
    t = t.replaceAll(RegExp(r'^#{1,6}\s*', multiLine: true), '');
    t = t.replaceAll('**', '').replaceAll('__', '');
    t = t.replaceAll('`', '');
    t = t.replaceAll(RegExp(r'^\s*[-*]\s+', multiLine: true), '• ');
    return t.trim();
  }
}
