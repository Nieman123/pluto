import 'package:flutter/material.dart';

import '../src/contact_me/data.dart';
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
                  Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 15.0, vertical: 15.0),
                        child: Container(
                          width: 250.0,
                          height: 250.0,
                          decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              image: DecorationImage(
                                  fit: BoxFit.fill,
                                  image: NetworkImage(
                                      'https://i.imgur.com/ph79TGT.png'))),
                        ),
                      ),
                      CustomText(
                          text: 'DIVINE THUD',
                          fontSize: 18,
                          color: Theme.of(context).primaryColorLight),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 15.0, vertical: 15.0),
                        child: Container(
                          width: 250.0,
                          height: 250.0,
                          decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              image: DecorationImage(
                                  fit: BoxFit.fill,
                                  image: NetworkImage(
                                      'https://i.imgur.com/5I4TqyV.jpg'))),
                        ),
                      ),
                      CustomText(
                          text: 'NIEMAN',
                          fontSize: 18,
                          color: Theme.of(context).primaryColorLight),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 15.0, vertical: 15.0),
                        child: Container(
                          width: 250.0,
                          height: 250.0,
                          decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              image: DecorationImage(
                                  fit: BoxFit.fill,
                                  image: NetworkImage(
                                      'https://i.imgur.com/Qn41yP4.png'))),
                        ),
                      ),
                      CustomText(
                          text: 'DJ DAGGETT',
                          fontSize: 18,
                          color: Theme.of(context).primaryColorLight),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 15.0, vertical: 15.0),
                        child: Container(
                          width: 250.0,
                          height: 250.0,
                          decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              image: DecorationImage(
                                  fit: BoxFit.cover,
                                  image: NetworkImage(
                                      'https://i.imgur.com/a0LusKi.png'))),
                        ),
                      ),
                      CustomText(
                          text: 'RABI!D RON!E',
                          fontSize: 18,
                          color: Theme.of(context).primaryColorLight),
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
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                SizedBox(
                                  width: (width * .8) / 2,
                                  child: Column(
                                    children: [
                                      GestureDetector(
                                        onTap: () {
                                          showDialog(
                                            context: context,
                                            builder: (BuildContext context) {
                                              return AlertDialog(
                                                title: CustomText(
                                                    text: 'DIVINE THUD',
                                                    fontSize: 18,
                                                    color: Theme.of(context)
                                                        .primaryColorLight),
                                                content: const CustomText(
                                                    text:
                                                        'Description of the DJ goes here',
                                                    fontSize: 16,
                                                    color: Colors.grey),
                                                actions: [
                                                  TextButton(
                                                    child: CustomText(
                                                        text: 'Close',
                                                        fontSize: 16,
                                                        color: Theme.of(context)
                                                            .primaryColor),
                                                    onPressed: () {
                                                      Navigator.of(context)
                                                          .pop();
                                                    },
                                                  ),
                                                ],
                                              );
                                            },
                                          );
                                        },
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 15.0, vertical: 15.0),
                                          child: Container(
                                            width: 350.0,
                                            height: 350.0,
                                            decoration: const BoxDecoration(
                                                shape: BoxShape.circle,
                                                image: DecorationImage(
                                                    fit: BoxFit.fill,
                                                    image: NetworkImage(
                                                        'https://i.imgur.com/ph79TGT.png'))),
                                          ),
                                        ),
                                      ),
                                      Column(
                                        children: [
                                          CustomText(
                                              text: 'DIVINE THUD',
                                              fontSize: 18,
                                              color: Theme.of(context)
                                                  .primaryColorLight),
                                          // Padding(
                                          //   padding: const EdgeInsets.all(8.0),
                                          //   child: RichText(
                                          //     text: const TextSpan(
                                          //       text:
                                          //           "Divine Thud style takes inspiration from Desert Hearts and brings amazing house tunes you've probably heard at festival.",
                                          //       style: TextStyle(
                                          //           color: Colors.white),
                                          //     ),
                                          //   ),
                                          // )
                                          Padding(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 15.0,
                                                vertical: 15.0),
                                            child: Container(
                                              width: 350.0,
                                              height: 350.0,
                                              decoration: const BoxDecoration(
                                                  shape: BoxShape.circle,
                                                  image: DecorationImage(
                                                      fit: BoxFit.cover,
                                                      image: NetworkImage(
                                                          'https://i.imgur.com/a0LusKi.png'))),
                                            ),
                                          ),
                                          Column(
                                            children: [
                                              CustomText(
                                                  text: 'RABI!D RON!E',
                                                  fontSize: 18,
                                                  color: Theme.of(context)
                                                      .primaryColorLight),
                                              // Padding(
                                              //   padding: const EdgeInsets.all(8.0),
                                              //   child: RichText(
                                              //     text: const TextSpan(
                                              //       text:
                                              //           'Inspired by Dirty Bird and Off the Grid records, Nieman is a DJ and producer from Asheville, NC.',
                                              //       style: TextStyle(
                                              //           color: Colors.white),
                                              //     ),
                                              //   ),
                                              // )
                                            ],
                                          )
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                SizedBox(
                                  width: (width * .8) / 2,
                                  child: Column(
                                    children: [
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 15.0, vertical: 15.0),
                                        child: Container(
                                          width: 350.0,
                                          height: 350.0,
                                          decoration: const BoxDecoration(
                                              shape: BoxShape.circle,
                                              image: DecorationImage(
                                                  fit: BoxFit.fill,
                                                  image: NetworkImage(
                                                      'https://i.imgur.com/5I4TqyV.jpg'))),
                                        ),
                                      ),
                                      Column(
                                        children: [
                                          CustomText(
                                              text: 'NIEMAN',
                                              fontSize: 18,
                                              color: Theme.of(context)
                                                  .primaryColorLight),
                                          // Padding(
                                          //   padding: const EdgeInsets.all(8.0),
                                          //   child: RichText(
                                          //     text: const TextSpan(
                                          //       text:
                                          //           'Inspired by Dirty Bird and Off the Grid records, Nieman is a DJ and producer from Asheville, NC.',
                                          //       style: TextStyle(
                                          //           color: Colors.white),
                                          //     ),
                                          //   ),
                                          // )
                                        ],
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 15.0, vertical: 15.0),
                                        child: Container(
                                          width: 350.0,
                                          height: 350.0,
                                          decoration: const BoxDecoration(
                                              shape: BoxShape.circle,
                                              image: DecorationImage(
                                                  fit: BoxFit.cover,
                                                  image: NetworkImage(
                                                      'https://i.imgur.com/Qn41yP4.png'))),
                                        ),
                                      ),
                                      Column(
                                        children: [
                                          CustomText(
                                              text: 'DJ DAGGETT',
                                              fontSize: 18,
                                              color: Theme.of(context)
                                                  .primaryColorLight),
                                          // Padding(
                                          //   padding: const EdgeInsets.all(8.0),
                                          //   child: RichText(
                                          //     text: const TextSpan(
                                          //       text:
                                          //           'Originally from Orlando, FL, DJ Dagget is spinning every thing from throwbacks, to the latest tech house tunes.',
                                          //       style: TextStyle(
                                          //           color: Colors.white),
                                          //     ),
                                          //   ),
                                          // )
                                        ],
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
