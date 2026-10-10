import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/firebase_options.dart';

void main() {
  for (final environment in ['staging', 'production']) {
    final defines =
        jsonDecode(File('config/ios/$environment.json').readAsStringSync())
            as Map;
    final config =
        jsonDecode(defines['PLUTO_FIREBASE_IOS_CONFIG'] as String) as Map;
    test('$environment uses the registered iOS Firebase app and Google client',
        () {
      final options = DefaultFirebaseOptions.resolveIOS(
          environment: environment,
          flavor: environment,
          configJson: jsonEncode(config));
      expect(options.appId, contains(':ios:'));
      expect(options.iosClientId, defines['PLUTO_GOOGLE_IOS_CLIENT_ID']);
      expect(
          options.iosBundleId,
          environment == 'staging'
              ? 'events.pluto.app.staging'
              : 'events.pluto.app');
    });
    test(
        '$environment rejects mixed iOS identities, private configuration and crossed flavors',
        () {
      for (final change in [
        {'projectId': 'wrong-project'},
        {'messagingSenderId': '123'},
        {'appId': '1:123:android:abc'},
        {'iosBundleId': 'events.pluto.wrong'},
        {'iosClientId': '123-wrong.apps.googleusercontent.com'},
        {'storageBucket': 'another-project.appspot.com'},
        {'private_key': 'must-never-be-in-a-mobile-app'},
        {'apiKey': ''},
      ]) {
        expect(
            () => DefaultFirebaseOptions.resolveIOS(
                environment: environment,
                flavor: environment,
                configJson: jsonEncode({...config, ...change})),
            throwsStateError);
      }
      expect(
          () => DefaultFirebaseOptions.resolveIOS(
              environment: environment,
              flavor: environment == 'staging' ? 'production' : 'staging',
              configJson: jsonEncode(config)),
          throwsStateError);
      expect(
          () => DefaultFirebaseOptions.resolveIOS(
              environment: environment, flavor: environment, configJson: ''),
          throwsStateError);
    });
  }
}
