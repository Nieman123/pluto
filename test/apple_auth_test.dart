import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/apple_auth.dart';

void main() {
  test('Apple sign-in is offered only on the iOS app', () {
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      debugDefaultTargetPlatformOverride = platform;
      expect(offersAppleSignIn, platform == TargetPlatform.iOS);
    }
  });
  testWidgets(
      'Apple sign-in has an accessible label and cannot be tapped while busy',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: AppleSignInButton(onPressed: () => calls++))));
    await tester.tap(find.text('Sign in with Apple'));
    expect(calls, 1);
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: AppleSignInButton(onPressed: null))));
    await tester.tap(find.text('Sign in with Apple'));
    expect(calls, 1);
  });
}
