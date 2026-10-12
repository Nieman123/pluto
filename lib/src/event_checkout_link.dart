import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher_string.dart';
import '../ticketing_repository.dart';
import 'native_environment.dart';

// Only our own event pages receive the native checkout return marker.
Uri eventCheckoutLink(Uri link, {required Uri origin, required bool native}) {
  final resolved = origin.resolveUri(link);
  if (!native ||
      !['http', 'https'].contains(resolved.scheme) ||
      resolved.origin != origin.origin ||
      resolved.userInfo.isNotEmpty ||
      !RegExp(r'^/events/[^/]+$').hasMatch(resolved.path)) return resolved;
  return resolved.replace(queryParameters: {
    ...resolved.queryParameters,
    'native_app': '1',
  });
}

Future<Uri> prepareEventCheckoutLink(Uri link,
    {required Uri origin,
    required bool native,
    Future<String?> Function(String slug)? createHandoff}) async {
  final marked = eventCheckoutLink(link, origin: origin, native: native);
  if (!native ||
      !['http', 'https'].contains(marked.scheme) ||
      marked.queryParameters['native_app'] != '1' ||
      marked.origin != origin.origin ||
      marked.userInfo.isNotEmpty ||
      !RegExp(r'^/events/[^/]+$').hasMatch(marked.path) ||
      createHandoff == null) return marked;
  try {
    final handoff = await createHandoff(marked.pathSegments.last)
        .timeout(const Duration(seconds: 10));
    if (handoff != null && RegExp(r'^[a-f0-9]{64}$').hasMatch(handoff)) {
      return marked.replace(
          fragment: Uri(queryParameters: {
        'pluto_checkout': handoff,
        if (marked.fragment.isNotEmpty) 'anchor': marked.fragment,
      }).query);
    }
  } catch (_) {
    // Event browsing and manual checkout remain available if the handoff fails.
  }
  return marked;
}

Future<String> eventCheckoutUrl(String url) async {
  final origin = ticketingBaseUri();
  return (await prepareEventCheckoutLink(Uri.parse(url),
          origin: origin, native: !kIsWeb, createHandoff: (slug) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;
    final repository = TicketingRepository(
        baseUri: origin, tokenProvider: () => user.getIdToken(true));
    try {
      final result =
          await repository.request('native-checkout/create', {'slug': slug});
      // A sign-out/account switch while loading must not open the previous account.
      return FirebaseAuth.instance.currentUser?.uid == user.uid
          ? result['handoff'] as String?
          : null;
    } finally {
      repository.dispose();
    }
  }))
      .toString();
}

Future<void> openEventCheckout(String url) async {
  if (url.trim().isEmpty) return;
  await launchUrlString(await eventCheckoutUrl(url),
      webOnlyWindowName: '_blank');
}
