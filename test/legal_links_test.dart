import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/legal_links.dart';

void main() {
  testWidgets('policy and deletion links remain usable on a narrow profile',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final opened = <String>[];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: LegalLinks(
      includeDeletion: true,
      openLink: (path) async {
        opened.add(path);
      },
    ))));
    for (final label in [
      'Privacy Policy',
      'Terms of Use',
      'Request account deletion'
    ]) {
      await tester.tap(find.text(label));
      await tester.pump();
    }
    expect(opened, ['/privacy', '/terms', '/delete-account']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed policy launch offers contact help', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: LegalLinks(
      openLink: (_) async {
        throw StateError('no browser');
      },
    ))));
    await tester.tap(find.text('Privacy Policy'));
    await tester.pump();
    expect(find.textContaining('contact@pluto.events'), findsOneWidget);
    expect(find.text('Request account deletion'), findsNothing);
  });
}
