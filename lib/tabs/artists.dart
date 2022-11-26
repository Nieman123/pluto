import 'package:flutter/material.dart';

import '../src/contact_me/data.dart';
import '../src/contact_me/my_bio.dart';
import '../src/custom/custom_text.dart';
import '../src/home/social_media_bar.dart';
import '../src/html_open_link.dart';
import '../src/theme/config.dart';
import '../src/theme/custom_theme.dart';

class Artist extends StatefulWidget {
  const Artist({Key? key}) : super(key: key);

  @override
  _ArtistState createState() => _ArtistState();
}

class _ArtistState extends State<Artist> {
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
                      text: 'MEET THE ARTISTS',
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
                  Column(
                    children: [
                      Container(
                          width: 190.0,
                          height: 190.0,
                          decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              image: DecorationImage(
                                  fit: BoxFit.fill,
                                  image: NetworkImage(
                                      'https://i.imgur.com/BoN9kdC.png')))),
                      const Text('RHiNO', textScaleFactor: 1.5)
                    ],
                  )
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
                    Padding(
                      padding: const EdgeInsets.all(15.0),
                      child: SizedBox(
                        child: Column(
                          children: [
                            CustomText(
                                text: 'MEET THE ARTISTS',
                                fontSize: 35,
                                color: Theme.of(context).primaryColorLight),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Column(
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 15.0, vertical: 15.0),
                                      child: Container(
                                        width: 150.0,
                                        height: 150.0,
                                        decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            image: DecorationImage(
                                                fit: BoxFit.fill,
                                                image: NetworkImage(
                                                    'https://i.imgur.com/2NAb0MC.png'))),
                                      ),
                                    ),
                                    CustomText(
                                        text: 'RHiNO',
                                        fontSize: 18,
                                        color: Theme.of(context)
                                            .primaryColorLight),
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 15.0, vertical: 15.0),
                                      child: Container(
                                        width: 150.0,
                                        height: 150.0,
                                        decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            image: DecorationImage(
                                                fit: BoxFit.fill,
                                                image: NetworkImage(
                                                    'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-19/175323560_886117311934118_4716446223261693581_n.jpg?stp=dst-jpg_s320x320&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_cat=102&_nc_ohc=PHA52X8FIngAX_Gkes3&tn=JL6pHt1nbYlFCL_1&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfBPJFDRkm6rOExm6nrhNymppER0th69TaNpJHJT8lQN4g&oe=6386F714&_nc_sid=8fd12b'))),
                                      ),
                                    ),
                                    CustomText(
                                        text: 'DIVINE THUD',
                                        fontSize: 18,
                                        color: Theme.of(context)
                                            .primaryColorLight),
                                  ],
                                ),
                                Column(
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 15.0, vertical: 15.0),
                                      child: Container(
                                        width: 150.0,
                                        height: 150.0,
                                        decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            image: DecorationImage(
                                                fit: BoxFit.fill,
                                                image: NetworkImage(
                                                    'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-19/279705905_693326371718295_2803083800607127841_n.jpg?stp=dst-jpg_s320x320&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_cat=103&_nc_ohc=RC78rcXuYUkAX94gP5K&tn=JL6pHt1nbYlFCL_1&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfB9TMovB85Ha9gbmIRehI1UCsYzeEax2rwMS_OXKsBCBQ&oe=63865EC8&_nc_sid=8fd12b'))),
                                      ),
                                    ),
                                    CustomText(
                                        text: 'NIEMAN',
                                        fontSize: 18,
                                        color: Theme.of(context)
                                            .primaryColorLight),
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 15.0, vertical: 15.0),
                                      child: Container(
                                        width: 150.0,
                                        height: 150.0,
                                        decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            image: DecorationImage(
                                                fit: BoxFit.fill,
                                                image: NetworkImage(
                                                    'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-19/313222765_171434642205856_3148233746938611897_n.jpg?stp=dst-jpg_s320x320&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_cat=104&_nc_ohc=fXQ3SnjlbCcAX9rZ_q6&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfAm96Im3aKrCkqXXOiUICSLrwPh4Ee7Lj39trwpJQpdsQ&oe=63877EED&_nc_sid=8fd12b'))),
                                      ),
                                    ),
                                    CustomText(
                                        text: 'DJ DAGGETT',
                                        fontSize: 18,
                                        color: Theme.of(context)
                                            .primaryColorLight),
                                  ],
                                ),
                              ],
                            )
                          ],
                        ),
                      ),
                    )
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
