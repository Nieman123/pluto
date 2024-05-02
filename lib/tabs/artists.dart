import 'package:flutter/material.dart';

import '../djavatar.dart';
import '../src/custom/custom_text.dart';

class Artist extends StatefulWidget {
  const Artist({Key? key}) : super(key: key);

  @override
  _ArtistState createState() => _ArtistState();
}

class _ArtistState extends State<Artist> {
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
                  CustomText(
                      text: 'TAP TO LEARN MORE',
                      fontSize: 18,
                      color: Theme.of(context).primaryColorLight),
                  const Column(
                    children: [
                      DJAvatar(
                        name: 'JUST NIEMAN',
                        description:
                            'Inspired by Dirty Bird and Off the Grid records, Just Nieman is a multi-genre DJ and producer from Asheville, NC.',
                        image: NetworkImage('https://i.imgur.com/5I4TqyV.jpg'),
                        instagramUrl: 'https://www.instagram.com/justnieman/',
                      ),
                      DJAvatar(
                        name: 'DIVINE THUD',
                        description:
                            "Divine Thud style takes inspiration from Desert Hearts and brings amazing house tunes you've probably heard in the desert.",
                        image: NetworkImage('https://i.imgur.com/FiHtYq3.jpeg'),
                        instagramUrl: 'https://www.instagram.com/divine_thud_/',
                      ),
                      DJAvatar(
                        name: 'DJ DAGGETT',
                        description: """
DAGGETT is an extremely versatile DJ equipped with many years of experience.  
DAGGETT's essence lies in 'open format' DJing, seamlessly blending a spectrum of music genres, from electro to house, across various decades.""",
                        image: NetworkImage('https://i.imgur.com/Qn41yP4.png'),
                        instagramUrl:
                            'https://www.instagram.com/daggett_productions/',
                      ),
                    ],
                  )
                ],
              ),
            );
          } else {
            //Desktop Content
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
                            CustomText(
                                text: 'TAP TO LEARN MORE',
                                fontSize: 20,
                                color: Theme.of(context).primaryColorLight),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                SizedBox(
                                  width: (width * .8) / 2,
                                  child: const Column(
                                    children: [
                                      DJAvatar(
                                        name: 'DIVINE THUD',
                                        description:
                                            "Divine Thud style takes inspiration from Desert Hearts and brings amazing house tunes you've probably heard in the desert.",
                                        image: NetworkImage(
                                            'https://i.imgur.com/FiHtYq3.jpeg'),
                                        instagramUrl:
                                            'https://www.instagram.com/divine_thud_/',
                                      ),
                                    ],
                                  ),
                                ),
                                SizedBox(
                                  width: (width * .8) / 2,
                                  child: const Column(
                                    children: [
                                      DJAvatar(
                                        name: 'JUST NIEMAN',
                                        description:
                                            'Inspired by Dirty Bird and Off the Grid records, Just Nieman is a multi-genre DJ and producer from Asheville, NC.',
                                        image: NetworkImage(
                                            'https://i.imgur.com/5I4TqyV.jpg'),
                                        instagramUrl:
                                            'https://www.instagram.com/justnieman/',
                                      ),
                                      DJAvatar(
                                        name: 'DJ DAGGETT',
                                        description: """
DAGGETT is an extremely versatile DJ equipped with many years of experience.  
DAGGETT's essence lies in 'open format' DJing, seamlessly blending a spectrum of music genres, from electro to house, across various decades.""",
                                        image: NetworkImage(
                                            'https://i.imgur.com/Qn41yP4.png'),
                                        instagramUrl:
                                            'https://www.instagram.com/daggett_productions/',
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
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
