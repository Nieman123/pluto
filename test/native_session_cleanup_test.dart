import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_session_cleanup.dart';

void main() {
  test(
      'native logout clears account and guest attendee credentials, preserving door evidence',
      () {
    final attendee = [
      'pluto-ticket-cache-v1:account-uid:mine',
      'pluto-ticket-cache-v1:guest-order:order',
      'pluto-order-order',
      'pluto-holder-transfer',
      'pluto-account-email'
    ];
    final retained = [
      'pluto-native-admission-key',
      'pluto-scanner-session',
      'pluto-ticket-client',
      'unresolved-offline-admission'
    ];
    expect(attendeeKeysToRemoveOnSignOut([...attendee, ...retained]), attendee);
  });
}
