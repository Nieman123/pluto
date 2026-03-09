import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AuthAppBarAction extends StatelessWidget {
  const AuthAppBarAction({
    Key? key,
    this.style,
  }) : super(key: key);

  final ButtonStyle? style;

  Future<void> _handlePressed(BuildContext context, User? user) async {
    if (user != null) {
      await FirebaseAuth.instance.signOut();
      return;
    }
    context.go('/sign-on');
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> snapshot) {
        final User? user = snapshot.data;
        return TextButton(
          onPressed: () => _handlePressed(context, user),
          style: style ?? TextButton.styleFrom(foregroundColor: Colors.white),
          child: Text(user == null ? 'Sign In' : 'Sign Out'),
        );
      },
    );
  }
}
