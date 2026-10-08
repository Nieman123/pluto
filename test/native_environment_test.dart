import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/firebase_options.dart';
import 'package:pluto/src/native_environment.dart';
import 'package:pluto/src/native_links.dart';

void main() {
  for (final environment in ['staging', 'production']) {
    final defines =
        jsonDecode(File('config/android/$environment.json').readAsStringSync())
            as Map;
    final config =
        jsonDecode(defines['PLUTO_FIREBASE_ANDROID_CONFIG'] as String) as Map;
    test(
        '$environment native Firebase and API match the registered Android app',
        () {
      final options = DefaultFirebaseOptions.resolveAndroid(
          environment: environment,
          flavor: environment,
          configJson: jsonEncode(config));
      final services = jsonDecode(
          File('android/app/src/$environment/google-services.json')
              .readAsStringSync()) as Map;
      expect(options.projectId, services['project_info']['project_id']);
      expect(options.appId,
          services['client'][0]['client_info']['mobilesdk_app_id']);
      expect(
          options.apiKey, services['client'][0]['api_key'][0]['current_key']);
      expect(options.storageBucket, services['project_info']['storage_bucket']);
      expect(
          (defines['PLUTO_GOOGLE_SERVER_CLIENT_ID'] as String)
              .startsWith('${options.messagingSenderId}-'),
          isTrue);
      expect(
          services['client'][0]['client_info']['android_client_info']
              ['package_name'],
          environment == 'staging'
              ? 'events.pluto.app.staging'
              : 'events.pluto.app');
      expect(
          nativeApiBaseUri(environment: environment, flavor: environment)
              .origin,
          defines['PLUTO_API_BASE_URL']);
    });
    test(
        '$environment rejects web apps, wrong projects, missing config and crossed flavors',
        () {
      for (final change in [
        {'projectId': 'other-project'},
        {'appId': '1:123:web:abcdef'},
        {'messagingSenderId': '123'},
        {'storageBucket': 'other-project.appspot.com'},
        {'apiKey': ''},
        {'private_key': 'not-public-configuration'},
        {'measurementId': 'G-TRACK'},
      ]) {
        expect(
            () => DefaultFirebaseOptions.resolveAndroid(
                environment: environment,
                flavor: environment,
                configJson: jsonEncode({...config, ...change})),
            throwsStateError);
      }
      expect(
          () => DefaultFirebaseOptions.resolveAndroid(
              environment: environment, flavor: environment, configJson: ''),
          throwsStateError);
      expect(
          () => DefaultFirebaseOptions.resolveAndroid(
              environment: environment,
              flavor: environment == 'staging' ? 'production' : 'staging',
              configJson: jsonEncode(config)),
          throwsStateError);
    });
  }
  test(
      'native API rejects external, crossed, authenticated and insecure origins',
      () {
    for (final value in [
      'https://pluto.events',
      'https://evil.example',
      'http://pluto-staging-92eb7.web.app',
      'https://user@pluto-staging-92eb7.web.app',
      'https://pluto-staging-92eb7.web.app/path',
      'https://pluto-staging-92eb7.web.app?redirect=evil',
      'https://pluto-staging-92eb7.web.app#secret'
    ]) {
      expect(
          () => nativeApiBaseUri(
              environment: 'staging', flavor: 'staging', configured: value),
          throwsStateError);
    }
    expect(
        () => nativeApiBaseUri(environment: '', flavor: ''), throwsStateError);
    expect(
        () => nativeApiBaseUri(
            environment: 'production',
            flavor: 'production',
            configured: 'http://127.0.0.1:4173',
            emulator: true),
        throwsStateError);
    expect(
        () => nativeApiBaseUri(
            environment: 'staging',
            flavor: 'staging',
            configured: 'https://pluto-staging-92eb7.web.app',
            emulator: true),
        throwsStateError);
    expect(
        nativeApiBaseUri(
                environment: 'staging',
                flavor: 'staging',
                configured: 'http://127.0.0.1:4173',
                emulator: true)
            .host,
        '127.0.0.1');
  });
  test(
      'native ticket/recovery links retain fragment capabilities and reject unrelated hosts/routes',
      () {
    final origin = Uri.parse('https://pluto-staging-92eb7.web.app');
    final route = nativeAppRoute(
        Uri.parse(
            '${origin.origin}/app/tickets?order=123#recovery=private-token'),
        origin: origin)!;
    expect(route.path, '/tickets');
    expect(route.queryParameters['order'], '123');
    expect(route.fragment, 'recovery=private-token');
    expect(
        nativeAppRoute(Uri.parse('${origin.origin}/app/profile'),
                origin: origin)
            ?.path,
        '/profile');
    for (final link in [
      'https://pluto.events/app/tickets',
      '${origin.origin}/events/show',
      '${origin.origin}/app/tickets/other',
      '${origin.origin}/app/admin',
      'http://pluto-staging-92eb7.web.app/app/tickets',
      'https://user@pluto-staging-92eb7.web.app/app/tickets'
    ]) {
      expect(nativeAppRoute(Uri.parse(link), origin: origin), isNull);
    }
  });
}
