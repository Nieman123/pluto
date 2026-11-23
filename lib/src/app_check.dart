import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart';

import 'native_environment.dart';

/// Production reCAPTCHA Enterprise site key for the Flutter web build. Site
/// keys are public. Staging supplies its own through PLUTO_APP_CHECK_SITE_KEY.
const String productionAppCheckSiteKey =
    '6Lc4hy4uAAAAABQQ-w23FrJoZM5h93_up4vAz6Ds';
const String _configuredSiteKey =
    String.fromEnvironment('PLUTO_APP_CHECK_SITE_KEY');

/// Debug builds use the App Check debug provider. Run once, copy the token the
/// SDK logs (or pass --dart-define=APP_CHECK_DEBUG_TOKEN=<registered token>),
/// and register it under App Check > Apps > Manage debug tokens.
const String _debugToken = String.fromEnvironment('APP_CHECK_DEBUG_TOKEN');

String appCheckWebSiteKey() => _configuredSiteKey.isNotEmpty
    ? _configuredSiteKey
    : plutoEnvironment == 'production'
        ? productionAppCheckSiteKey
        : '';

bool _active = false;

/// Paths the ticket API checks App Check tokens on
/// (functions/src/ticketing/app-check.ts).
const Set<String> appCheckPaths = <String>{
  'checkout',
  'rsvp',
  'rsvp/verification',
  'rsvp/upgrade/verification',
  'waitlist/verification',
  'waitlist/join',
  'recover',
  'native-checkout/create',
  'rewards/claim',
  'rewards/redeem',
};

/// Activates App Check after Firebase.initializeApp. Failure never stops the
/// app from starting: the server decides whether a missing token matters.
Future<void> activateAppCheck() async {
  final String siteKey = appCheckWebSiteKey();
  if (kIsWeb && siteKey.isEmpty && !kDebugMode) return;
  try {
    await FirebaseAppCheck.instance.activate(
      providerWeb: kDebugMode
          ? WebDebugProvider(
              debugToken: _debugToken.isEmpty ? null : _debugToken)
          : ReCaptchaEnterpriseProvider(siteKey),
      providerAndroid: kDebugMode
          ? AndroidDebugProvider(
              debugToken: _debugToken.isEmpty ? null : _debugToken)
          : const AndroidPlayIntegrityProvider(),
      // App Attest on supported devices, DeviceCheck where App Attest is
      // unavailable. Simulators and debug builds use the debug provider.
      providerApple: kDebugMode
          ? AppleDebugProvider(
              debugToken: _debugToken.isEmpty ? null : _debugToken)
          : const AppleAppAttestWithDeviceCheckFallbackProvider(),
    );
    _active = true;
  } catch (error) {
    debugPrint('App Check is unavailable: $error');
  }
}

/// Header for protected ticket API calls, or empty when no token is available.
Future<Map<String, String>> appCheckHeadersFor(String path) async {
  if (!_active || !appCheckPaths.contains(path)) return const <String, String>{};
  try {
    final String? token = await FirebaseAppCheck.instance
        .getToken()
        .timeout(const Duration(seconds: 10));
    return token == null || token.isEmpty
        ? const <String, String>{}
        : <String, String>{'X-Firebase-AppCheck': token};
  } catch (error) {
    debugPrint('App Check token is unavailable: $error');
    return const <String, String>{};
  }
}
