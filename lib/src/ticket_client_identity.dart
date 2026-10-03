import 'dart:math';
import 'ticket_access_store.dart';

String? _clientIdentity;
String ticketClientIdentity() {
  if (_clientIdentity != null) return _clientIdentity!;
  const String key = 'pluto-ticket-client';
  try {
    final String? saved = ticketAccessRead(key);
    if (saved != null && RegExp(r'^[a-f0-9]{64}$').hasMatch(saved)) {
      return _clientIdentity = saved;
    }
  } catch (_) {/* Storage restrictions do not prevent ticket access. */}
  final Random random = Random.secure();
  final String value = List<String>.generate(
      32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  _clientIdentity = value;
  try {
    ticketAccessWrite(key, value);
  } catch (_) {/* Keep this process identity. */}
  return value;
}
