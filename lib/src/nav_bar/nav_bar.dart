import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/theme_button.dart';
import 'nav_bar_btn.dart';

//The top Nav Bar
class NavBar extends StatelessWidget {
  const NavBar({
    Key? key,
    required this.isDarkModeBtnVisible,
  }) : super(key: key);

  final bool isDarkModeBtnVisible;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: const Row(
        children: <Widget>[
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: <Widget>[
                UnderlinedButton(tabNumber: 0, btnName: 'Home'),
                UnderlinedButton(tabNumber: 1, btnName: 'Events'),
                UnderlinedButton(tabNumber: 2, btnName: 'Artists'),
                UnderlinedButton(tabNumber: 3, btnName: 'Contact'),
              ],
            ),
          ),
          _RouteNavButton(
            label: 'Sign in',
            route: '/sign-on',
          ),
          _ShopNavButton(),
          _ProfileNavButton(),
          _ScannerNavButton(),
          _AdminNavButton(),
          Visibility(
            visible: false,
            child: ThemeButton(),
          ),
          SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _RouteNavButton extends StatelessWidget {
  const _RouteNavButton({
    required this.label,
    required this.route,
  });

  final String label;
  final String route;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: () => GoRouter.of(context).go(route),
      child: Text(label),
    );
  }
}

class _AdminNavButton extends StatelessWidget {
  const _AdminNavButton();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user == null) {
          return const SizedBox.shrink();
        }

        return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection('adminUsers')
              .doc(user.uid)
              .snapshots(),
          builder: (BuildContext context,
              AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>>
                  adminSnapshot) {
            final bool isAdmin = adminSnapshot.data?.exists ?? false;
            if (!isAdmin) {
              return const SizedBox.shrink();
            }

            return const Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                SizedBox(width: 10),
                _RouteNavButton(
                  label: 'Admin',
                  route: '/admin',
                ),
                SizedBox(width: 16),
              ],
            );
          },
        );
      },
    );
  }
}

class _ProfileNavButton extends StatelessWidget {
  const _ProfileNavButton();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user == null) {
          return const SizedBox.shrink();
        }

        return const Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(width: 10),
            _RouteNavButton(
              label: 'Profile',
              route: '/profile',
            ),
          ],
        );
      },
    );
  }
}

class _ShopNavButton extends StatelessWidget {
  const _ShopNavButton();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user == null) {
          return const SizedBox.shrink();
        }

        return const Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(width: 10),
            _RouteNavButton(
              label: 'Rewards Shop',
              route: '/shop',
            ),
          ],
        );
      },
    );
  }
}

class _ScannerNavButton extends StatelessWidget {
  const _ScannerNavButton();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user == null) {
          return const SizedBox.shrink();
        }

        return const Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(width: 10),
            _RouteNavButton(
              label: 'Scan QR',
              route: '/scan-qr',
            ),
          ],
        );
      },
    );
  }
}
