import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_qr.dart';

void main() {
  testWidgets(
      'signed ticket renders at mobile and desktop sizes for decoder checks',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final fixture =
        jsonDecode(File('test/fixtures/ticket-qr.json').readAsStringSync())
            as Map<String, dynamic>;
    for (final width in <double>[264, 340, 640]) {
      final key = GlobalKey();
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: Center(
                  child: RepaintBoundary(
                      key: key,
                      child: SizedBox(
                          width: width,
                          child: TicketQr(
                              data: fixture['qr'] as String,
                              label: 'Admission QR',
                              maxWidth: width)))))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final boundary =
          key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      for (final ratio in <double>[1, 2]) {
        await tester.runAsync(() async {
          final image = await boundary.toImage(pixelRatio: ratio);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await Directory('tmp').create(recursive: true);
          await File('tmp/qr-${width.toInt()}-${ratio.toInt()}.png')
              .writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
    }
  });
  testWidgets(
      'tapping the QR opens an animated larger code and restores the page on close',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body:
                ZoomableTicketQr(data: 'PLUTO-TEST', label: 'Admission QR'))));
    final original = tester
        .getSize(find.descendant(
            of: find.byType(TicketQr), matching: find.byType(CustomPaint)))
        .width;
    await tester.tap(find.byType(InkWell));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    expect(find.byType(ScaleTransition), findsWidgets);
    await tester.pumpAndSettle();
    final enlarged = find.byWidgetPredicate(
        (w) => w is TicketQr && w.label == 'Enlarged Admission QR');
    expect(
        tester
            .getSize(find.descendant(
                of: enlarged, matching: find.byType(CustomPaint)))
            .width,
        greaterThan(original));
    expect(find.text('Enlarge QR'), findsNothing);
    await tester.tap(find.byTooltip('Close enlarged QR'));
    await tester.pumpAndSettle();
    expect(find.byType(TicketQr), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(enlarged, findsOneWidget,
        reason: 'keyboard users can enlarge the QR');
  });
  testWidgets('enlarged QR respects small screens and reduced motion',
      (tester) async {
    tester.view.physicalSize = const Size(390, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: child!),
        home: const Scaffold(
            body:
                ZoomableTicketQr(data: 'PLUTO-TEST', label: 'Admission QR'))));
    await tester.tap(find.byType(InkWell));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Close enlarged QR'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();
    expect(find.byType(TicketQr), findsOneWidget);
  });
}
