import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../background/pluto_background.dart';
import '../nav_bar/nav_bar.dart';

enum SignedInAppTab {
  dashboard(
    label: 'Dashboard',
    route: '/',
    icon: Icons.dashboard_outlined,
    selectedIcon: Icons.dashboard,
  ),
  rewards(
    label: 'Rewards',
    route: '/shop',
    icon: Icons.card_giftcard_outlined,
    selectedIcon: Icons.card_giftcard,
  ),
  manafest(
    label: 'ManaFest',
    route: '/manafest',
    icon: Icons.festival_outlined,
    selectedIcon: Icons.festival,
  ),
  profile(
    label: 'Profile',
    route: '/profile',
    icon: Icons.person_outline,
    selectedIcon: Icons.person,
  );

  const SignedInAppTab({
    required this.label,
    required this.route,
    required this.icon,
    required this.selectedIcon,
  });

  final String label;
  final String route;
  final IconData icon;
  final IconData selectedIcon;
}

class SignedInAppShell extends StatelessWidget {
  const SignedInAppShell({
    Key? key,
    required this.selectedTab,
    required this.child,
    this.maxContentWidth = 1200,
  }) : super(key: key);

  final SignedInAppTab selectedTab;
  final Widget child;
  final double maxContentWidth;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const NavBar(isDarkModeBtnVisible: true),
      body: Stack(
        children: <Widget>[
          const PlutoBackground(),
          SafeArea(
            top: false,
            child: Column(
              children: <Widget>[
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: maxContentWidth),
                      child: child,
                    ),
                  ),
                ),
                _SignedInBottomNavigation(selectedTab: selectedTab),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AuthAwareSignedInAppShell extends StatelessWidget {
  const AuthAwareSignedInAppShell({
    Key? key,
    required this.currentPath,
    required this.child,
  }) : super(key: key);

  final String currentPath;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> snapshot) {
        final User? user = snapshot.data;
        if (user == null) {
          return child;
        }

        final SignedInAppTab selectedTab =
            SignedInAppTabX.fromPath(currentPath);
        return SignedInAppShell(
          selectedTab: selectedTab,
          maxContentWidth: selectedTab.maxContentWidth,
          child: child,
        );
      },
    );
  }
}

extension SignedInAppTabX on SignedInAppTab {
  static SignedInAppTab fromPath(String path) {
    return SignedInAppTab.values.firstWhere(
      (SignedInAppTab tab) => tab.route == path,
      orElse: () => SignedInAppTab.dashboard,
    );
  }

  double get maxContentWidth {
    switch (this) {
      case SignedInAppTab.manafest:
        return 1080;
      case SignedInAppTab.dashboard:
      case SignedInAppTab.rewards:
      case SignedInAppTab.profile:
        return 1200;
    }
  }
}

class _SignedInBottomNavigation extends StatelessWidget {
  const _SignedInBottomNavigation({
    required this.selectedTab,
  });

  static const List<SignedInAppTab> _tabs = <SignedInAppTab>[
    SignedInAppTab.dashboard,
    SignedInAppTab.rewards,
    SignedInAppTab.manafest,
    SignedInAppTab.profile,
  ];

  final SignedInAppTab selectedTab;

  @override
  Widget build(BuildContext context) {
    final Color navTextColor = Theme.of(context).primaryColor;
    final Color selectedColor = Colors.white.withValues(alpha: 0.96);
    final Color unselectedColor = Colors.white.withValues(alpha: 0.72);
    final int selectedIndex = _tabs.indexOf(selectedTab);

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: NavigationBarTheme(
                data: NavigationBarThemeData(
                  iconTheme: WidgetStateProperty.resolveWith<IconThemeData>(
                    (Set<WidgetState> states) {
                      final bool isSelected =
                          states.contains(WidgetState.selected);
                      return IconThemeData(
                        color: isSelected ? selectedColor : unselectedColor,
                        size: isSelected ? 27 : 25,
                      );
                    },
                  ),
                  labelTextStyle: WidgetStateProperty.resolveWith<TextStyle>(
                    (Set<WidgetState> states) {
                      final bool isSelected =
                          states.contains(WidgetState.selected);
                      return TextStyle(
                        color: isSelected ? selectedColor : unselectedColor,
                        fontSize: 12,
                        fontWeight:
                            isSelected ? FontWeight.w700 : FontWeight.w600,
                      );
                    },
                  ),
                ),
                child: NavigationBar(
                  selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
                  height: 72,
                  backgroundColor: Colors.black.withValues(alpha: 0.78),
                  indicatorColor: navTextColor.withValues(alpha: 0.28),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  onDestinationSelected: (int index) {
                    final SignedInAppTab tab = _tabs[index];
                    if (tab == selectedTab) {
                      return;
                    }
                    GoRouter.of(context).go(tab.route);
                  },
                  destinations: _tabs
                      .map(
                        (SignedInAppTab tab) => NavigationDestination(
                          icon: Icon(tab.icon),
                          selectedIcon: Icon(tab.selectedIcon),
                          label: tab.label,
                        ),
                      )
                      .toList(),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
