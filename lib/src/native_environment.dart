import 'package:flutter/foundation.dart';

const plutoEnvironment = String.fromEnvironment('PLUTO_ENVIRONMENT',
    defaultValue: kIsWeb ? 'production' : '');
const plutoFlavor = String.fromEnvironment('FLUTTER_APP_FLAVOR');

String validateNativeEnvironment(String environment, String flavor) {
  if (!['staging', 'production'].contains(environment) ||
      environment != flavor) {
    throw StateError('The native app flavor and Pluto environment must match.');
  }
  return environment;
}

Uri nativeApiBaseUri({
  required String environment,
  required String flavor,
  String configured = '',
  bool emulator = false,
}) {
  validateNativeEnvironment(environment, flavor);
  final expected = environment == 'staging'
      ? 'https://pluto-staging-92eb7.web.app'
      : 'https://pluto.events';
  final uri = Uri.parse(configured.isEmpty ? expected : configured);
  final local = emulator &&
      environment == 'staging' &&
      uri.scheme == 'http' &&
      ['127.0.0.1', 'localhost'].contains(uri.host) &&
      uri.port == 4173;
  if ((emulator ? !local : uri.origin != expected) ||
      uri.userInfo.isNotEmpty ||
      !['', '/'].contains(uri.path) ||
      uri.hasQuery ||
      uri.hasFragment) {
    throw StateError('The ticket API must match the native app environment.');
  }
  return uri;
}

Uri ticketingBaseUri() => kIsWeb
    ? Uri.parse(Uri.base.origin)
    : nativeApiBaseUri(
        environment: plutoEnvironment,
        flavor: plutoFlavor,
        // Build-time definitions intentionally override these defaults.
        // ignore: avoid_redundant_argument_values
        configured: const String.fromEnvironment('PLUTO_API_BASE_URL'),
        // ignore: avoid_redundant_argument_values
        emulator: const String.fromEnvironment('FIREBASE_EMULATOR_HOST') != '');
