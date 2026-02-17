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
      child: Row(
        children: [
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                UnderlinedButton(
                    context: context,
                    tabNumber: 0,
                    btnNumber: ' 00. ',
                    btnName: 'Home'),
                UnderlinedButton(
                    context: context,
                    tabNumber: 1,
                    btnNumber: ' 01. ',
                    btnName: 'Events'),
                UnderlinedButton(
                    context: context,
                    tabNumber: 2,
                    btnNumber: ' 02. ',
                    btnName: 'Artists'),
                UnderlinedButton(
                    context: context,
                    tabNumber: 3,
                    btnNumber: ' 03. ',
                    btnName: 'Contact'),
              ],
            ),
          ),
          const _RouteNavButton(
            label: 'Sign On',
            route: '/sign-on',
          ),
          const SizedBox(width: 10),
          const _RouteNavButton(
            label: 'Admin',
            route: '/admin',
          ),
          const SizedBox(width: 16),
          const Visibility(
            visible: false,
            child: ThemeButton(),
          ),
          const SizedBox(width: 8),
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
