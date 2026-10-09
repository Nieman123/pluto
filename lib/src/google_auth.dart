import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'ticket_access_store.dart';
import 'ticket_session_cleanup.dart';

Future<void>? _googleInitialization;

FirebaseAuthException googleSignInFailure(GoogleSignInExceptionCode code,
    {required bool nativeAndroid}) {
  if (code == GoogleSignInExceptionCode.canceled) {
    // Android Credential Manager also uses "canceled" for OAuth configuration
    // failures after account selection; it cannot distinguish them from dismissal.
    return FirebaseAuthException(
        code: nativeAndroid
            ? 'google-sign-in-incomplete'
            : 'popup-closed-by-user',
        message: nativeAndroid
            ? 'Google sign-in did not finish. Try again or use email sign-in.'
            : 'Google sign-in was cancelled.');
  }
  return FirebaseAuthException(
      code: 'google-sign-in-failed',
      message: 'Google sign-in is unavailable. Try email sign-in.');
}

Future<UserCredential> signInToPlutoWithGoogle() async {
  final auth = FirebaseAuth.instance;
  if (kIsWeb) return auth.signInWithPopup(GoogleAuthProvider());
  const serverClientId =
      String.fromEnvironment('PLUTO_GOOGLE_SERVER_CLIENT_ID');
  try {
    final initialization = _googleInitialization ??= GoogleSignIn.instance
        .initialize(
            serverClientId: serverClientId.isEmpty ? null : serverClientId);
    try {
      await initialization;
    } catch (_) {
      if (identical(_googleInitialization, initialization))
        _googleInitialization = null;
      rethrow;
    }
    final account = await GoogleSignIn.instance.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null)
      throw FirebaseAuthException(
          code: 'missing-google-token',
          message: 'Google sign-in could not be confirmed.');
    return await auth
        .signInWithCredential(GoogleAuthProvider.credential(idToken: idToken));
  } on GoogleSignInException catch (error) {
    throw googleSignInFailure(error.code,
        nativeAndroid: defaultTargetPlatform == TargetPlatform.android);
  }
}

Future<void> signOutOfPluto() async {
  await FirebaseAuth.instance.signOut();
  if (!kIsWeb) {
    for (final key in attendeeKeysToRemoveOnSignOut(ticketAccessKeys())) {
      await ticketAccessRemove(key);
    }
  }
  if (!kIsWeb && _googleInitialization != null) {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {/* Already signed out of Pluto. */}
  }
}
