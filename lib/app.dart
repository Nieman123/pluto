import 'package:flutter/material.dart';
import 'package:flutter_list_view/flutter_list_view.dart';
import 'package:sa3_liquid/sa3_liquid.dart';

import 'src/nav_bar/nav_bar.dart';
import 'tabs/tabs.dart';

class App extends StatelessWidget {
  const App({Key? key}) : super(key: key);
  static const String route = '/';
  @override
  Widget build(BuildContext context) {
    final double height = MediaQuery.of(context).size.height;
    final double width = MediaQuery.of(context).size.width;
    return LayoutBuilder(builder: (context, constraints) {
      if (constraints.maxWidth < 1000) {
        return Scaffold(
          body: Stack(
            children: [
              const PlasmaRenderer(
                color: Color.fromARGB(68, 85, 0, 165),
                blur: 0.5,
                blendMode: BlendMode.plus,
                particleType: ParticleType.atlas,
                variation1: 1,
              ),
              FlutterListView(
                  delegate: FlutterListViewDelegate(
                (BuildContext context, int index) => widgetList[index],
                childCount: widgetList.length,
              ))
            ],
          ),
        );
      } else {
        return Scaffold(
          appBar: PreferredSize(
              preferredSize: Size(width, height * 0.07),
              child: const NavBar(isDarkModeBtnVisible: true)),
          body: Stack(
            children: [
              const PlasmaRenderer(
                type: PlasmaType.infinity,
                color: Color.fromARGB(68, 85, 0, 165),
                blur: 0.5,
                blendMode: BlendMode.plus,
                particleType: ParticleType.atlas,
                variation1: 1,
              ),
              FlutterListView(
                  delegate: FlutterListViewDelegate(
                (BuildContext context, int index) => widgetList[index],
                childCount: widgetList.length,
              ))
            ],
          ),
        );
      }
    });
  }
}
