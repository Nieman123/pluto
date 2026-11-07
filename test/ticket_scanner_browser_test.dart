@TestOn('browser')
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/scanner/scanner_pin_entry.dart';
import 'package:pluto/ticket_scanner_page.dart';

void main() {
  testWidgets(
    'Flutter web hides PIN entry and cannot initialize native scanning',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: ScannerPinEntry())),
      );
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Open ticket scanner'), findsNothing);
      await tester.pumpWidget(
        const MaterialApp(home: TicketScannerPage(initialPin: '12345678')),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Use the website admission scanner in your browser.'),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
