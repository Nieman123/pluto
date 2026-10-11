import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher_string.dart';
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

Future<void> openEventCheckout(String url) async {
  if (url.trim().isEmpty) return;
  final link = eventCheckoutLink(Uri.parse(url),
      origin: ticketingBaseUri(), native: !kIsWeb);
  await launchUrlString(link.toString(), webOnlyWindowName: '_blank');
}
