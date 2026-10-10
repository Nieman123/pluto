import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

bool get offersAppleSignIn =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

Future<UserCredential> signInToPlutoWithApple() async {
  if (!offersAppleSignIn)
    throw StateError('Apple sign-in is available in the iOS app.');
  final provider = AppleAuthProvider()
    ..addScope('email')
    ..addScope('name');
  // Firebase's native SDK handles the secure nonce and system authorization sheet.
  return FirebaseAuth.instance.signInWithProvider(provider);
}

class AppleSignInButton extends StatelessWidget {
  const AppleSignInButton({super.key, required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 50,
        child: OutlinedButton.icon(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10))),
          icon: const Icon(Icons.apple, size: 25),
          label:
              const Text('Sign in with Apple', style: TextStyle(fontSize: 16)),
        ),
      );
}
