// Firebase web defaults plus validated release environment configuration.
// ignore_for_file: lines_longer_than_80_chars, avoid_classes_with_only_static_members
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'src/native_environment.dart';

/// Default [FirebaseOptions] for use with your Firebase apps.
///
/// Example:
/// ```dart
/// import 'firebase_options.dart';
/// // ...
/// await Firebase.initializeApp(
///   options: DefaultFirebaseOptions.currentPlatform,
/// );
/// ```
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return resolveAndroid(
            environment: plutoEnvironment,
            flavor: plutoFlavor,
            configJson:
                const String.fromEnvironment('PLUTO_FIREBASE_ANDROID_CONFIG'));
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for ios - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macos - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.fuchsia:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static FirebaseOptions resolveAndroid(
      {required String environment,
      required String flavor,
      required String configJson}) {
    validateNativeEnvironment(environment, flavor);
    if (configJson.isEmpty)
      throw StateError('Android Firebase configuration is required.');
    final config = Map<String, dynamic>.from(jsonDecode(configJson) as Map);
    final project =
        environment == 'staging' ? 'pluto-staging-92eb7' : 'pluto-9b6ca';
    final sender = environment == 'staging' ? '702489323300' : '763906028056';
    const fields = [
      'apiKey',
      'appId',
      'messagingSenderId',
      'projectId',
      'storageBucket'
    ];
    if (config.keys.any((key) => !fields.contains(key))) {
      throw StateError('Only public Android Firebase fields are allowed.');
    }
    for (final field in fields) {
      if (config[field] is! String || (config[field] as String).isEmpty) {
        throw StateError('Incomplete Android Firebase configuration.');
      }
    }
    if (config['projectId'] != project ||
        config['messagingSenderId'] != sender ||
        !RegExp('^1:$sender:android:[a-f0-9]+\$')
            .hasMatch(config['appId'] as String) ||
        !['$project.appspot.com', '$project.firebasestorage.app']
            .contains(config['storageBucket']) ||
        config['measurementId'] != null ||
        (environment == 'staging' &&
            config['apiKey'] == productionWeb.apiKey)) {
      throw StateError(
          'Android Firebase configuration does not match its flavor.');
    }
    return FirebaseOptions(
        apiKey: config['apiKey'],
        appId: config['appId'],
        messagingSenderId: sender,
        projectId: project,
        storageBucket: config['storageBucket']);
  }

  static FirebaseOptions get web => resolveWeb(
      environment: const String.fromEnvironment('PLUTO_ENVIRONMENT',
          defaultValue: 'production'),
      configJson: const String.fromEnvironment('PLUTO_FIREBASE_WEB_CONFIG'));

  static FirebaseOptions resolveWeb(
      {required String environment, required String configJson}) {
    if (!['production', 'staging'].contains(environment)) {
      throw StateError('Unknown Firebase environment.');
    }
    if (configJson.isEmpty) {
      if (environment == 'staging')
        throw StateError('Staging Firebase configuration is required.');
      return productionWeb;
    }
    final config = Map<String, dynamic>.from(jsonDecode(configJson) as Map);
    final project =
        environment == 'staging' ? 'pluto-staging-92eb7' : 'pluto-9b6ca';
    for (final field in [
      'apiKey',
      'appId',
      'messagingSenderId',
      'projectId',
      'authDomain',
      'storageBucket'
    ]) {
      if (config[field] is! String || (config[field] as String).isEmpty)
        throw StateError('Incomplete Firebase configuration.');
    }
    if (config['projectId'] != project ||
        config['authDomain'] != '$project.firebaseapp.com' ||
        !['$project.appspot.com', '$project.firebasestorage.app']
            .contains(config['storageBucket']) ||
        !RegExp(r'^\d+$').hasMatch(config['messagingSenderId'] as String) ||
        !RegExp('^1:${config['messagingSenderId']}:web:[a-f0-9]+\$')
            .hasMatch(config['appId'] as String) ||
        (environment == 'staging' &&
            (config['apiKey'] == productionWeb.apiKey ||
                config['messagingSenderId'] ==
                    productionWeb.messagingSenderId ||
                config['measurementId'] != null))) {
      throw StateError(
          'Firebase configuration does not match the deployment environment.');
    }
    return FirebaseOptions(
        apiKey: config['apiKey'] as String,
        appId: config['appId'] as String,
        messagingSenderId: config['messagingSenderId'] as String,
        projectId: project,
        authDomain: config['authDomain'] as String,
        storageBucket: config['storageBucket'] as String,
        measurementId: config['measurementId'] as String?);
  }

  static const FirebaseOptions productionWeb = FirebaseOptions(
    apiKey: 'AIzaSyBLv7MumBOjUHpmAUiu9nLfhWvwmAYKorE',
    appId: '1:763906028056:web:c1261eba96f8b0c792896d',
    messagingSenderId: '763906028056',
    projectId: 'pluto-9b6ca',
    authDomain: 'pluto-9b6ca.firebaseapp.com',
    storageBucket: 'pluto-9b6ca.appspot.com',
    measurementId: 'G-Y6GBW8P032',
  );
}
