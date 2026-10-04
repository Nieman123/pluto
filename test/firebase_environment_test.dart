import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/firebase_options.dart';

void main() {
  final config = <String, dynamic>{
    'apiKey': 'staging-public-key',
    'appId': '1:987654:web:abcdef123',
    'messagingSenderId': '987654',
    'projectId': 'pluto-staging-92eb7',
    'authDomain': 'pluto-staging-92eb7.firebaseapp.com',
    'storageBucket': 'pluto-staging-92eb7.firebasestorage.app',
  };
  test('staging app uses isolated Auth and Storage with Analytics disabled',
      () {
    final options = DefaultFirebaseOptions.resolveWeb(
        environment: 'staging', configJson: jsonEncode(config));
    expect(options.projectId, 'pluto-staging-92eb7');
    expect(options.storageBucket, config['storageBucket']);
    expect(options.measurementId, isNull);
  });
  test('staging rejects incomplete configuration and production services', () {
    expect(
        () => DefaultFirebaseOptions.resolveWeb(
            environment: 'staging', configJson: ''),
        throwsStateError);
    for (final change in [
      {'projectId': 'pluto-9b6ca'},
      {'authDomain': 'pluto-9b6ca.firebaseapp.com'},
      {'storageBucket': 'pluto-9b6ca.appspot.com'},
      {'apiKey': DefaultFirebaseOptions.productionWeb.apiKey},
      {'appId': DefaultFirebaseOptions.productionWeb.appId},
      {'measurementId': 'G-Y6GBW8P032'},
    ]) {
      expect(
          () => DefaultFirebaseOptions.resolveWeb(
              environment: 'staging',
              configJson: jsonEncode({...config, ...change})),
          throwsStateError);
    }
  });
}
