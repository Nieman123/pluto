import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher_string.dart';
import 'event_checkout_link.dart';
import 'native_environment.dart';

String externalPlutoLink(String url) => kIsWeb
    ? url
    : eventCheckoutLink(Uri.parse(url),
            origin: ticketingBaseUri(), native: true)
        .toString();

Future<void> htmlOpenLink(String url) async {
  if (url.trim().isEmpty) {
    return;
  }
  await launchUrlString(kIsWeb ? url : await eventCheckoutUrl(url),
      webOnlyWindowName: '_blank',
      mode:
          kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication);
}

Future<void> htmlNavigateTo(String url) async {
  if (url.trim().isEmpty) {
    return;
  }
  await launchUrlString(kIsWeb ? url : await eventCheckoutUrl(url),
      webOnlyWindowName: '_self',
      mode:
          kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication);
}
