import 'package:flutter_web_plugins/flutter_web_plugins.dart';

void configureApp() {
  // Recovery and accepted-transfer capabilities travel in fragments, keeping
  // them out of server request logs and referrers.
  setUrlStrategy(PathUrlStrategy(const BrowserPlatformLocation(), true));
}
