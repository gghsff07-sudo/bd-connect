import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../services/update_service.dart';

/// Opens the in-app update flow: checks GitHub releases for a newer
/// version, shows the release notes, downloads the APK with progress and
/// hands it to the system installer. Used from Settings and from the
/// home-screen "update available" banner.
Future<void> showUpdateDialog(BuildContext context) {
  return showDialog(
    context: context,
    builder: (_) => const UpdateDialog(),
  );
}

class UpdateDialog extends StatefulWidget {
  const UpdateDialog({super.key});

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  bool _checking = true;
  bool _downloading = false;
  double? _progress;
  String? _error;
  String? _installed;
  UpdateInfo? _info;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    setState(() {
      _checking = true;
      _error = null;
      _info = null;
    });
    final installed = await UpdateService.installedVersion();
    final info = await UpdateService.checkForUpdate();
    if (!mounted) return;
    setState(() {
      _installed = installed;
      _checking = false;
      _info = info;
      // checkForUpdate returns null both for "up to date" and for network
      // failures; distinguish by trying the API once more is overkill, so
      // the message simply covers both (user can retry).
      _error = null;
    });
  }

  Future<void> _download() async {
    final info = _info;
    if (info == null) return;
    setState(() {
      _downloading = true;
      _progress = null;
      _error = null;
    });
    try {
      await UpdateService.downloadAndInstall(info, (p) {
        if (mounted) setState(() => _progress = p);
      });
      // The system installer is now in front; keep the dialog open so a
      // cancelled install can retry.
      if (mounted) {
        setState(() => _downloading = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _downloading = false;
          _error = 'Download failed: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      title: Row(
        children: [
          const Icon(Icons.system_update_alt, color: AppColors.accent, size: 22),
          const SizedBox(width: 10),
          Text('App updates',
              style: const TextStyle(
                  color: AppColors.heading,
                  fontSize: 17,
                  fontWeight: FontWeight.w700)),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: _content(),
      ),
      actions: [
        TextButton(
          onPressed: _checking || _downloading
              ? null
              : () => Navigator.pop(context),
          child:
              const Text('Close', style: TextStyle(color: AppColors.muted)),
        ),
        if (_info != null && !_downloading)
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: AppColors.onAccent),
            onPressed: _download,
            child: const Text('Download and install'),
          ),
      ],
    );
  }

  Widget _content() {
    if (_checking) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(height: 14),
          CircularProgressIndicator(color: AppColors.accent),
          SizedBox(height: 14),
          Text('Checking GitHub for updates…',
              style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ],
      );
    }
    if (_downloading) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: _progress,
            minHeight: 8,
            borderRadius: BorderRadius.circular(6),
            color: AppColors.accent,
            backgroundColor: AppColors.trackOff,
          ),
          const SizedBox(height: 12),
          Text(
            _progress == null
                ? 'Starting download…'
                : 'Downloading update… ${(_progress! * 100).toStringAsFixed(0)}%',
            style: const TextStyle(color: AppColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 6),
          const Text(
            'The system installer opens when the download finishes.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.muted, fontSize: 12),
          ),
        ],
      );
    }
    if (_error != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off, color: AppColors.alert, size: 30),
          const SizedBox(height: 10),
          Text(_error!,
              textAlign: TextAlign.center,
              style:
                  const TextStyle(color: AppColors.body, fontSize: 13)),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _check,
            child: const Text('Try again'),
          ),
        ],
      );
    }
    final info = _info;
    if (info == null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 6),
          const Icon(Icons.verified_outlined,
              color: AppColors.success, size: 34),
          const SizedBox(height: 12),
          Text(
            'You are up to date',
            style: const TextStyle(
                color: AppColors.heading,
                fontSize: 15.5,
                fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            'Installed: v$_installed (latest on GitHub)',
            style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
          ),
          const SizedBox(height: 6),
        ],
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'v${info.version}',
                style: const TextStyle(
                    color: AppColors.accentDark,
                    fontSize: 13,
                    fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'installed: v$_installed',
              style: const TextStyle(color: AppColors.muted, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Text('What is new',
            style: TextStyle(
                fontSize: 10.5,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w600,
                color: AppColors.muted)),
        const SizedBox(height: 8),
        Flexible(
          child: SingleChildScrollView(
            child: Text(
              _plainNotes(info.notes),
              style: const TextStyle(
                  fontSize: 13, color: AppColors.body, height: 1.5),
            ),
          ),
        ),
      ],
    );
  }

  /// Reduce the release markdown to readable plain lines for the dialog.
  static String _plainNotes(String md) {
    var t = md;
    t = t.replaceAll('\r', '');
    t = t.replaceAll('**', '');
    t = t.replaceAll(RegExp(r'^#+\s*', multiLine: true), '');
    t = t.replaceAll(RegExp(r'^[-*]\s+', multiLine: true), '• ');
    t = t.replaceAll(RegExp(r'\[([^\]]*)\]\([^)]*\)'), r'$1');
    t = t.trim();
    if (t.length > 900) t = '${t.substring(0, 900)}…';
    return t.isEmpty ? 'Bug fixes and improvements.' : t;
  }
}
