import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/calendar_picker.dart';

void main() {
  const String google =
      'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const String apple = 'webcal://pluto.events/events/festival/calendar.ics';

  test('older calendar links open the picker without downloading a file', () {
    expect(
        calendarPickerUrl('https://pluto.events/events/festival/calendar.ics'),
        'https://pluto.events/events/festival?calendar=1');
    expect(
        calendarPickerUrl(
            'https://pluto.events/events/festival?ref=email#tickets'),
        'https://pluto.events/events/festival?ref=email&calendar=1#tickets');
  });

  for (final bool isApple in <bool>[false, true]) {
    testWidgets(
        'calendar picker hands off the ${isApple ? 'Apple' : 'Google'} choice',
        (tester) async {
      String? opened;
      bool? native;
      await tester.pumpWidget(
          MaterialApp(home: Scaffold(body: Builder(builder: (context) {
        return TextButton(
            onPressed: () => showCalendarPicker(context,
                    google: google,
                    apple: apple, launch: (url, appleChoice) async {
                  opened = url;
                  native = appleChoice;
                  return true;
                }),
            child: const Text('Open calendar picker'));
      }))));
      await tester.tap(find.text('Open calendar picker'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Google Calendar'), findsOneWidget);
      expect(find.text('Apple Calendar'), findsOneWidget);
      await tester
          .tap(find.text(isApple ? 'Apple Calendar' : 'Google Calendar'));
      await tester.pumpAndSettle();
      expect(opened, isApple ? apple : google);
      expect(native, isApple);
      expect(find.byType(AlertDialog), findsNothing);
    });
  }
}
