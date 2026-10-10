import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/account_deletion.dart';
import 'package:pluto/src/ticket_account_flow.dart';
import 'package:pluto/src/ticket_session_cleanup.dart';

void main() {
  test(
      'linked Apple accounts require Apple confirmation even with another provider',
      () {
    expect(
        deletionProvider(['password', 'apple.com', 'google.com']), 'apple.com');
    expect(deletionProvider(['google.com']), 'google.com');
    expect(deletionProvider(['password']), 'password');
    expect(() => deletionProvider(['unknown']), throwsStateError);
  });
  test(
      'auth returns to deletion safely without accepting external destinations',
      () {
    expect(signedInDestination('/delete-account'), '/delete-account');
    expect(signedInDestination('https://evil.example/delete-account'), '/');
    expect(signedInDestination('/delete-account#private'), '/delete-account');
  });
  test(
      'deletion removes checkout and attendee proofs while preserving its completion receipt',
      () {
    final keys = [
      'pluto-order-1',
      'pluto-holder-1',
      'pluto-account-1',
      'pluto-checkout-1',
      'pluto-rsvp-upgrade-1',
      'pluto-ticket-cache-v1:uid',
      'pluto-deletion-receipt',
      'pluto-door-proof'
    ];
    expect(attendeeKeysToRemoveOnDeletion(keys), keys.take(6).toList());
  });
}
