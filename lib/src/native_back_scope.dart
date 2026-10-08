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
    final uri = GoRouterState.of(context).uri;
    final path = uri.path;
    final isRoot = path == '/' || path == '/sign-on';
    return PopScope<Object?>(
      canPop: router.canPop() || isRoot,
      onPopInvokedWithResult: (didPop, _) {
        // Preserve real route history and any child route's own pop guard.
        if (didPop || isRoot || router.canPop()) return;
        if (path == '/tickets' &&
            (uri.queryParameters.isNotEmpty || uri.hasFragment)) {
          router.go(uri.queryParameters['order'] != null &&
                  uri.queryParameters['view'] == 'orders'
              ? '/tickets?view=orders'
              : '/tickets');
        } else
          router.go(path == '/sign-up' ? '/sign-on' : '/');
      },
      child: child,
    );
  }
}
