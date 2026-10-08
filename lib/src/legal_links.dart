import 'package:flutter/material.dart';
import 'html_open_link.dart';

/// Public policy links resolve against the same website as this app environment.
class LegalLinks extends StatelessWidget {
  const LegalLinks({super.key, this.includeDeletion = false, this.openLink});

  final bool includeDeletion;
  final Future<void> Function(String)? openLink;

  @override
  Widget build(BuildContext context) {
    final links = <String, String>{
      'Privacy Policy': '/privacy',
      'Terms of Use': '/terms',
      if (includeDeletion) 'Request account deletion': '/delete-account',
    };
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 4,
      children: links.entries
          .map((link) => TextButton(
                onPressed: () async {
                  try {
                    await (openLink ?? htmlOpenLink)(link.value);
                  } catch (_) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text(
                            'Could not open the page. Visit pluto.events or contact@pluto.events for help.'),
                      ));
                    }
                  }
                },
                style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFFE3C2FF)),
                child: Text(link.key),
              ))
          .toList(),
    );
  }
}
