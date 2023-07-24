import 'package:flutter/material.dart';

import '../src/contact_me/data.dart';
import '../src/contact_me/my_bio.dart';
import '../src/custom/custom_text.dart';
import '../src/home/social_media_bar.dart';
import '../src/html_open_link.dart';
import '../src/theme/config.dart';
import '../src/theme/custom_theme.dart';

class ContactMe extends StatefulWidget {
  const ContactMe({Key? key}) : super(key: key);

  @override
  _ContactMeState createState() => _ContactMeState();
}

class _ContactMeState extends State<ContactMe> {
  final List<String> data = contactMe();
  final List<String> getNameAndLink = nameAndLink();
  bool isHover = false;

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    final double height = MediaQuery.of(context).size.height;

    Widget imageWidget(double scale) {
      return AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: EdgeInsets.only(
            top: isHover ? height * 0.005 : height * 0.01,
            bottom: !isHover ? height * 0.005 : height * 0.01),
        child: InkWell(
          onTap: () {},
          onHover: (bool value) {
            setState(() {
              isHover = value;
            });
          },
          hoverColor: Colors.transparent,
          splashColor: Colors.transparent,
          focusColor: Colors.transparent,
          highlightColor: Colors.transparent,
          child: ClipOval(
              child: data[2] != ''
                  ? Image.asset('assets/contact_me/${data[2]}', scale: scale)
                  : Image.asset('assets/contact_me/constant/picture.png',
                      scale: scale)),
        ),
      );
    }

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
                            .withOpacity(0.7)),
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
                            text: ' ${data[0]}',
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
                  Container(
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
              padding: EdgeInsets.all(50),
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
                                      .withOpacity(0.7)),
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
                                      text: ' ${data[0]}',
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
                          Container(
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
              TextButton(
                onPressed: () => htmlOpenLink(getNameAndLink[1]),
                child: CustomText(
                    text: 'Made with ❤️',
                    fontSize: 10,
                    color: Theme.of(context).primaryColorLight),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
