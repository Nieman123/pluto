import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:sa3_liquid/sa3_liquid.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';

import 'tabs/calendar_event.dart'; // Assuming you have this from your App2 class

class GetawayPage extends StatefulWidget {
  GetawayPage({Key? key}) : super(key: key);

  @override
  _GetawayPageState createState() => _GetawayPageState();

  final ItemScrollController scrollController = ItemScrollController();
}

class _GetawayPageState extends State<GetawayPage> {
  final List<Widget> widgetList = [
    const CalendarEvent(),
  ];

  final ItemScrollController scrollController = ItemScrollController();

  @override
  void initState() {
    super.initState();
    FirebaseAnalytics.instance.logEvent(
      name: 'getaway_7_20_page_visit',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(builder: (context, constraints) {
        return Stack(
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
              itemCount: widgetList.length,
              itemScrollController: scrollController,
              itemBuilder: (context, index) {
                return widgetList[index];
              },
            ),
          ],
        );
      }),
    );
  }
}
