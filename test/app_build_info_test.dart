import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:pluto/src/app_build_info.dart';

void main() {
  testWidgets(
      'profile build information uses installed app version and build number',
      (tester) async {
    PackageInfo.setMockInitialValues(
        appName: 'Pluto Events Staging',
        packageName: 'events.pluto.app.staging',
        version: '1.2.3',
        buildNumber: '1000203',
        buildSignature: '');
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester
        .pumpWidget(const MaterialApp(home: Scaffold(body: AppBuildInfo())));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Version 1.2.3 · Build 1000203'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
