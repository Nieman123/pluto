import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Prevents Flutter web's semantics DOM from scrolling an ancestor viewport.
///
/// Flutter issue #159680 documents a web-only interaction between an enabled
/// semantics tree, a scrollable, and nested text fields. Giving the scrollable
/// child its own gesture semantics node keeps browser input focus from moving
/// the surrounding page. Native platforms do not need the workaround.
Widget guardWebSemanticsScrollableChild({required Widget child}) {
  if (!kIsWeb) {
    return child;
  }
  return WebSemanticsScrollGuard(child: child);
}

class WebSemanticsScrollGuard extends StatelessWidget {
  const WebSemanticsScrollGuard({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      // Both otherwise-empty handlers are intentional. Together they create
      // the web semantics boundary and its required touch-action behavior.
      onTapDown: (_) {},
      onPanUpdate: (_) {},
      child: child,
    );
  }
}
