import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher_string.dart';

import '../src/custom/custom_text.dart';

class CalendarEvent extends StatefulWidget {
  const CalendarEvent({Key? key}) : super(key: key);

  @override
  _CalendarEventState createState() => _CalendarEventState();
}

class _CalendarEventState extends State<CalendarEvent> {
  bool isHover = false;

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    //final double height = MediaQuery.of(context).size.height;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10.0),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(15),
                  child: CustomText(
                    text: 'TAURUS SEASON BIRTHDAY BASH',
                    fontSize: constraints.maxWidth < 1000 ? 28 : 35,
                    color: Theme.of(context).primaryColorLight,
                  ),
                ),
                const SizedBox(
                  height: 20,
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Ink(
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [
                            Color.fromARGB(255, 61, 15, 70),
                            Color.fromARGB(255, 105, 11, 43)
                          ],
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                        ),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: ElevatedButton(
                        onPressed: () => {
                          launchUrlString(
                              'https://posh.vip/e/taurus-season-birthday-bash'),
                          FirebaseAnalytics.instance.logEvent(
                            name: 'getaway_18_page_ticket_button',
                          )
                        },
                        child: const Text('Get Tickets'),
                        style: ElevatedButton.styleFrom(
                          primary: Colors.transparent,
                          onSurface: Colors.transparent,
                          shadowColor: Colors.transparent,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 30, vertical: 20),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(5)),
                          textStyle: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 20), // Spacing between buttons
                    Ink(
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [
                            Color.fromARGB(255, 61, 15, 70),
                            Color.fromARGB(255, 105, 11, 43)
                          ],
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                        ),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: ElevatedButton(
                        onPressed: () => {
                          launchUrlString(
                              'https://www.facebook.com/events/806802474214296/'),
                          FirebaseAnalytics.instance.logEvent(
                            name: '420_fest_page_facebook_button',
                          )
                        },
                        child: const Text('Facebook Event'),
                        style: ElevatedButton.styleFrom(
                          primary: Colors.transparent,
                          onSurface: Colors.transparent,
                          shadowColor: Colors.transparent,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 30, vertical: 20),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(5)),
                          textStyle: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    )
                  ],
                ),
                const SizedBox(
                  height: 20,
                ),
                RichText(
                  textScaleFactor: 1.5,
                  text: TextSpan(
                    children: [
                      TextSpan(
                        text:
                            'Click to follow us on Instagram for Event Updates!',
                        style: const TextStyle(
                          color: Colors
                              .blue, // Change this color to match your app's design
                          decoration: TextDecoration.underline,
                        ),
                        recognizer: TapGestureRecognizer()
                          ..onTap = () async {
                            const url =
                                'https://www.instagram.com/pluto.events.avl';
                            if (await canLaunchUrlString(url)) {
                              await launchUrlString(url);
                            } else {
                              throw 'Could not launch $url';
                            }
                          },
                      ),
                    ],
                  ),
                ),
                const SizedBox(
                  height: 20,
                ),
                SizedBox(
                  width: width * .7,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: CustomText(
                      text: '''
Saturday, May 18th

Come celebrate the spirit of Taurus at our Taurus Season Birthday Bash 🎉

Join us at The Getaway, Asheville’s favorite river bar, which it out of the way in a good way. Whether you're a Taurus or just love one, this night is dedicated to celebrating the reliability, dedication, and warmth that a Taurus brings into our lives. 🌟''',
                      fontSize: constraints.maxWidth < 1000 ? 14 : 18,
                      color:
                          Theme.of(context).primaryColorLight.withOpacity(0.7),
                    ),
                  ),
                ),
                const SizedBox(
                  height: 20,
                ),
                SizedBox(
                  width: width * .7,
                  child: Card(
                    semanticContainer: true,
                    clipBehavior: Clip.antiAliasWithSaveLayer,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10.0),
                    ),
                    elevation: 5,
                    margin: const EdgeInsets.all(10),
                    child: Image.asset(
                      'assets/events/getaway-may-18th_half-min.png',
                      fit: BoxFit.fill,
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
