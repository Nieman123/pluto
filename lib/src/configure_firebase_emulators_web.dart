import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';

import 'package:firebase_core_web/firebase_core_web.dart';
import 'package:web/web.dart' as web;

@JS('plutoEmulatorAuthReady')
external set _authReady(JSFunction? callback);

/// FlutterFire awaits Auth restoration inside initializeApp. Configure the
/// same SDK/app first so a saved demo session is restored by the emulator.
/// Live builds never enter this path.
Future<void> configureFirebaseEmulators(
    String host, Map<String, String?> options) async {
  if (host.isEmpty) return;
  // The sandbox bootstrap must use the exact SDK selected by FlutterFire.
  // ignore: invalid_use_of_visible_for_testing_member
  final String version = FirebaseCoreWeb().firebaseSDKVersion;
  final web.HTMLScriptElement script =
      web.document.createElement('script') as web.HTMLScriptElement;
  final Completer<void> ready = Completer<void>();
  _authReady = ((JSString? error) {
    if (ready.isCompleted) return;
    if (error == null) {
      ready.complete();
    } else {
      ready.completeError(StateError(error.toDart));
    }
  }).toJS;
  script.type = 'module';
  script.text = '''
    try {
    const core = await import('https://www.gstatic.com/firebasejs/$version/firebase-app.js');
    const sdk = await import('https://www.gstatic.com/firebasejs/$version/firebase-auth.js');
    const app = core.initializeApp(${jsonEncode(options)});
    // Match FlutterFire's Auth dependencies so its initializeAuth reuses this instance.
    const auth = sdk.initializeAuth(app, {
      errorMap: sdk.debugErrorMap,
      persistence: [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence, sdk.browserSessionPersistence],
      popupRedirectResolver: sdk.browserPopupRedirectResolver
    });
    sdk.connectAuthEmulator(auth, ${jsonEncode('http://$host:9095')});
    window.plutoEmulatorAuthReady(null);
    } catch (error) {
      window.plutoEmulatorAuthReady(String(error.message || error));
    }
  ''';
  final StreamSubscription<web.Event> failed = script.onError.listen((_) {
    if (!ready.isCompleted) {
      ready.completeError(
          StateError('The local Firebase Auth SDK could not load.'));
    }
  });
  web.document.head!.appendChild(script);
  try {
    await ready.future.timeout(const Duration(seconds: 30));
  } finally {
    await failed.cancel();
    _authReady = null;
    script.remove();
  }
}
