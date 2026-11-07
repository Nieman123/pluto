import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

bool get nativeTicketScanningSupported =>
    !kIsWeb &&
    [
      TargetPlatform.iOS,
      TargetPlatform.android,
    ].contains(defaultTargetPlatform);

/// Shared by account sign-in and profile. PINs travel only in transient route
/// state, never in URLs, analytics, Firebase credentials, or persistent storage.
class ScannerPinEntry extends StatefulWidget {
  const ScannerPinEntry({super.key});
  @override
  State<ScannerPinEntry> createState() => _ScannerPinEntryState();
}

class _ScannerPinEntryState extends State<ScannerPinEntry> {
  final _pin = TextEditingController();
  String? _error;
  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  void _open() {
    if (_pin.text.length != 8) {
      setState(() => _error = 'Enter your 8-digit scanner PIN.');
      return;
    }
    final pin = _pin.text;
    _pin.clear();
    FocusScope.of(context).unfocus();
    context.push('/ticket-scanner', extra: pin);
  }

  @override
  Widget build(BuildContext context) {
    if (!nativeTicketScanningSupported) return const SizedBox.shrink();
    return Card(
      color: Colors.black.withValues(alpha: .6),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Ticket scanner',
              style: TextStyle(
                fontSize: 20,
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Working the door? Use your scanner PIN. No Pluto account needed.',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _pin,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.go,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(8),
              ],
              onSubmitted: (_) => _open(),
              decoration: InputDecoration(
                labelText: '8-digit scanner PIN',
                errorText: _error,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _open,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Open ticket scanner'),
            ),
            TextButton(
              onPressed: () => context.push('/ticket-scanner'),
              child: const Text('Resume scanner session'),
            ),
          ],
        ),
      ),
    );
  }
}
