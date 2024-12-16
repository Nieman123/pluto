import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:foil/foil.dart';
import '../src/home/about.dart';
import '../src/home/designation.dart';
import '../src/home/introduction.dart';
import '../src/home/my_name.dart';
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
                  Roll(
                    crinkle: Crinkle.vivacious,
                    child: Foil(
                      gradient: Foils.linearRainbow.copyWith(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: List.from(Foils.linearRainbow.colors)),
                      opacity: 0.6,
                      scalar: Scalar.identity,
                      speed: const Duration(milliseconds: 100000),
                      duration: const Duration(milliseconds: 100000),
                      child: MyName(
                        isMobile: true,
                        context: context,
                      ),
                    ),
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
                        Roll(
                          crinkle: Crinkle.twinkling,
                          child: Foil(
                            gradient: Foils.linearRainbow.copyWith(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: List.from(Foils.linearRainbow.colors)),
                            opacity: 0.6,
                            scalar: Scalar.identity,
                            speed: const Duration(seconds: 100),
                            duration: const Duration(seconds: 100),
                            child: MyName(
                              isMobile: true,
                              context: context,
                            ),
                          ),
                        ),
                        Designation(isMobile: false, context: context),
                        SocialMediaBar(
                          height: height,
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
