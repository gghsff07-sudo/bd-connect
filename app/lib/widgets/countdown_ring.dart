import 'dart:async';
import 'package:flutter/material.dart';
import '../config/theme.dart';

/// Visible 15-minute countdown with a terracotta progress ring,
/// styled like the reference image's focus-timer ring.
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

  @override
  void initState() {
    super.initState();
    _remaining = _initialRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
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

  @override
  Widget build(BuildContext context) {
    final progress = 1.0 - (_remaining.inSeconds / widget.interval.inSeconds);
    return SizedBox(
      width: 54,
      height: 54,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 54,
            height: 54,
            child: CircularProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              strokeWidth: 4,
              backgroundColor: AppColors.trackOff,
              valueColor: const AlwaysStoppedAnimation(AppColors.accent),
              strokeCap: StrokeCap.round,
            ),
          ),
          Text(
            _label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.heading,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
