import 'dart:convert';
import 'dart:html';
import 'dart:io' as io;

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../src/contact_me/data.dart';
import '../src/custom/custom_text.dart';

class CalendarEvent extends StatefulWidget {
  const CalendarEvent({Key? key}) : super(key: key);

  @override
  _CalendarEventState createState() => _CalendarEventState();
}

class _CalendarEventState extends State<CalendarEvent> {
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
                      text: 'EVERY 2ND SATURDAY OF THE MONTH!',
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
                    padding: const EdgeInsets.symmetric(vertical: 5.0),
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          textStyle: const TextStyle(fontSize: 30),
                          backgroundColor: Colors.black45),
                      onPressed: () async {
                        await downloadWaterStreetICS();
                      },
                      child: const Text('TAP HERE TO ADD TO YOUR CALENDAR'),
                    ),
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
                              text: 'EVERY 2ND SATURDAY OF THE MONTH!',
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
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 5.0),
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  textStyle: const TextStyle(fontSize: 30),
                                  backgroundColor: Colors.black45),
                              onPressed: () async {
                                await downloadWaterStreetICS();
                              },
                              child: const Text(
                                  'TAP HERE TO ADD TO YOUR CALENDAR'),
                            ),
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

  Future<void> downloadWaterStreetICS() async {
    await FirebaseAnalytics.instance.logEvent(
      name: 'cal_download_clicked_waterstreet',
    );
    final rawData = await rootBundle
        .load(r'assets/experience/HouseNightsAtWaterStreet.ics');
    final content = base64Encode(rawData.buffer.asUint8List());
    final anchor = AnchorElement(
        href: 'data:application/octet-stream;charset=utf-16le;base64,$content')
      ..setAttribute('download', 'HouseNightsAtWaterStreet.ics')
      ..click();
  }
}
