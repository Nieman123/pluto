import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher_string.dart';

typedef CalendarLauncher = Future<bool> Function(String url, bool apple);

String calendarPickerUrl(String url) {
  final Uri uri = Uri.parse(url);
  return uri.replace(
      path: uri.path.replaceFirst(RegExp(r'/calendar\.ics$'), ''),
      queryParameters: <String, String>{
        ...uri.queryParameters,
        'calendar': '1'
      }).toString();
}

Future<void> showCalendarPicker(BuildContext context,
    {required String google,
    required String apple,
    ThemeData? theme,
    CalendarLauncher? launch}) async {
  final CalendarLauncher open = launch ??
      (url, isApple) => launchUrlString(url,
          mode: LaunchMode.externalApplication,
          webOnlyWindowName: isApple ? '_self' : '_blank');
  await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        Future<void> choose(String url, bool isApple) async {
          // Start the handoff during the tap gesture, before closing the picker.
          final Future<bool> opening = open(url, isApple);
          Navigator.of(dialogContext).pop();
          try {
            if (await opening) return;
          } catch (_) {
            // Let the guest retry if the device has no calendar handler.
          }
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text(
                    'Your calendar could not open. Try another calendar or open Pluto in your browser.')));
          }
        }

        return Theme(
            data: theme ?? Theme.of(context),
            child: AlertDialog(
                backgroundColor: const Color(0xff21172b),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(22),
                    side: const BorderSide(color: Color(0xff705778))),
                titleTextStyle: (theme ?? Theme.of(context))
                    .textTheme
                    .titleLarge
                    ?.copyWith(color: const Color(0xfff7f3fc)),
                contentTextStyle: (theme ?? Theme.of(context))
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: const Color(0xffd4c5df)),
                title: const Text('Add to Calendar'),
                content: SizedBox(
                    width: 360,
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          const Text(
                              'Choose your calendar, then confirm there.'),
                          const SizedBox(height: 16),
                          ListTile(
                              textColor: const Color(0xfff7f3fc),
                              iconColor: const Color(0xffc4a2ff),
                              subtitleTextStyle: const TextStyle(
                                  color: Color(0xffd4c5df), fontSize: 12),
                              leading: const Icon(Icons.event_outlined),
                              title: const Text('Google Calendar'),
                              subtitle:
                                  const Text('Review and save this event'),
                              onTap: () => choose(google, false)),
                          ListTile(
                              textColor: const Color(0xfff7f3fc),
                              iconColor: const Color(0xffc4a2ff),
                              subtitleTextStyle: const TextStyle(
                                  color: Color(0xffd4c5df), fontSize: 12),
                              leading:
                                  const Icon(Icons.calendar_month_outlined),
                              title: const Text('Apple Calendar'),
                              subtitle: const Text(
                                  'Subscribe to this event and its updates'),
                              onTap: () => choose(apple, true)),
                        ])),
                actions: <Widget>[
                  TextButton(
                      style: TextButton.styleFrom(
                          foregroundColor: const Color(0xffc4a2ff)),
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('Cancel'))
                ]));
      });
}
