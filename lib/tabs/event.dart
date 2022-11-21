import 'package:flutter/material.dart';

import '../src/contact_me/data.dart';
import '../src/contact_me/my_bio.dart';
import '../src/custom/custom_text.dart';
import '../src/home/social_media_bar.dart';
import '../src/html_open_link.dart';
import '../src/theme/config.dart';
import '../src/theme/custom_theme.dart';

class Event extends StatefulWidget {
  const Event({Key? key}) : super(key: key);

  @override
  _EventState createState() => _EventState();
}

class _EventState extends State<Event> {
  final List<String> data = contactMe();
  final List<String> getNameAndLink = nameAndLink();
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
              padding: const EdgeInsets.symmetric(horizontal: 10.0),
              child: Column(
                children: [
                  CustomText(
                      text: 'UPCOMING PUBLIC EVENT',
                      fontSize: 28,
                      color: Theme.of(context).primaryColorLight),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5.0),
                    child: CustomText(
                        text: 'HOUSE NIGHTS AT WATER STREET',
                        fontSize: 18,
                        color: Theme.of(context)
                            .primaryColorLight
                            .withOpacity(0.7)),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: Card(
                      semanticContainer: true,
                      clipBehavior: Clip.antiAliasWithSaveLayer,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10.0),
                      ),
                      elevation: 5,
                      margin: EdgeInsets.all(10),
                      child: Image.asset(
                        'assets/experience/every-2nd-saturday-water-street-916.png',
                        fit: BoxFit.fill,
                      ),
                    ),
                  ),
                ],
              ),
            );
          } else {
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    SizedBox(
                      width: width / 2,
                      child: Column(
                        children: [
                          CustomText(
                              text: 'UPCOMING PUBLIC EVENT',
                              fontSize: 35,
                              color: Theme.of(context).primaryColorLight),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8.0),
                            child: CustomText(
                                text: 'HOUSE NIGHTS AT WATER STREET',
                                fontSize: 18,
                                color: Theme.of(context)
                                    .primaryColorLight
                                    .withOpacity(0.7)),
                          ),
                          SizedBox(
                            width: width / 3,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 20),
                              child: Card(
                                semanticContainer: true,
                                clipBehavior: Clip.antiAliasWithSaveLayer,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10.0),
                                ),
                                elevation: 5,
                                margin: EdgeInsets.all(10),
                                child: Image.asset(
                                  'assets/experience/every-2nd-saturday-water-street-916.png',
                                  fit: BoxFit.fill,
                                ),
                              ),
                            ),
                          )
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            );
          }
        }),
      ],
    );
  }
}
