import 'package:flutter/material.dart';

/// Shared header frame: AppBar reserves system insets and sets status-bar contrast.
class PlutoAppBar extends StatelessWidget implements PreferredSizeWidget {
  const PlutoAppBar({super.key, required this.child});

  static const double toolbarHeight = 64;
  final Widget child;

  @override
  Size get preferredSize => const Size.fromHeight(toolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: false,
      toolbarHeight: toolbarHeight,
      titleSpacing: 0,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      foregroundColor: Theme.of(context).primaryColor,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      title: child,
    );
  }
}
