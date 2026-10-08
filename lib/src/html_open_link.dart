import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher_string.dart';
import 'native_environment.dart';

String externalPlutoLink(String url) => !kIsWeb && !Uri.parse(url).isAbsolute
    ? ticketingBaseUri().resolve(url).toString()
    : url;

Future<void> htmlOpenLink(String url) async {
  if (url.trim().isEmpty) {
    return;
  }
  await launchUrlString(externalPlutoLink(url),
      webOnlyWindowName: '_blank',
      mode:
          kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication);
}

Future<void> htmlNavigateTo(String url) async {
  if (url.trim().isEmpty) {
    return;
  }
  await launchUrlString(externalPlutoLink(url),
      webOnlyWindowName: '_self',
      mode:
          kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication);
}
