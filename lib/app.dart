import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_improved_scrolling/flutter_improved_scrolling.dart';
import 'package:sa3_liquid/sa3_liquid.dart';

import 'signed_in_home_page.dart';
import 'src/nav_bar/nav_bar.dart';
import 'tabs/tabs.dart';

class App extends StatelessWidget {
  const App({Key? key}) : super(key: key);
  static const String route = '/';

  Widget _buildPublicHome(BuildContext context) {
    final ScrollController controller = ScrollController();
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
              const PlasmaRenderer(
                color: Color.fromARGB(68, 85, 0, 165),
                blur: 0.5,
                blendMode: BlendMode.plus,
                particleType: ParticleType.atlas,
                variation1: 1,
              ),
              ImprovedScrolling(
                scrollController: controller,
                enableKeyboardScrolling: true,
                child: ListView.builder(
                  itemCount: widgetList.length,
                  controller: controller,
                  itemBuilder: (BuildContext context, int index) {
                    return widgetList[index];
                  },
                ),
              ),
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
            const PlasmaRenderer(
              color: Color.fromARGB(68, 85, 0, 165),
              blur: 0.5,
              blendMode: BlendMode.plus,
              particleType: ParticleType.atlas,
              variation1: 1,
            ),
            ImprovedScrolling(
              scrollController: controller,
              enableKeyboardScrolling: true,
              child: ListView.builder(
                itemCount: widgetList.length,
                controller: controller,
                itemBuilder: (BuildContext context, int index) {
                  return widgetList[index];
                },
              ),
            ),
          ],
        ),
      );
    });
  }

  Widget _buildLoadingHome() {
    return const Scaffold(
      body: Stack(
        children: <Widget>[
          PlasmaRenderer(
            color: Color.fromARGB(68, 85, 0, 165),
            blur: 0.5,
            blendMode: BlendMode.plus,
            particleType: ParticleType.atlas,
            variation1: 1,
          ),
          Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return _buildLoadingHome();
        }

        final User? user = authSnapshot.data;
        if (user != null) {
          return SignedInHomePage(user: user);
        }

        return _buildPublicHome(context);
      },
    );
  }
}
