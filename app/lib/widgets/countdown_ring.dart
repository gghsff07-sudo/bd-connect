import 'dart:async';
import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/storage_service.dart';

/// Visible 15-minute countdown with a terracotta progress ring,
/// styled like the reference image's focus-timer ring.
///
/// The size follows the user's widget-ring setting (s/m/l) so the in-app
/// card and the home-screen widget feel like one system; when the setting
/// is 'off' the ring is replaced by a small pill with the remaining time,
/// keeping the countdown without the circle.
class CountdownRing extends StatefulWidget {
  final Duration interval;
  final VoidCallback onElapsed;
  final DateTime? lastPoll;

  const CountdownRing({
    super.key,
    this.interval = const Duration(minutes: 15),
    required this.onElapsed,
    this.lastPoll,
  });

  @override
  State<CountdownRing> createState() => _CountdownRingState();
}

class _CountdownRingState extends State<CountdownRing> {
  late Duration _remaining;
  Timer? _timer;
  String _size = 's';

  @override
  void initState() {
    super.initState();
    _remaining = _initialRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    _loadSize();
  }

  Future<void> _loadSize() async {
    final v = await StorageService().getWidgetSize();
    if (mounted) setState(() => _size = v);
  }

  Duration _initialRemaining() {
    // If we know the last sync, count from there so the ring is honest
    // across app re-opens; otherwise start a full interval.
    if (widget.lastPoll != null) {
      final elapsed = DateTime.now().difference(widget.lastPoll!);
      if (elapsed.isNegative || elapsed >= widget.interval) {
        return const Duration(seconds: 15);
      }
      return widget.interval - elapsed;
    }
    return widget.interval;
  }

  void _tick() {
    if (!mounted) return;
    if (_remaining <= const Duration(seconds: 1)) {
      setState(() => _remaining = widget.interval);
      widget.onElapsed();
    } else {
      setState(() => _remaining -= const Duration(seconds: 1));
    }
  }

  @override
  void didUpdateWidget(covariant CountdownRing old) {
    super.didUpdateWidget(old);
    // When a sync happens, restart the countdown.
    if (widget.lastPoll != old.lastPoll) {
      setState(() => _remaining = widget.interval);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _label {
    final m = _remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = _remaining.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  // Ring diameters per setting; matches the widget layouts (40/48/58dp).
  static const _sizes = {'s': 40.0, 'm': 48.0, 'l': 58.0};

  @override
  Widget build(BuildContext context) {
    // 'off' = ring hidden: compact time pill keeps the countdown readable.
    if (_size == 'off') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.accentSoft,
          borderRadius: BorderRadius.circular(13),
        ),
        child: Text(
          _label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.accentDark,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      );
    }

    final d = _sizes[_size] ?? 40.0;
    final progress =
        1.0 - (_remaining.inSeconds / widget.interval.inSeconds);
    final fontSize = d < 46 ? 11.0 : (d < 54 ? 12.5 : 14.0);
    return SizedBox(
      width: d,
      height: d,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: d,
            height: d,
            child: CircularProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              strokeWidth: d < 46 ? 3.4 : 4,
              backgroundColor: AppColors.trackOff,
              valueColor:
                  const AlwaysStoppedAnimation(AppColors.accent),
              strokeCap: StrokeCap.round,
            ),
          ),
          Text(
            _label,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              color: AppColors.heading,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
