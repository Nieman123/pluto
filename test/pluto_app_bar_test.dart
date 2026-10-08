import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/nav_bar/pluto_app_bar.dart';

void main() {
  Future<void> pumpHeader(
    WidgetTester tester, {
    required FakeViewPadding padding,
    Color background = const Color(0xFF181818),
    VoidCallback? onMenu,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.padding = padding;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData(scaffoldBackgroundColor: background),
      home: Scaffold(
        appBar: PlutoAppBar(
          child: Row(children: <Widget>[
            const Icon(Icons.confirmation_number, key: Key('logo')),
            const Spacer(),
            IconButton(
              key: const Key('menu'),
              onPressed: onMenu ?? () {},
              icon: const Icon(Icons.menu),
            ),
          ]),
        ),
        body: const SizedBox.expand(key: Key('body')),
      ),
    ));
  }

  testWidgets('status bar inset keeps header controls visible and tappable',
      (WidgetTester tester) async {
    bool opened = false;
    await pumpHeader(tester,
        padding: const FakeViewPadding(top: 48), onMenu: () => opened = true);

    expect(tester.getTopLeft(find.byKey(const Key('menu'))).dy,
        greaterThanOrEqualTo(48));
    expect(tester.getTopLeft(find.byKey(const Key('logo'))).dy,
        greaterThanOrEqualTo(48));
    expect(tester.getTopLeft(find.byKey(const Key('body'))).dy, 48 + 64);
    await tester.tap(find.byKey(const Key('menu')));
    expect(opened, isTrue);
    final style = tester
        .widget<AnnotatedRegion<SystemUiOverlayStyle>>(
            find.byType(AnnotatedRegion<SystemUiOverlayStyle>).first)
        .value;
    expect(style.statusBarIconBrightness, Brightness.light);
  });

  testWidgets('landscape cutouts protect both ends of the header',
      (WidgetTester tester) async {
    await pumpHeader(tester,
        padding: const FakeViewPadding(left: 44, right: 32));
    expect(tester.getTopLeft(find.byKey(const Key('logo'))).dx, 44);
    expect(tester.getBottomRight(find.byKey(const Key('menu'))).dx,
        tester.view.physicalSize.width - 32);
    expect(tester.getTopLeft(find.byKey(const Key('body'))).dy, 64);
  });

  testWidgets('zero-inset web header retains height and light theme contrast',
      (WidgetTester tester) async {
    await pumpHeader(tester,
        padding: FakeViewPadding.zero, background: Colors.white);
    expect(tester.getTopLeft(find.byKey(const Key('body'))).dy, 64);
    final style = tester
        .widget<AnnotatedRegion<SystemUiOverlayStyle>>(
            find.byType(AnnotatedRegion<SystemUiOverlayStyle>).first)
        .value;
    expect(style.statusBarIconBrightness, Brightness.dark);
  });
}
