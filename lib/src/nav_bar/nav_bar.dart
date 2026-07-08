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
  static const List<_HomeSectionNavItem> _homeSections = <_HomeSectionNavItem>[
    _HomeSectionNavItem(label: 'Home', sectionIndex: 0),
    _HomeSectionNavItem(label: 'Events', sectionIndex: 1),
    _HomeSectionNavItem(label: 'Artists', sectionIndex: 2),
    _HomeSectionNavItem(label: 'Contact', sectionIndex: 3),
  ];
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
  static const double _compactBreakpoint = 760;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final Color backgroundColor = Theme.of(context).scaffoldBackgroundColor;
    final bool isCompact =
        MediaQuery.sizeOf(context).width < _compactBreakpoint;
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
            if (isCompact)
              const Spacer()
            else
              Expanded(
                child: LayoutBuilder(
                  builder: (BuildContext context, BoxConstraints constraints) {
                    return SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: ConstrainedBox(
                        constraints:
                            BoxConstraints(minWidth: constraints.maxWidth),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: _homeSections
                              .map(
                                (_HomeSectionNavItem item) =>
                                    _HomeSectionButton(item: item),
                              )
                              .toList(),
                        ),
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(width: 8),
            _AuthNavActions(
              currentPath: currentPath,
              isCompact: isCompact,
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

class _HomeSectionNavItem {
  const _HomeSectionNavItem({
    required this.label,
    required this.sectionIndex,
  });

  final String label;
  final int sectionIndex;
}

class _HomeSectionButton extends StatefulWidget {
  const _HomeSectionButton({
    required this.item,
  });

  final _HomeSectionNavItem item;

  @override
  State<_HomeSectionButton> createState() => _HomeSectionButtonState();
}

class _HomeSectionButtonState extends State<_HomeSectionButton> {
  bool _isHovering = false;

  Future<void> _handlePressed(BuildContext context) async {
    await NavBar.selectHomeSection(context, widget.item.sectionIndex);
  }

  @override
  Widget build(BuildContext context) {
    final Color navTextColor = Theme.of(context).primaryColor;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovering = true),
      onExit: (_) => setState(() => _isHovering = false),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: TextButton(
          onPressed: () => _handlePressed(context),
          style: TextButton.styleFrom(
            foregroundColor: navTextColor,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            textStyle: const TextStyle(
              fontFamily: 'Montserrat',
              fontSize: 15,
              fontWeight: FontWeight.bold,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(widget.item.label),
              const SizedBox(height: 3),
              AnimatedContainer(
                duration: const Duration(milliseconds: 140),
                curve: Curves.easeOutCubic,
                width: _isHovering ? 28 : 0,
                height: 3,
                decoration: BoxDecoration(
                  color: navTextColor,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuthNavActions extends StatelessWidget {
  const _AuthNavActions({
    required this.currentPath,
    required this.isCompact,
  });

  final String currentPath;
  final bool isCompact;

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
          if (isCompact) {
            return _CompactNavMenuButton(
              actions: NavBar.compactSignedOutActions(
                showHomeSectionSubItems: showHomeSectionSubItems,
              ),
              tooltip: 'Open navigation menu',
            );
          }

          return const _RouteNavButton(
            label: 'Sign in',
            route: '/sign-on',
          );
        }

        if (isCompact) {
          return _CompactSignedInNavActions(
            showHomeSectionSubItems: showHomeSectionSubItems,
            user: user,
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        textStyle: const TextStyle(
          fontFamily: 'Montserrat',
          fontSize: 15,
          fontWeight: FontWeight.bold,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
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
