import 'package:flutter/material.dart';
import '../config/theme.dart';

/// Banner shown while the Android 13+ notification permission (or our
/// in-theme explainer) is relevant: soft card, terracotta button.
class NotificationPermissionCard extends StatelessWidget {
  final bool granted;
  final VoidCallback onRequest;

  const NotificationPermissionCard(
      {super.key, required this.granted, required this.onRequest});

  @override
  Widget build(BuildContext context) {
    if (granted) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.notifications_active_outlined,
                  size: 20, color: AppColors.accentDark),
              SizedBox(width: 8),
              Text('NOTIFICATIONS ARE OFF',
                  style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 1.4,
                      fontWeight: FontWeight.w700,
                      color: AppColors.accentDark)),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'DB Monitor needs notification permission to alert you when the '
            'database changes. Alerts ring and vibrate; info updates are silent.',
            style: TextStyle(
                fontSize: 12.5, color: AppColors.accentDark, height: 1.4),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 38,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: AppColors.onAccent,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(19)),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onPressed: onRequest,
              icon: const Icon(Icons.notifications_active, size: 17),
              label: const Text('Allow notifications',
                  style: TextStyle(fontSize: 13)),
            ),
          ),
        ],
      ),
    );
  }
}
