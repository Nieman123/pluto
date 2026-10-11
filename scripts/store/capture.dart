// Screenshot-only entrypoint. Never included by lib/main.dart or release builds.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:pluto/item_shop_page.dart';
import 'package:pluto/profile_page.dart';
import 'package:pluto/signed_in_home_page.dart';
import 'package:pluto/src/signed_in/signed_in_app_shell.dart';
import 'package:pluto/src/theme/custom_theme.dart';
import 'package:pluto/src/ticket_access_store.dart';
import 'package:pluto/tickets_page.dart';

final control = IOClient();
final controlUri = Uri.parse('http://127.0.0.1:4174');

// Redirect only the screenshot app's repository requests into the local demo.
// Public native configuration remains intact; no production endpoint is called.
class CaptureClient extends http.BaseClient {
  final http.Client _local = IOClient();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request.url.origin != 'https://pluto-staging-92eb7.web.app') {
      throw StateError('Screenshot HTTP blocked: ${request.url.origin}');
    }
    final forwarded = http.Request(request.method,
        request.url.replace(scheme: 'http', host: '127.0.0.1', port: 4173))
      ..headers.addAll(request.headers)
      ..bodyBytes = await request.finalize().toBytes();
    return _local.send(forwarded);
  }

  @override
  void close() => _local.close();
}

Future<void> main() => http.runWithClient(_startApp, CaptureClient.new);

Future<void> _startApp() async {
  if (!kDebugMode || !Platform.isIOS) {
    throw StateError('Store captures require a debug iOS simulator build.');
  }
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await ticketAccessInitialize();
  } catch (error) {
    debugPrint('Simulator persistent ticket storage unavailable: $error');
  }
  await Firebase.initializeApp(
      options: const FirebaseOptions(
          apiKey: 'AIzaSy000000000000000000000000000000000',
          appId: '1:123:ios:abcdef',
          messagingSenderId: '123',
          projectId: 'demo-pluto-ticketing',
          storageBucket: 'demo-pluto-ticketing.appspot.com',
          iosBundleId: 'events.pluto.app.staging'));
  await FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(false);
  await FirebaseAuth.instance.useAuthEmulator('127.0.0.1', 9095);
  FirebaseFirestore.instance.useFirestoreEmulator('127.0.0.1', 8185);
  await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: 'alex@pluto-demo.invalid',
      password: 'Local-store-screenshot-2026!');
  runApp(const CaptureApp());
}

class CaptureApp extends StatefulWidget {
  const CaptureApp({super.key});
  @override
  State<CaptureApp> createState() => _CaptureAppState();
}

class _CaptureAppState extends State<CaptureApp> {
  final _image = GlobalKey();
  late final GoRouter _router;
  Size _size = const Size(440, 956);
  double _scale = 3;
  Timer? _timer;
  bool _busy = false;
  String _last = '';
  final List<String> _errors = [];

  @override
  void initState() {
    super.initState();
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      _errors.add(details.exceptionAsString());
      previous?.call(details);
    };
    _router = GoRouter(routes: [
      ShellRoute(
          builder: (context, state, child) => AuthAwareSignedInAppShell(
              currentPath: state.uri.path, child: child),
          routes: [
            GoRoute(
                path: '/',
                builder: (context, state) =>
                    SignedInHomePage(user: FirebaseAuth.instance.currentUser!)),
            GoRoute(
                path: '/tickets',
                builder: (context, state) => TicketsPage(uri: state.uri)),
            GoRoute(
                path: '/shop',
                builder: (context, state) => const ItemShopPage()),
            GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfilePage()),
          ]),
    ]);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _poll());
  }

  void _visit(void Function(Element) visitor) {
    void walk(Element element) {
      visitor(element);
      element.visitChildElements(walk);
    }

    final root = _image.currentContext;
    if (root is Element) walk(root);
  }

  Future<void> _poll() async {
    if (_busy) return;
    _busy = true;
    String? id;
    try {
      final response = await control.get(controlUri.resolve('/command'));
      final command = jsonDecode(response.body) as Map<String, dynamic>;
      id = command['id'] as String?;
      if (id == null || id == _last) return;
      _last = id;
      _errors.clear();
      final navigator = _router.routerDelegate.navigatorKey.currentState;
      while (navigator?.canPop() ?? false) {
        navigator!.pop();
      }
      setState(() {
        _size = Size((command['width'] as num) / (command['scale'] as num),
            (command['height'] as num) / (command['scale'] as num));
        _scale = (command['scale'] as num).toDouble();
      });
      _router.go(command['route'] as String);
      await Future<void>.delayed(const Duration(seconds: 8));
      if (command['scroll'] != null) {
        ScrollPosition? position;
        _visit((element) {
          if (element is StatefulElement && element.state is ScrollableState) {
            final candidate = (element.state as ScrollableState).position;
            if (candidate.axis == Axis.vertical) position ??= candidate;
          }
        });
        if (position != null) {
          position!.jumpTo(command['scroll'] == 'bottom'
              ? position!.maxScrollExtent
              : (command['scroll'] as num)
                  .toDouble()
                  .clamp(0, position!.maxScrollExtent));
        }
      }
      if (command['qr'] == true) {
        VoidCallback? tap;
        void find(Element element, bool qr) {
          final widget = element.widget;
          final inside = qr ||
              widget is Semantics &&
                  widget.properties.hint == 'Tap to enlarge the QR code';
          if (inside && widget is InkWell) tap ??= widget.onTap;
          element.visitChildElements((child) => find(child, inside));
        }

        find(_image.currentContext! as Element, false);
        if (tap == null) throw StateError('Admission QR was not ready.');
        tap!();
      }
      await Future<void>.delayed(const Duration(seconds: 3));
      if (_errors.isNotEmpty) throw StateError(_errors.join('\n'));
      final texts = <String>[];
      _visit((element) {
        final widget = element.widget;
        if (widget is Text)
          texts.add(widget.data ?? widget.textSpan?.toPlainText() ?? '');
      });
      if (!texts.any((text) => text.contains(command['expected'] as String))) {
        throw StateError(
            'Expected content missing: ${command['expected']}; ${texts.join(" | ")}');
      }
      final boundary =
          _image.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      await WidgetsBinding.instance.endOfFrame;
      final image = await boundary.toImage(pixelRatio: _scale);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      final saved = await control.post(controlUri.resolve('/image?id=$id'),
          headers: {'Content-Type': 'image/png'},
          body: bytes!.buffer.asUint8List());
      if (saved.statusCode != 200) throw StateError(saved.body);
    } catch (error, stack) {
      debugPrint('Capture failure: $error\n$stack');
      if (id != null) {
        await control.post(controlUri.resolve('/failure'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'id': id, 'error': error.toString()}));
      }
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: CustomTheme.darkTheme,
      routerConfig: _router,
      builder: (context, child) => OverflowBox(
          alignment: Alignment.topLeft,
          minWidth: _size.width,
          maxWidth: _size.width,
          minHeight: _size.height,
          maxHeight: _size.height,
          child: RepaintBoundary(
              key: _image,
              child: SizedBox(
                  width: _size.width,
                  height: _size.height,
                  child: MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                          size: _size,
                          devicePixelRatio: _scale,
                          padding: EdgeInsets.zero,
                          viewPadding: EdgeInsets.zero,
                          viewInsets: EdgeInsets.zero),
                      child: child!)))));

  @override
  void dispose() {
    _timer?.cancel();
    _router.dispose();
    super.dispose();
  }
}
