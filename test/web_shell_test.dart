import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('web shell prevents the browser root from scrolling', () {
    final String indexHtml = File('web/index.html').readAsStringSync();
    final String flutterBootstrap =
        File('web/flutter_bootstrap.js').readAsStringSync();

    expect(
      indexHtml,
      contains(
        RegExp(
          r'html,\s*body\s*\{.*overflow:\s*clip;',
          dotAll: true,
        ),
      ),
    );
    expect(flutterBootstrap, contains('initializeEngine()'));
    expect(flutterBootstrap, isNot(contains('hostElement')));
  });
}
