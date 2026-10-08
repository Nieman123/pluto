import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'native_environment.dart';

Uri? nativeAppRoute(Uri link, {required Uri origin}) {
  if (link.scheme != 'https' ||
      link.origin != origin.origin ||
      link.userInfo.isNotEmpty ||
      !['/app/tickets', '/app/profile'].contains(link.path)) return null;
  return Uri(
      path: link.path.substring(4),
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
