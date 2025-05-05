import 'package:firebase_ui_auth/firebase_ui_auth.dart' as ui_auth;
import 'package:firebase_ui_auth/firebase_ui_auth.dart' hide AuthProvider;
import 'package:firebase_ui_oauth_google/firebase_ui_oauth_google.dart';
import 'package:flutter/material.dart';

/// Replace with your actual Google client ID.
const String GOOGLE_CLIENT_ID = '763906028056-lfief07v2pnbhj39e974crv721etefrs.apps.googleusercontent.com';

class SignInPage extends StatelessWidget {
  const SignInPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Define the providers you want to support.
    final providers = <ui_auth.AuthProvider>[
      EmailAuthProvider(),
      GoogleProvider(clientId: GOOGLE_CLIENT_ID),
      // Add other providers if needed.
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color.fromARGB(255, 115, 60, 175),
        centerTitle: true,
        title: const Text(
          'Pluto Events Sign In',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: SignInScreen(
        providers: providers,
        // When the user signs in successfully, navigate to the Profile page.
        actions: [
          AuthStateChangeAction<SignedIn>((context, state) {
            Navigator.pushReplacementNamed(context, '/profile');
          }),
          AuthStateChangeAction<UserCreated>((context, state) {
            Navigator.pushReplacementNamed(context, '/profile');
          }),
        ],
        // A custom header that reflects your brand.
        headerBuilder: (context, constraints, _) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Image.asset(
              'assets/pluto-logo.png', // Ensure this asset exists.
              height: 100,
            ),
          );
        },
        // A subtitle that explains the action.
        subtitleBuilder: (context, action) {
          final actionText = () {
            switch (action) {
              case AuthAction.signIn:
                return 'Please sign in to continue.';
              case AuthAction.signUp:
                return 'Create an account to get started.';
              case AuthAction.link:
                // TODO: Handle this case.
                break;
              case AuthAction.none:
                // TODO: Handle this case.
                break;
            }
          }();
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              actionText!,
              style: const TextStyle(fontSize: 16, color: Colors.white70),
            ),
          );
        },
        // A footer with additional information.
        footerBuilder: (context, action) {
          return const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Center(
              child: Text(
                'By signing in, you agree to our terms and conditions.',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          );
        },
        // Optional: Define styles for the email form.
        styles: const {
          EmailFormStyle(signInButtonVariant: ButtonVariant.filled),
        },
      ),
    );
  }
}

/// The ProfilePage widget displays the Firebase UI ProfileScreen with
/// actions (such as sign-out) and the same themed AppBar.
class ProfilePage extends StatelessWidget {
  const ProfilePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // List the providers as needed.
    final providers = <ui_auth.AuthProvider>[
      EmailAuthProvider(),
      GoogleProvider(clientId: GOOGLE_CLIENT_ID),
      // Other providers if you have them.
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color.fromARGB(255, 115, 60, 175),
        centerTitle: true,
        title: const Text(
          'Your Profile',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: ProfileScreen(
        providers: providers,
        actions: [
          SignedOutAction((context) {
            Navigator.pushReplacementNamed(context, '/sign-in');
          }),
        ],
      ),
    );
  }
}