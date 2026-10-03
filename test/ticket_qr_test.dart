import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_qr.dart';

void main() {
  testWidgets(
      'signed ticket renders at mobile and desktop sizes for decoder checks',
      (tester) async {
    final fixture =
        jsonDecode(File('test/fixtures/ticket-qr.json').readAsStringSync())
            as Map<String, dynamic>;
    for (final width in <double>[264, 340]) {
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
                              label: 'Admission QR')))))));
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
}
