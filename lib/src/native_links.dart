import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'native_environment.dart';

Uri? nativeAppRoute(Uri link, {required Uri origin}) {
  final checkoutScheme = switch (origin.host) {
    'pluto.events' => 'events.pluto.app',
    'pluto-staging-92eb7.web.app' => 'events.pluto.app.staging',
    _ => null,
  };
  // The browser handoff contains only a public order ID. Ticket access still
  // requires the signed-in account; never accept capabilities on this scheme.
  if (checkoutScheme != null && link.scheme == checkoutScheme) {
    if (link.host != 'tickets' ||
        link.path.isNotEmpty ||
        link.hasPort ||
        link.userInfo.isNotEmpty ||
        link.hasFragment ||
        (link.hasQuery &&
            !RegExp(r'^order=[a-f0-9]{64}$').hasMatch(link.query))) return null;
    return Uri(path: '/tickets', query: link.hasQuery ? link.query : null);
  }
  const routes = <String, String>{
    '/app': '/',
    '/app/': '/',
    '/app/tickets': '/tickets',
    '/app/profile': '/profile',
  };
  if (link.scheme != 'https' ||
      link.origin != origin.origin ||
      link.userInfo.isNotEmpty ||
      !routes.containsKey(link.path)) return null;
  return Uri(
      path: routes[link.path],
      query: link.hasQuery ? link.query : null,
      fragment: link.hasFragment ? link.fragment : null);
}

class NativeLinks {
  StreamSubscription<Uri>? _subscription;
  GoRouter? _router;
  Uri? _pending;

  Future<void> capture() async {
    if (kIsWeb) return;
    final links = AppLinks();
    _subscription = links.uriLinkStream.listen(_receive, onError: (_) {
      // A malformed platform link must never log its recovery capability.
    });
    final initial = await links.getInitialLink();
    if (initial != null) _receive(initial);
  }

  void _receive(Uri link) {
    final route = nativeAppRoute(link, origin: ticketingBaseUri());
    if (route == null) return;
    if (link.scheme != 'https') {
      unawaited(closeInAppWebView().catchError((_) {}));
    }
    if (_router == null)
      _pending = route;
    else
      _router!.go(route.toString());
  }

  void bind(GoRouter router) {
    _router = router;
    final pending = _pending;
    _pending = null;
    if (pending != null) router.go(pending.toString());
  }

  void dispose() {
    _subscription?.cancel();
    _router = null;
  }
}

final nativeLinks = NativeLinks();
