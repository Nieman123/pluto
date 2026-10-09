import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:pluto/src/nav_bar/nav_bar.dart';
import 'package:pluto/src/signed_in/signed_in_app_shell.dart';
import 'package:pluto/src/theme/custom_theme.dart';
import 'package:pluto/src/theme/pluto_ui.dart';

void main() {
  test('signed-in overflow menu keeps utilities and removes duplicate tabs',
      () {
    final labels = NavBar.compactSignedInActions(
            isAdmin: true, showHomeSectionSubItems: false)
        .map((action) => action.label)
        .toList();
    expect(labels,
        containsAll(['Go to Website', 'Scan QR Code', 'Account', 'Admin']));
    for (final label in ['Dashboard', 'Tickets', 'Rewards Shop', 'Profile']) {
      expect(labels, isNot(contains(label)));
    }
    expect(
        NavBar.compactSignedInActions(
                isAdmin: false, showHomeSectionSubItems: false)
            .any((action) => action.label == 'Admin'),
        isFalse);
  });

  test('website shortcut keeps the same target with a platform-specific label',
      () {
    final web =
        NavBar.compactHomeActions(showSectionSubItems: false, isWeb: true)
            .single;
    final native =
        NavBar.compactHomeActions(showSectionSubItems: false, isWeb: false)
            .single;
    expect(web.label, 'Home');
    expect(native.label, 'Go to Website');
    expect(web.sectionIndex, 0);
    expect(native.sectionIndex, web.sectionIndex);
  });

  testWidgets('mobile bottom tabs route correctly and stay above system insets',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(bottom: 34);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    final router = GoRouter(routes: [
      for (final path in ['/', '/shop', '/tickets', '/profile'])
        GoRoute(
            path: path,
            builder: (context, state) => Scaffold(
                  body: Column(children: [
                    Expanded(
                        child: Center(child: Text('Screen ${state.uri.path}'))),
                    PlutoBottomNavigation(
                        selectedTab: SignedInAppTabX.fromPath(state.uri.path)),
                  ]),
                )),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(
        MaterialApp.router(theme: CustomTheme.darkTheme, routerConfig: router));
    await tester.pumpAndSettle();
    expect(find.text('Dashboard'), findsNothing);
    for (final entry in {
      'Tickets': '/tickets',
      'Rewards': '/shop',
      'Profile': '/profile',
      'Home': '/'
    }.entries) {
      await tester.tap(find.text(entry.key));
      await tester.pumpAndSettle();
      expect(find.text('Screen ${entry.value}'), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(tester.getBottomRight(find.byType(NavigationBar)).dy,
          lessThanOrEqualTo(844 - 34));
    }
  });

  testWidgets(
      'entrance effects honor reduced motion and settle without a ticker',
      (tester) async {
    Widget frame(bool reduced) => MaterialApp(
            home: MediaQuery(
          data: MediaQueryData(disableAnimations: reduced),
          child: const Scaffold(
              body: PlutoEntrance(child: Text('Ready at the door'))),
        ));
    await tester.pumpWidget(frame(true));
    expect(find.byType(TweenAnimationBuilder<double>), findsNothing);
    expect(find.text('Ready at the door'), findsOneWidget);
    await tester.pumpWidget(frame(false));
    await tester.pumpAndSettle();
    expect(tester.hasRunningAnimations, isFalse);
    expect(tester.takeException(), isNull);
  });
}
