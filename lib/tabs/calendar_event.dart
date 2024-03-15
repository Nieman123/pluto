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
    final double height = MediaQuery.of(context).size.height;
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
                    text: "PLUTO'S PUFF: A 420 FEST",
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
                    ElevatedButton(
                      onPressed: () =>
                          launchUrlString('https://posh.vip/e/plutos-puff'),
                      child: Text('Get Tickets'),
                    ),
                    SizedBox(width: 20), // Spacing between buttons
                    ElevatedButton(
                      onPressed: () =>
                          launchUrlString('https://fb.me/e/2PyOdK3DM'),
                      child: Text('Facebook Event'),
                    ),
                  ],
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
2PM-2AM! On April 20th

To celebrate the holidaze, we will be throwing a huge party at The Getaway! Including vendors, food truck, and amazing music all day.

Hoping to see you there!

Pluto kindly reminds all attendees to adhere to the current local laws and regulations regarding the possession and consumption of cannabis and hemp products. Enjoy responsibly''',
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
                    margin: EdgeInsets.all(10),
                    child: Image.asset(
                      'assets/events/420-fest-v2.webp',
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
