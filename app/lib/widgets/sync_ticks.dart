import 'package:flutter/material.dart';
import '../config/theme.dart';

/// WhatsApp-style delivery ticks for the sync state:
///   local   - hourglass (just composed)
///   queued  - clock (waiting for network)
///   sending - single tick (in flight)
///   synced  - double tick (stored in the cloud)
///   failed  - warning (gave up after retries)
class SyncTicks extends StatelessWidget {
  final String state; // DeliveryState.name
  final Color color;

  const SyncTicks({super.key, required this.state, this.color = Colors.white});

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case 'local':
      case 'queued':
        return Icon(Icons.access_time,
            size: 15, color: color.withOpacity(0.85));
      case 'sending':
        return Icon(Icons.done, size: 15, color: color.withOpacity(0.85));
      case 'failed':
        return const Icon(Icons.error_outline,
            size: 15, color: AppColors.alert);
      case 'synced':
      default:
        return Icon(Icons.done_all, size: 15, color: color.withOpacity(0.85));
    }
  }
}

/// Small rounded label with the message type (ALERT / WARNING / ...).
class TypeChip extends StatelessWidget {
  final String type;
  const TypeChip({super.key, required this.type});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.typeColor(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Text(
        type.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.8,
          color: color,
        ),
      ),
    );
  }
}
