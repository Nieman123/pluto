import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/web_semantics_scroll_guard.dart';

void main() {
  testWidgets('guard creates the gesture semantics boundary used on web',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: WebSemanticsScrollGuard(
          child: SizedBox(key: Key('guarded-child')),
        ),
      ),
    );

    final Finder guard = find.byType(WebSemanticsScrollGuard);
    final Finder gestureDetector = find.descendant(
      of: guard,
      matching: find.byType(GestureDetector),
    );

    expect(gestureDetector, findsOneWidget);
    final GestureDetector widget = tester.widget(gestureDetector);
    expect(widget.behavior, HitTestBehavior.translucent);
    expect(widget.onTapDown, isNotNull);
    expect(widget.onPanUpdate, isNotNull);
    expect(find.byKey(const Key('guarded-child')), findsOneWidget);
  });

  testWidgets('guard does not prevent touch scrolling',
      (WidgetTester tester) async {
    final ScrollController controller = ScrollController();
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: SizedBox(
          height: 240,
          child: SingleChildScrollView(
            controller: controller,
            child: const WebSemanticsScrollGuard(
              child: SizedBox(height: 1000),
            ),
          ),
        ),
      ),
    );

    await tester.drag(
        find.byType(WebSemanticsScrollGuard), const Offset(0, -200));
    await tester.pumpAndSettle();

    expect(controller.offset, greaterThan(0));
  });
}
