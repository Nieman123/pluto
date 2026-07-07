import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../src/home/about.dart';
import '../src/home/designation.dart';
import '../src/home/introduction.dart';
import '../src/home/social_media_bar.dart';

class HomePage extends StatefulWidget {
  const HomePage({Key? key}) : super(key: key);

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.microtask(() {
        SystemChrome.setApplicationSwitcherDescription(
            ApplicationSwitcherDescription(
          label: 'Pluto - Private Underground Events in Asheville, NC',
          primaryColor: Colors.black.toARGB32(),
        ));
      });
    });
    FirebaseAnalytics.instance.logEvent(
      name: 'home_page_visit',
    );
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    final double height = MediaQuery.of(context).size.height;
    return Padding(
      padding: EdgeInsets.only(bottom: height * 0.01),
      child: SizedBox(
        child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
          if (constraints.maxWidth < 1000) {
            return Padding(
              padding: EdgeInsets.symmetric(horizontal: width * 0.024),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: height * 0.07),
                    child: const Introduction(
                        word:
                            'Events for dance music enthusiasts.\nAsheville, NC',
                        textScaleFactor: 1.5),
                  ),
                  const Row(
                    children: <Widget>[_AnimatedPlutoTitle()],
                  ),
                  Designation(isMobile: true, context: context),
                  SocialMediaBar(
                    height: height,
                  ),
                  const About(fontSize: 24),
                ],
              ),
            );
          } else {
            return Padding(
              padding:
                  EdgeInsets.only(top: height * 0.08, bottom: height * 0.07),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: width * 0.032),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Introduction(
                            word:
                                'Events for dance music enthusiasts.\nAsheville, NC',
                            textScaleFactor: 1.5),
                        const Row(
                          children: <Widget>[_AnimatedPlutoTitle()],
                        ),
                        Designation(isMobile: false, context: context),
                        SocialMediaBar(
                          height: height / 2,
                        ),
                        const About(fontSize: 30),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }
        }),
      ),
    );
  }
}

class _AnimatedPlutoTitle extends StatefulWidget {
  const _AnimatedPlutoTitle();

  @override
  State<_AnimatedPlutoTitle> createState() => _AnimatedPlutoTitleState();
}

class _AnimatedPlutoTitleState extends State<_AnimatedPlutoTitle>
    with SingleTickerProviderStateMixin {
  static const List<Color> _colors = <Color>[
    Colors.red,
    Colors.orange,
    Colors.yellow,
    Colors.green,
    Colors.blue,
    Colors.indigo,
  ];

  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (BuildContext context, Widget? child) {
        final double scaledValue = _controller.value * _colors.length;
        final int colorIndex = scaledValue.floor() % _colors.length;
        final int nextColorIndex = (colorIndex + 1) % _colors.length;
        final Color color = Color.lerp(
              _colors[colorIndex],
              _colors[nextColorIndex],
              scaledValue - colorIndex,
            ) ??
            _colors[colorIndex];

        return Text(
          'Pluto',
          style: TextStyle(
            color: color,
            fontSize: 200,
            fontWeight: FontWeight.bold,
          ),
        );
      },
    );
  }
}
