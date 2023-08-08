import 'package:carousel_slider/carousel_slider.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../src/custom/custom_text.dart';

class Event extends StatefulWidget {
  const Event({Key? key}) : super(key: key);

  @override
  _EventState createState() => _EventState();
}

class _EventState extends State<Event> {
  bool isHover = false;
  String lastSaturday = '';

  @override
  void initState() {
    super.initState();
    calculateLastSaturday();
  }

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
                      text: 'UPCOMING EVENTS',
                      fontSize: 48,
                      color: Theme.of(context).primaryColorLight),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20.0),
                    child: CustomText(
                        text:
                            "LIVIN' ON THE LEDGE\nAT W XYZ BAR\n August 12th 2-6PM",
                        fontSize: 28,
                        color: Theme.of(context)
                            .primaryColorLight
                            .withOpacity(0.7)),
                  ),
                  Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5.0),
                      child: Column(
                        children: [
                          CustomText(
                              text: 'PLUTO AT THE GETAWAY',
                              fontSize: 48,
                              color: Theme.of(context).primaryColorLight),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 20.0),
                            child: CustomText(
                                text: 'EVERY LAST SATURDAY OF THE MONTH',
                                fontSize: 28,
                                color: Theme.of(context)
                                    .primaryColorLight
                                    .withOpacity(0.7)),
                          ),
                          CustomText(
                              text: '$lastSaturday 8PM-2AM',
                              fontSize: 28,
                              color: Theme.of(context)
                                  .primaryColorLight
                                  .withOpacity(0.7)),
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
                        'assets/experience/getaway-8x11-min.png',
                        fit: BoxFit.fill,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: CarouselSlider(
                      options: CarouselOptions(
                        autoPlay: true,
                        aspectRatio: 2.0,
                        enlargeCenterPage: true,
                      ),
                      items: [
                        [
                          'assets/gallery/1.jpg',
                          'Pluto at the Full Moon Gathering'
                        ],
                        ['assets/gallery/2.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/3.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/4.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/5.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/6.jpg', 'DJ Rab!d Ron!e and Nieman'],
                        ['assets/gallery/7.jpg', 'Family Photo!'],
                        ['assets/gallery/8.jpg', 'DJ Rab!d Ron!e and Nieman'],
                        ['assets/gallery/9.jpg', 'Skate Night at Carrier Park']
                      ].map((i) {
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
                            padding: const EdgeInsets.symmetric(vertical: 20.0),
                            child: CustomText(
                                text:
                                    "LIVIN' ON THE LEDGE\nAT W XYZ BAR\n August 12th 2-6PM",
                                fontSize: 28,
                                color: Theme.of(context)
                                    .primaryColorLight
                                    .withOpacity(0.7)),
                          ),
                          Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 5.0),
                              child: Column(
                                children: [
                                  CustomText(
                                      text: 'PLUTO AT THE GETAWAY',
                                      fontSize: 48,
                                      color:
                                          Theme.of(context).primaryColorLight),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 20.0),
                                    child: CustomText(
                                        text:
                                            'EVERY LAST SATURDAY OF THE MONTH',
                                        fontSize: 28,
                                        color: Theme.of(context)
                                            .primaryColorLight
                                            .withOpacity(0.7)),
                                  ),
                                  CustomText(
                                      text: '$lastSaturday 8PM-2AM',
                                      fontSize: 28,
                                      color: Theme.of(context)
                                          .primaryColorLight
                                          .withOpacity(0.7)),
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
                                  'assets/experience/getaway-8x11-min.png',
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
                        autoPlay: true,
                        aspectRatio: 2.0,
                        enlargeCenterPage: true,
                      ),
                      items: [
                        [
                          'assets/gallery/1.jpg',
                          'Pluto at the Full Moon Gathering'
                        ],
                        ['assets/gallery/2.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/3.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/4.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/5.jpg', 'Photo by @nickyg.photos'],
                        ['assets/gallery/6.jpg', 'DJ Rab!d Ron!e and Nieman'],
                        ['assets/gallery/7.jpg', 'Family Photo!'],
                        ['assets/gallery/8.jpg', 'DJ Rab!d Ron!e and Nieman'],
                        ['assets/gallery/9.jpg', 'Skate Night at Carrier Park']
                      ].map((i) {
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
