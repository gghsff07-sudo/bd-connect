/// "Soft Day" theme — warm cream + terracotta, from the user's reference image.
/// Light mode only, soft shadows, very rounded cards. Used by app, chat
/// bubbles, notifications and the home-screen widget so everything matches.
library;

import 'package:flutter/material.dart';

class AppColors {
  // Backgrounds
  static const Color bg = Color(0xFFF0EAE2); // page background (warm cream)
  static const Color card = Color(0xFFF8F4EE); // card surface
  static const Color cardAlt = Color(0xFFFAF6F0);
  static const Color chatMe = Color(0xFFE5CFC5); // own bubble (terracotta tint)

  // Brand accent (terracotta / clay)
  static const Color accent = Color(0xFFC0684F);
  static const Color accentDark = Color(0xFFB85C42);
  static const Color accentSoft = Color(0xFFF3DDD5); // light accent fill

  // Text
  static const Color heading = Color(0xFF2E2A26); // warm charcoal
  static const Color body = Color(0xFF3A3530);
  static const Color muted = Color(0xFF8A8078); // warm gray
  static const Color onAccent = Colors.white;
  static const Color disabled = Color(0xFFC9C0B5);

  // Toggles / tracks
  static const Color trackOff = Color(0xFFD8D0C6);

  // Type status colors (softened to fit the palette)
  static const Color alert = Color(0xFFC0574F); // clay red
  static const Color warning = Color(0xFFC98A3D); // warm amber
  static const Color info = Color(0xFF7A8FA6); // soft slate blue
  static const Color success = Color(0xFF7FA37A); // sage green
  static const Color tecmis = Color(0xFF6B5B95); // muted plum (university notices)

  static Color typeColor(String type) {
    switch (type) {
      case 'alert':
        return alert;
      case 'warning':
        return warning;
      case 'success':
        return success;
      case 'tecmis':
        return tecmis;
      default:
        return info;
    }
  }
}

/// Soft card with the theme's signature warm shadow + big radius.
class SoftCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  const SoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x2E96826E), // warm shadow rgba(150,130,110,0.18)
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}
