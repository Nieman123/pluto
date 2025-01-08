import 'package:animated_text_kit/animated_text_kit.dart';
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
          primaryColor: Colors.black.value,
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
                  Row(
                    children: [
                      AnimatedTextKit(animatedTexts: [
                        ColorizeAnimatedText(
                          'Pluto',
                          textStyle: const TextStyle(
                            fontSize: 200.0,
                            fontWeight: FontWeight.bold,
                          ),
                          colors: [
                            Colors.red,
                            Colors.orange,
                            Colors.yellow,
                            Colors.green,
                            Colors.blue,
                            Colors.indigo,
                          ],
                          speed: const Duration(milliseconds: 1000),
                        )
                      ])
                    ],
                  ),
                  Designation(isMobile: true, context: context),
                  SocialMediaBar(
                    height: height,
                  ),
                  About(fontSize: 24),
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
                        Row(
                          children: [
                            AnimatedTextKit(animatedTexts: [
                              ColorizeAnimatedText(
                                'Pluto',
                                textStyle: const TextStyle(
                                  fontSize: 200.0,
                                  fontWeight: FontWeight.bold,
                                ),
                                colors: [
                                  Colors.red,
                                  Colors.orange,
                                  Colors.yellow,
                                  Colors.green,
                                  Colors.blue,
                                  Colors.indigo,
                                ],
                                speed: const Duration(milliseconds: 1000),
                              )
                            ])
                          ],
                        ),
                        Designation(isMobile: false, context: context),
                        SocialMediaBar(
                          height: height / 2,
                        ),
                        About(fontSize: 30),
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
