import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Tab navigation replaces routes, so native Back needs a dashboard fallback.
class NativeBackScope extends StatelessWidget {
  const NativeBackScope({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) return child;

    final router = GoRouter.of(context);
    final path = GoRouterState.of(context).uri.path;
    final isRoot = path == '/' || path == '/sign-on';
    return PopScope<Object?>(
      canPop: router.canPop() || isRoot,
      onPopInvokedWithResult: (didPop, _) {
        // Preserve real route history and any child route's own pop guard.
        if (didPop || isRoot || router.canPop()) return;
        router.go(path == '/sign-up' ? '/sign-on' : '/');
      },
      child: child,
    );
  }
}
