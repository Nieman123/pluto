import 'package:url_launcher/url_launcher_string.dart';

Future<void> htmlOpenLink(String url) async {
  if (url.trim().isEmpty) {
    return;
  }
  await launchUrlString(url, webOnlyWindowName: '_blank');
}
