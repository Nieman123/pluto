import 'dart:convert';
import 'dart:typed_data';

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
          _AuthNavActions(),
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

class _AuthNavActions extends StatelessWidget {
  const _AuthNavActions();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user == null) {
          return const _RouteNavButton(
            label: 'Sign in',
            route: '/sign-on',
          );
        }

        return Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const SizedBox(width: 10),
            const _RouteNavButton(
              label: 'Rewards Shop',
              route: '/shop',
            ),
            _AdminNavButton(user: user),
            const SizedBox(width: 10),
            _ProfileAvatarButton(user: user),
          ],
        );
      },
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
    final Color navTextColor = Theme.of(context).primaryColor;
    return OutlinedButton(
      onPressed: () => GoRouter.of(context).go(route),
      style: OutlinedButton.styleFrom(
        foregroundColor: navTextColor,
        side: BorderSide(color: navTextColor.withValues(alpha: 0.55)),
      ),
      child: Text(label),
    );
  }
}

class _AdminNavButton extends StatelessWidget {
  const _AdminNavButton({
    required this.user,
  });

  final User user;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('adminUsers')
          .doc(user.uid)
          .snapshots(),
      builder: (BuildContext context,
          AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>> adminSnapshot) {
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
          ],
        );
      },
    );
  }
}

class _ProfileAvatarButton extends StatelessWidget {
  const _ProfileAvatarButton({
    required this.user,
  });

  final User user;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('userProfiles')
          .doc(user.uid)
          .snapshots(),
      builder: (BuildContext context,
          AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>> snapshot) {
        final Map<String, dynamic> profileData =
            snapshot.data?.data() ?? <String, dynamic>{};
        final String profileImageDataUrl =
            (profileData['profileImageDataUrl'] as String? ?? '').trim();
        final String profileDisplayName =
            (profileData['displayName'] as String? ?? '').trim();
        final Uint8List? profileBytes = _decodeDataUrl(profileImageDataUrl);
        final String photoUrl = (user.photoURL ?? '').trim();
        final ImageProvider<Object>? avatarImage =
            _avatarImage(profileBytes, photoUrl);
        final Color navTextColor = Theme.of(context).primaryColor;

        return Tooltip(
          message: 'Profile',
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: () => GoRouter.of(context).go('/profile'),
            child: Container(
              width: 42,
              height: 42,
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: navTextColor, width: 1.5),
              ),
              child: CircleAvatar(
                backgroundColor: navTextColor.withValues(alpha: 0.12),
                backgroundImage: avatarImage,
                foregroundColor: navTextColor,
                child: avatarImage == null
                    ? Text(
                        _avatarFallbackText(user, profileDisplayName),
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      )
                    : null,
              ),
            ),
          ),
        );
      },
    );
  }

  static ImageProvider<Object>? _avatarImage(
    Uint8List? profileBytes,
    String photoUrl,
  ) {
    if (profileBytes != null) {
      return MemoryImage(profileBytes);
    }
    if (photoUrl.isNotEmpty) {
      return NetworkImage(photoUrl);
    }
    return null;
  }

  static String _avatarFallbackText(User user, String profileDisplayName) {
    final String displayName =
        (profileDisplayName.isNotEmpty ? profileDisplayName : user.displayName)
                ?.trim() ??
            '';
    if (displayName.isNotEmpty) {
      return _firstCharacter(displayName);
    }

    final String email = (user.email ?? '').trim();
    if (email.isNotEmpty) {
      return _firstCharacter(email);
    }

    return '?';
  }

  static Uint8List? _decodeDataUrl(String dataUrl) {
    if (dataUrl.isEmpty) {
      return null;
    }

    final int commaIndex = dataUrl.indexOf(',');
    final String encoded =
        commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
    try {
      return base64Decode(encoded);
    } catch (_) {
      return null;
    }
  }

  static String _firstCharacter(String value) {
    return String.fromCharCode(value.runes.first).toUpperCase();
  }
}
