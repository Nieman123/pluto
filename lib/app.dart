import 'package:flutter/material.dart';
import 'package:sa3_liquid/sa3_liquid.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';
import 'src/nav_bar/nav_bar.dart';
import 'tabs/tabs.dart';

class App extends StatelessWidget {
  const App({Key? key}) : super(key: key);

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
                type: PlasmaType.infinity,
                particles: 10,
                color: Color(0x444f4d4c),
                blur: 0.5,
                size: 1,
                speed: 1,
                offset: 0,
                blendMode: BlendMode.plus,
                particleType: ParticleType.atlas,
                variation1: 1,
                variation2: 0,
                variation3: 0,
                rotation: 0,
              ),
              ScrollablePositionedList.builder(
                  physics: const BouncingScrollPhysics(),
                  minCacheExtent: double.infinity,
                  shrinkWrap: true,
                  itemCount: widgetList.length,
                  itemScrollController: scroll,
                  itemBuilder: (context, index) {
                    return widgetList[index];
                  }),
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
                particles: 10,
                color: Color(0x444f4d4c),
                blur: 0.5,
                size: 1,
                speed: 1,
                offset: 0,
                blendMode: BlendMode.plus,
                particleType: ParticleType.atlas,
                variation1: 1,
                variation2: 0,
                variation3: 0,
                rotation: 0,
              ),
              ScrollablePositionedList.builder(
                  physics: const BouncingScrollPhysics(),
                  minCacheExtent: double.infinity,
                  shrinkWrap: true,
                  itemCount: widgetList.length,
                  itemScrollController: scroll,
                  itemBuilder: (context, index) {
                    return widgetList[index];
                  }),
            ],
          ),
        );
      }
    });
  }
}
