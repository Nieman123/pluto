import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../tabs/scroll_controller.dart';

//The top Nav Bar
class NavBar extends StatelessWidget implements PreferredSizeWidget {
  const NavBar({
    Key? key,
    required this.isDarkModeBtnVisible,
  }) : super(key: key);

  final bool isDarkModeBtnVisible;

  static const String _homeRoute = '/home';
  static const _NavMenuAction _homeMenuAction = _NavMenuAction.homeSection(
    label: 'Home',
    icon: Icons.home,
    sectionIndex: 0,
  );
  static const _NavMenuAction _dashboardMenuAction = _NavMenuAction.route(
    label: 'Dashboard',
    icon: Icons.dashboard,
    route: '/',
  );
  static const List<_NavMenuAction> _homeSectionMenuActions = <_NavMenuAction>[
    _NavMenuAction.homeSection(
      label: 'Events',
      icon: Icons.event,
      sectionIndex: 1,
      indentLevel: 1,
    ),
    _NavMenuAction.homeSection(
      label: 'Artists',
      icon: Icons.music_note,
      sectionIndex: 2,
      indentLevel: 1,
    ),
    _NavMenuAction.homeSection(
      label: 'Contact',
      icon: Icons.email,
      sectionIndex: 3,
      indentLevel: 1,
    ),
  ];

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final Color backgroundColor = Theme.of(context).scaffoldBackgroundColor;
    final String currentPath = GoRouterState.of(context).uri.path;

    return Material(
      color: backgroundColor,
      child: SizedBox(
        height: preferredSize.height,
        child: Row(
          children: <Widget>[
            const SizedBox(width: 12),
            Tooltip(
              message: 'Dashboard',
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => GoRouter.of(context).go('/'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: SizedBox(
                    height: 38,
                    width: 58,
                    child: Image.asset(
                      'assets/experience/pluto-logo-small.webp',
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Spacer(),
            const SizedBox(width: 8),
            _AuthNavActions(
              currentPath: currentPath,
            ),
            const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }

  static List<_NavMenuAction> compactSignedInActions({
    required bool isAdmin,
    required bool showHomeSectionSubItems,
  }) {
    return <_NavMenuAction>[
      _dashboardMenuAction,
      ...compactHomeActions(showSectionSubItems: showHomeSectionSubItems),
      const _NavMenuAction.route(
        label: 'Rewards Shop',
        icon: Icons.card_giftcard,
        route: '/shop',
      ),
      const _NavMenuAction.route(
        label: 'Scan QR Code',
        icon: Icons.qr_code_scanner,
        route: '/scan-qr',
      ),
      const _NavMenuAction.route(
        label: 'Account',
        icon: Icons.settings,
        route: '/sign-on',
      ),
      if (isAdmin)
        const _NavMenuAction.route(
          label: 'Admin',
          icon: Icons.admin_panel_settings,
          route: '/admin',
        ),
      const _NavMenuAction.route(
        label: 'Profile',
        icon: Icons.person,
        route: '/profile',
      ),
    ];
  }

  static List<_NavMenuAction> compactSignedOutActions({
    required bool showHomeSectionSubItems,
  }) {
    return <_NavMenuAction>[
      ...compactHomeActions(showSectionSubItems: showHomeSectionSubItems),
      const _NavMenuAction.route(
        label: 'Create Account',
        icon: Icons.person_add_alt_1,
        route: '/sign-up',
      ),
      const _NavMenuAction.route(
        label: 'Sign in',
        icon: Icons.login,
        route: '/sign-on',
      ),
    ];
  }

  static List<_NavMenuAction> compactHomeActions({
    required bool showSectionSubItems,
  }) {
    return <_NavMenuAction>[
      _homeMenuAction,
      if (showSectionSubItems) ..._homeSectionMenuActions,
    ];
  }

  static bool showHomeSectionSubItems({
    required String currentPath,
    required User? user,
  }) {
    if (currentPath == _homeRoute) {
      return true;
    }

    return user == null && currentPath == '/';
  }

  static Future<void> selectHomeSection(
    BuildContext context,
    int sectionIndex,
  ) async {
    if (!homeScrollController.hasClients) {
      GoRouter.of(context).go(_homeRoute);
      await WidgetsBinding.instance.endOfFrame;
      await WidgetsBinding.instance.endOfFrame;
    }

    await scrollToHomeSection(sectionIndex);
  }

  static Future<void> handleMenuAction(
    BuildContext context,
    _NavMenuAction action,
  ) async {
    final int? sectionIndex = action.sectionIndex;
    if (sectionIndex != null) {
      await selectHomeSection(context, sectionIndex);
      return;
    }

    GoRouter.of(context).go(action.route!);
  }
}

class _AuthNavActions extends StatelessWidget {
  const _AuthNavActions({
    required this.currentPath,
  });

  final String currentPath;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        final bool showHomeSectionSubItems = NavBar.showHomeSectionSubItems(
          currentPath: currentPath,
          user: user,
        );

        if (user == null) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (currentPath != '/sign-up') ...<Widget>[
                const _CreateAccountNavButton(),
                const SizedBox(width: 6),
              ],
              _CompactNavMenuButton(
                actions: NavBar.compactSignedOutActions(
                  showHomeSectionSubItems: showHomeSectionSubItems,
                ),
                tooltip: 'Open navigation menu',
              ),
            ],
          );
        }

        return _CompactSignedInNavActions(
          showHomeSectionSubItems: showHomeSectionSubItems,
          user: user,
        );
      },
    );
  }
}

class _NavMenuAction {
  const _NavMenuAction.homeSection({
    required this.label,
    required this.icon,
    required this.sectionIndex,
    this.indentLevel = 0,
  }) : route = null;

  const _NavMenuAction.route({
    required this.label,
    required this.icon,
    required this.route,
  })  : indentLevel = 0,
        sectionIndex = null;

  final String label;
  final IconData icon;
  final int indentLevel;
  final int? sectionIndex;
  final String? route;
}

class _CompactSignedInNavActions extends StatelessWidget {
  const _CompactSignedInNavActions({
    required this.showHomeSectionSubItems,
    required this.user,
  });

  final bool showHomeSectionSubItems;
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
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            _ProfileAvatarButton(user: user),
            const SizedBox(width: 6),
            _CompactNavMenuButton(
              actions: NavBar.compactSignedInActions(
                isAdmin: isAdmin,
                showHomeSectionSubItems: showHomeSectionSubItems,
              ),
              tooltip: 'Open navigation menu',
            ),
          ],
        );
      },
    );
  }
}

class _CreateAccountNavButton extends StatelessWidget {
  const _CreateAccountNavButton();

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => GoRouter.of(context).go('/sign-up'),
      style: TextButton.styleFrom(
        backgroundColor: const Color(0xFF7A3FD0).withValues(alpha: 0.24),
        foregroundColor: const Color(0xFFF3E8FF),
        minimumSize: const Size(0, 38),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(
            color: const Color(0xFFD9A7FF).withValues(alpha: 0.34),
          ),
        ),
      ),
      child: const Text(
        'Create Account',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontFamily: 'Montserrat',
          fontSize: 13,
          fontWeight: FontWeight.w800,
          letterSpacing: 0,
        ),
      ),
    );
  }
}

class _CompactNavMenuButton extends StatelessWidget {
  const _CompactNavMenuButton({
    required this.actions,
    required this.tooltip,
  });

  final List<_NavMenuAction> actions;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final Color navTextColor = Theme.of(context).primaryColor;

    return PopupMenuButton<_NavMenuAction>(
      tooltip: tooltip,
      position: PopupMenuPosition.under,
      offset: const Offset(0, 8),
      color: Theme.of(context).scaffoldBackgroundColor,
      elevation: 8,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: navTextColor.withValues(alpha: 0.18)),
      ),
      constraints: const BoxConstraints(minWidth: 210),
      onSelected: (_NavMenuAction action) =>
          NavBar.handleMenuAction(context, action),
      itemBuilder: (BuildContext context) {
        return actions.map(
          (_NavMenuAction action) {
            final bool isSubItem = action.indentLevel > 0;
            return PopupMenuItem<_NavMenuAction>(
              height: isSubItem ? 42 : kMinInteractiveDimension,
              value: action,
              child: Padding(
                padding: EdgeInsets.only(left: action.indentLevel * 28.0),
                child: Row(
                  children: <Widget>[
                    Icon(
                      action.icon,
                      size: isSubItem ? 18 : 20,
                      color: navTextColor,
                    ),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Text(
                        action.label,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: navTextColor,
                          fontFamily: 'Montserrat',
                          fontSize: isSubItem ? 14 : 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ).toList();
      },
      icon: Icon(
        Icons.menu,
        color: navTextColor,
      ),
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
        final Widget avatar = _buildAvatar(
          navTextColor: navTextColor,
          avatarImage: avatarImage,
          fallbackText: _avatarFallbackText(user, profileDisplayName),
        );

        return Tooltip(
          message: 'Profile',
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: () => GoRouter.of(context).go('/profile'),
            child: avatar,
          ),
        );
      },
    );
  }

  Widget _buildAvatar({
    required Color navTextColor,
    required ImageProvider<Object>? avatarImage,
    required String fallbackText,
  }) {
    return Container(
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
                fallbackText,
                style: const TextStyle(fontWeight: FontWeight.bold),
              )
            : null,
      ),
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
