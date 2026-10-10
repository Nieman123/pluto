import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'google_auth.dart';

String deletionProvider(Iterable<String> providers) {
  final ids = providers.toSet();
  // Revoke Apple even if this account also has a password or Google login.
  if (ids.contains('apple.com')) return 'apple.com';
  if (ids.contains('password')) return 'password';
  if (ids.contains('google.com')) return 'google.com';
  throw StateError('Sign in with your original account provider to continue.');
}

Future<Map<String, dynamic>> confirmDeletionIdentity(
    User user, String password) async {
  final provider = deletionProvider(user.providerData.map((p) => p.providerId));
  if (provider == 'password') {
    await user.reauthenticateWithCredential(
        EmailAuthProvider.credential(email: user.email!, password: password));
  } else if (provider == 'google.com') {
    await signInToPlutoWithGoogle(reauthenticateUser: user);
  } else {
    final apple = AppleAuthProvider();
    final result = kIsWeb
        ? await user.reauthenticateWithPopup(apple)
        : await user.reauthenticateWithProvider(apple);
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      final code = result.additionalUserInfo?.authorizationCode;
      if (code == null || code.isEmpty)
        throw StateError(
            'Apple did not return deletion authorization. Please try again.');
      await FirebaseAuth.instance.revokeTokenWithAuthorizationCode(code);
      await user.getIdToken(true);
      return {'appleTokensRevoked': true};
    }
    final credential = result.credential;
    final token = credential is OAuthCredential ? credential.accessToken : null;
    if (token == null || token.isEmpty)
      throw StateError(
          'Apple access could not be confirmed. Please try again.');
    await user.getIdToken(true);
    return {'appleAccessToken': token};
  }
  await user.getIdToken(true);
  return {};
}

const deletionExplanation =
    'Your sign-in account, profile and photo, Pluto Points and rewards history will be permanently deleted. You will lose account access to tickets and orders. Deletion does not refund purchases or cancel event admission. Contact Pluto before continuing if you still need ticket access.';
const deletionRetention =
    'Limited purchase, payment, refund, tax, dispute, admission-security and signed-waiver records may remain for accounting, legal and security purposes.';
