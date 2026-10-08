import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:pluto/src/native_back_scope.dart';

void main() {
  late GoRouter router;
  late int exits;

  setUp(() {
    exits = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'SystemNavigator.pop') exits++;
      return null;
    });
  });

  tearDown(() {
    router.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  Widget page(String name) => NativeBackScope(
        child: Scaffold(body: Center(child: Text(name))),
      );

  Future<void> start(WidgetTester tester, String initialLocation) async {
    router = GoRouter(initialLocation: initialLocation, routes: <RouteBase>[
      ShellRoute(
        builder: (_, __, child) => child,
        routes: <RouteBase>[
          GoRoute(path: '/', builder: (_, __) => page('Dashboard')),
          GoRoute(path: '/tickets', builder: (_, __) => page('Tickets')),
          GoRoute(path: '/profile', builder: (_, __) => page('Profile')),
        ],
      ),
      GoRoute(path: '/admin/events', builder: (_, __) => page('Events admin')),
      GoRoute(path: '/sign-on', builder: (_, __) => page('Sign in')),
      GoRoute(path: '/sign-up', builder: (_, __) => page('Create account')),
    ]);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
  }

  for (final location in <String>['/tickets', '/admin/events']) {
    testWidgets('Back from a directly opened $location returns to dashboard',
        (tester) async {
      await start(tester, location);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Dashboard'), findsOneWidget);
      expect(exits, 0);
    });
  }

  testWidgets('Back after tab replacement returns home before exiting',
      (tester) async {
    await start(tester, '/');
    router.go('/tickets');
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Dashboard'), findsOneWidget);
    expect(exits, 0);
    await tester.binding.handlePopRoute();
    expect(exits, 1);
  });

  testWidgets('Back preserves pushed route history', (tester) async {
    await start(tester, '/tickets');
    router.push('/profile');
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Tickets'), findsOneWidget);
    expect(exits, 0);
  });

  testWidgets('Back dismisses a dialog before leaving the page',
      (tester) async {
    await start(tester, '/tickets');
    final context = tester.element(find.text('Tickets'));
    showDialog<void>(
        context: context,
        builder: (_) => const AlertDialog(title: Text('Ticket preview')));
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Ticket preview'), findsNothing);
    expect(find.text('Tickets'), findsOneWidget);
    expect(exits, 0);
  });

  testWidgets('Back from account creation returns to sign in', (tester) async {
    await start(tester, '/sign-up');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Sign in'), findsOneWidget);
    expect(exits, 0);
  });
  testWidgets('Back from a selected event stays in the wallet', (tester) async {
    await start(tester, '/tickets?event=festival');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(), '/tickets');
    expect(exits, 0);
  });
  testWidgets('Back from an order returns to orders before the ticket view',
      (tester) async {
    await start(tester, '/tickets?view=orders&order=one');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(),
        '/tickets?view=orders');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(), '/tickets');
    expect(exits, 0);
  });
}
