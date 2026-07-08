import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'signed_in_home_page.dart' deferred as signed_in_home_page;
import 'src/background/pluto_background.dart';
import 'src/deferred_widget.dart';
import 'src/nav_bar/nav_bar.dart';
import 'tabs/scroll_controller.dart';
import 'tabs/tabs.dart';

class App extends StatelessWidget {
  const App({
    Key? key,
    this.showSignedInHome = true,
  }) : super(key: key);

  static const String route = '/';
  static const String publicHomeRoute = '/home';

  final bool showSignedInHome;

  Widget _buildHomeList() {
    return ListView.builder(
      itemCount: widgetList.length,
      controller: homeScrollController,
      itemBuilder: (BuildContext context, int index) {
        return KeyedSubtree(
          key: homeSectionKeys[index],
          child: widgetList[index],
        );
      },
    );
  }

  Widget _buildPublicHome(BuildContext context) {
    final double height = MediaQuery.of(context).size.height;
    final double width = MediaQuery.of(context).size.width;

    return LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
      if (constraints.maxWidth < 1000) {
        return Scaffold(
          appBar: PreferredSize(
              preferredSize: Size(width, height * 0.07),
              child: const NavBar(isDarkModeBtnVisible: true)),
          body: Stack(
            children: <Widget>[
              const PlutoBackground(),
              _buildHomeList(),
            ],
          ),
        );
      }

      return Scaffold(
        appBar: PreferredSize(
            preferredSize: Size(width, height * 0.07),
            child: const NavBar(isDarkModeBtnVisible: true)),
        body: Stack(
          children: <Widget>[
            const PlutoBackground(),
            _buildHomeList(),
          ],
        ),
      );
    });
  }

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
    if (!showSignedInHome) {
      return _buildPublicHome(context);
    }

    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        final User? user = authSnapshot.data;
        if (user != null) {
          return DeferredWidget(
            loadLibrary: signed_in_home_page.loadLibrary,
            builder: (BuildContext context) =>
                signed_in_home_page.SignedInHomePage(user: user),
          );
        }

        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return _buildLoadingHome();
        }

        return _buildPublicHome(context);
      },
    );
  }
}
