import 'package:flutter/material.dart';
import 'package:sa3_liquid/sa3_liquid.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';

import 'src/nav_bar/nav_bar.dart';
import 'tabs/calendar_event.dart';
import 'tabs/tabs.dart';

class App2 extends StatelessWidget {
  App2({Key? key}) : super(key: key);
  static const String route = '/event';

  List<Widget> a2WidgetList = [
    const CalendarEvent(),
  ];
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
                  itemCount: a2WidgetList.length,
                  itemScrollController: scroll,
                  itemBuilder: (context, index) {
                    return a2WidgetList[index];
                  }),
            ],
          ),
        );
      } else {
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
                  itemCount: a2WidgetList.length,
                  itemScrollController: scroll,
                  itemBuilder: (context, index) {
                    return a2WidgetList[index];
                  }),
            ],
          ),
        );
      }
    });
  }
}
