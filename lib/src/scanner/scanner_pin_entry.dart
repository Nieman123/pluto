import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

bool get nativeTicketScanningSupported =>
    !kIsWeb &&
    [
      TargetPlatform.iOS,
      TargetPlatform.android,
    ].contains(defaultTargetPlatform);

/// A discreet native-only link shared by account sign-in and profile.
class ScannerPinEntry extends StatelessWidget {
  const ScannerPinEntry({super.key});

  @override
  Widget build(BuildContext context) {
    if (!nativeTicketScanningSupported) return const SizedBox.shrink();
    return Center(
      child: TextButton(
        onPressed: () {
          FocusScope.of(context).unfocus();
          context.push('/ticket-scanner');
        },
        style: TextButton.styleFrom(foregroundColor: const Color(0xFFE3C2FF)),
        child: const Text('Enter Scanner PIN'),
      ),
    );
  }
}
