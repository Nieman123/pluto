import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'signed_in_home_page.dart';
import 'src/background/pluto_background.dart';

class App extends StatelessWidget {
  const App({Key? key}) : super(key: key);

  static const String route = '/';

  Widget _buildLoadingHome() {
    return const Scaffold(
      body: Stack(
        children: <Widget>[
          PlutoBackground(),
          Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user != null) {
          return SignedInHomePage(user: user);
        }

        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return _buildLoadingHome();
        }

        return _buildLoadingHome();
      },
    );
  }
}
