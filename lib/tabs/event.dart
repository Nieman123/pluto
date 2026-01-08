import 'package:carousel_slider_plus/carousel_slider_plus.dart';
//import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
//import 'package:url_launcher/url_launcher.dart';

import '../src/custom/custom_text.dart';

class Event extends StatefulWidget {
  const Event({Key? key}) : super(key: key);

  @override
  _EventState createState() => _EventState();
}

class _EventState extends State<Event> {
  bool isHover = false;
  String lastSaturday = '';
  String thirdSaturday = '';
  final imageList = [
                        [
                          'assets/gallery/2.webp',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-10_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/13.webp',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-12_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/15.webp',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-3_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        ['assets/gallery/4.webp', 'Photo by @nickyg.photos'],
                        [
                          'assets/gallery/elysium-11_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-9_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-8_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-1_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/11.webp',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-2_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-7_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/10.webp',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-6_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/elysium-4_resized.jpg',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/14.webp',
                          'Photo by @tatehunna.photography'
                        ],
                        [
                          'assets/gallery/1.webp',
                          'Pluto at the Full Moon Gathering'
                        ],
                      ];

  // Future<void> _launchURL(String url) async {
  //   final uri = Uri.parse(url);
  //   if (await canLaunchUrl(uri)) {
  //     await launchUrl(uri);
  //     await FirebaseAnalytics.instance.logEvent(
  //       name: 'ticket_button_click',
  //       parameters: {
  //         'button': 'tickets',
  //       },
  //     );
  //   } else {
  //     throw 'Could not launch $uri';
  //   }
  // }

  @override
  void initState() {
    super.initState();
    calculateThirdSaturday();
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    //final double height = MediaQuery.of(context).size.height;

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
                      text: 'UPCOMING EVENTS',
                      fontSize: 48,
                      color: Theme.of(context).primaryColorLight),
                  Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5.0),
                      child: Column(
                        children: [
                          CustomText(
                              text: 'ManaFest 2026',
                              fontSize: 48,
                              color: Theme.of(context).primaryColorLight),
                          // Padding(
                          //   padding: const EdgeInsets.symmetric(vertical: 20.0),
                          //   child: CustomText(
                          //       text: 'Open Decks 8-10PM!',
                          //       fontSize: 28,
                          //       color: Theme.of(context)
                          //           .primaryColorLight
                          //           .withOpacity(0.7)),
                          // ),
                          // CustomText(
                          //     text: 'Saturday, October 19th 8PM-2AM',
                          //     fontSize: 28,
                          //     color: Theme.of(context)
                          //         .primaryColorLight
                          //         .withOpacity(0.7)),
                          // Padding(
                          //   padding: const EdgeInsets.only(top: 15.0),
                          //   child: ElevatedButton(
                          //     onPressed: () async {
                          //       GoRouter.of(context).go('/campout');
                          //     },
                          //     style: ButtonStyle(
                          //       backgroundColor: MaterialStateProperty.all(Colors
                          //           .purple), // You can change this to your desired color
                          //       foregroundColor: MaterialStateProperty.all(Colors
                          //           .white), // You can change this to your desired color
                          //     ),
                          //     child: Padding(
                          //       padding: const EdgeInsets.all(8.0),
                          //       child: CustomText(
                          //           text: 'CLICK FOR PASSES/INFO',
                          //           fontSize: 28,
                          //           color: Theme.of(context)
                          //               .primaryColorLight
                          //               .withOpacity(0.7)),
                          //     ),
                          //   ),
                          // ),
                        ],
                      )),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: Card(
                      semanticContainer: true,
                      clipBehavior: Clip.antiAliasWithSaveLayer,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10.0),
                      ),
                      elevation: 5,
                      margin: const EdgeInsets.all(20.0),
                      child: Image.asset(
                        'assets/events/Mana-Fest-2026-Flyer-half.png',
                        fit: BoxFit.fill,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: CarouselSlider(
                      options: CarouselOptions(
                        aspectRatio: 1,
                        autoPlay: true,
                        autoPlayInterval: const Duration(seconds: 4),
                        enlargeCenterPage: false,
                      ),
                      items: imageList.map((i) {
                        return Builder(
                          builder: (BuildContext context) {
                            return Stack(
                              children: [
                                Container(
                                    width: MediaQuery.of(context).size.width,
                                    margin: const EdgeInsets.symmetric(
                                        horizontal: 5.0),
                                    decoration: BoxDecoration(
                                      color: Colors.amber,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child:
                                        Image.asset(i[0], fit: BoxFit.cover)),
                                Align(
                                  alignment: const Alignment(
                                      0.0, 0.9), // Bottom center
                                  child: Padding(
                                    padding: const EdgeInsets.all(10.0),
                                    child: Text(
                                      i[1],
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w100,
                                        backgroundColor: Colors.black54,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            );
                          },
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            );
          } else {
            //Desktop Layout
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
                              text: 'UPCOMING EVENTS',
                              fontSize: 48,
                              color: Theme.of(context).primaryColorLight),
                          Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 5.0),
                              child: Column(
                                children: [
                                  CustomText(
                                      text: 'ManaFest 2026',
                                      fontSize: 48,
                                      color:
                                          Theme.of(context).primaryColorLight),
                                  // Padding(
                                  //   padding: const EdgeInsets.symmetric(
                                  //       vertical: 20.0),
                                  //   child: CustomText(
                                  //       text: 'Open decks 8-10PM!',
                                  //       fontSize: 28,
                                  //       color: Theme.of(context)
                                  //           .primaryColorLight
                                  //           .withOpacity(0.7)),
                                  // ),
                                  // CustomText(
                                  //     text: 'May 29 - June 1, 2025',
                                  //     fontSize: 28,
                                  //     color: Theme.of(context)
                                  //         .primaryColorLight
                                  //         .withOpacity(0.7)),
                                  // Padding(
                                  //   padding: const EdgeInsets.only(top: 15.0),
                                  //   child: ElevatedButton(
                                  //     onPressed: () async {
                                  //       GoRouter.of(context).go('/campout');
                                  //     },
                                  //     style: ButtonStyle(
                                  //       backgroundColor:
                                  //           WidgetStateProperty.all(Colors
                                  //               .purple), // You can change this to your desired color
                                  //       foregroundColor:
                                  //           WidgetStateProperty.all(Colors
                                  //               .white), // You can change this to your desired color
                                  //     ),
                                  //     child: Padding(
                                  //       padding: const EdgeInsets.all(8.0),
                                  //       child: CustomText(
                                  //           text: 'CLICK FOR PASSES/INFO',
                                  //           fontSize: 28,
                                  //           color: Theme.of(context)
                                  //               .primaryColorLight
                                  //               .withOpacity(0.7)),
                                  //     ),
                                  //   ),
                                  // ),
                                ],
                              )),
                          SizedBox(
                            width: width / 3,
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 8.0),
                              child: Card(
                                semanticContainer: true,
                                clipBehavior: Clip.antiAliasWithSaveLayer,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10.0),
                                ),
                                elevation: 5,
                                margin: EdgeInsets.all(10),
                                child: Image.asset(
                                  'assets/events/Mana-Fest-2026-Flyer-half.png',
                                  fit: BoxFit.fill,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                SizedBox(
                  width: width / 2,
                  child: Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: CarouselSlider(
                      options: CarouselOptions(
                        aspectRatio: 1,
                        autoPlay: true,
                        autoPlayInterval: const Duration(seconds: 4),
                        enlargeCenterPage: false,
                      ),
                      items: imageList.map((i) {
                        return Builder(
                          builder: (BuildContext context) {
                            return Stack(
                              children: [
                                Container(
                                    width: MediaQuery.of(context).size.width,
                                    margin: const EdgeInsets.symmetric(
                                        horizontal: 5.0),
                                    decoration: BoxDecoration(
                                      color: Colors.amber,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child:
                                        Image.asset(i[0], fit: BoxFit.cover)),
                                Align(
                                  alignment: const Alignment(
                                      0.0, 0.9), // Bottom center
                                  child: Padding(
                                    padding: const EdgeInsets.all(10.0),
                                    child: Text(
                                      i[1],
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w100,
                                        backgroundColor: Colors.black54,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            );
                          },
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ],
            );
          }
        }),
      ],
    );
  }

  void calculateLastSaturday() {
    // Set date to the last day of the month
    DateTime dt = DateTime(DateTime.now().year, DateTime.now().month + 1, 0);

    // Find the last Saturday of the month
    while (dt.weekday != DateTime.saturday) {
      dt = dt.subtract(Duration(days: 1));
    }

    setState(() {
      lastSaturday = formatDateTime(dt);
    });
  }

  void calculateThirdSaturday() {
    // Set date to the first day of the month
    DateTime dt = DateTime(DateTime.now().year, DateTime.now().month, 1);

    // Find the first Saturday of the month
    while (dt.weekday != DateTime.saturday) {
      dt = dt.add(Duration(days: 1));
    }

    // Add 14 days to get to the third Saturday
    dt = dt.add(Duration(days: 14));

    setState(() {
      thirdSaturday = formatDateTime(
          dt); // Assuming formatDateTime is a method that formats the DateTime object as desired
    });
  }

  String formatDateTime(DateTime dateTime) {
    int dayNum = dateTime.day;
    String daySuffix;

    if (!(dayNum >= 11 && dayNum <= 13)) {
      switch (dayNum % 10) {
        case 1:
          daySuffix = 'st';
          break;
        case 2:
          daySuffix = 'nd';
          break;
        case 3:
          daySuffix = 'rd';
          break;
        default:
          daySuffix = 'th';
      }
    } else {
      daySuffix = 'th';
    }

    final DateFormat formatter =
        DateFormat('MMMM d', 'en_US'); // e.g. August 26
    String formatted = formatter.format(dateTime);

    return "$formatted$daySuffix"; // e.g. August 26th
  }
}
