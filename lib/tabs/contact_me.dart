import 'package:flutter/material.dart';

import '../src/custom/custom_text.dart';
import '../src/home/social_media_bar.dart';

class ContactMe extends StatefulWidget {
  const ContactMe({Key? key}) : super(key: key);

  @override
  _ContactMeState createState() => _ContactMeState();
}

class _ContactMeState extends State<ContactMe> {
  bool isHover = false;

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    final double height = MediaQuery.of(context).size.height;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
          if (constraints.maxWidth < 1000) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 50),
              child: Column(
                children: [
                  CustomText(
                      text: 'CONTACT',
                      fontSize: 28,
                      color: Theme.of(context).primaryColorLight),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5.0),
                    child: CustomText(
                        text:
                            'WANT TO HOST AN EVENT? INTERESTED IN PLAYING? \nHIT US UP.',
                        fontSize: 18,
                        color: Theme.of(context)
                            .primaryColorLight
                            .withValues(alpha: 0.7)),
                  ),
                  //MyBio(fontSize: 15),
                  Padding(
                    padding: const EdgeInsets.only(
                      bottom: 5.0,
                      top: 3.0,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CustomText(
                            text: 'Asheville, NC',
                            fontSize: 18,
                            color: Theme.of(context).primaryColorLight),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10.0),
                    child: SocialMediaBar(
                      height: height,
                    ),
                  ),
                  SizedBox(
                    width: 100.0,
                    height: 100.0,
                    child: Image.asset(
                      'assets/experience/pluto-logo-small.png',
                      fit: BoxFit.fill,
                    ),
                  ),
                ],
              ),
            );
          } else {
            return Padding(
              padding: const EdgeInsets.all(50),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      SizedBox(
                        width: width / 2,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CustomText(
                                text: 'CONTACT',
                                fontSize: 35,
                                color: Theme.of(context).primaryColorLight),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 8.0),
                              child: CustomText(
                                  text:
                                      'WANT TO HOST AN EVENT? INTERESTED IN PLAYING? \nHIT US UP.',
                                  fontSize: 18,
                                  color: Theme.of(context)
                                      .primaryColorLight
                                      .withValues(alpha: 0.7)),
                            ),
                            //MyBio(fontSize: 15),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 10.0),
                              child: Row(
                                children: [
                                  // if (data[0] != '')
                                  //   Image.asset(
                                  //       currentTheme.currentTheme ==
                                  //               ThemeMode.dark
                                  //           ? 'assets/contact_me/constant/location-dark.png'
                                  //           : 'assets/contact_me/constant/location.png',
                                  //       scale: 4)
                                  // else
                                  //   const Center(),
                                  CustomText(
                                      text: 'Asheville, NC',
                                      fontSize: 18,
                                      color:
                                          Theme.of(context).primaryColorLight),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SocialMediaBar(
                            height: height,
                          ),
                          SizedBox(
                            width: 100.0,
                            height: 100.0,
                            child: Image.asset(
                              'assets/experience/pluto-logo-small.png',
                              fit: BoxFit.fill,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            );
          }
        }),
        Padding(
          padding: const EdgeInsets.only(bottom: 3.0),
          child: Column(
            children: [
              CustomText(
                  text: 'Made with ❤️',
                  fontSize: 10,
                  color: Theme.of(context).primaryColorLight)
            ],
          ),
        ),
      ],
    );
  }
}
