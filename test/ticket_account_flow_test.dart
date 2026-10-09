import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_account_flow.dart';

void main() {
  test(
      'successful sign-in defaults to dashboard and preserves safe wallet returns',
      () {
    expect(signedInDestination(null), '/');
    expect(signedInDestination('/tickets?order=order-123&accessKey=secret'),
        '/tickets?order=order-123');
    expect(signedInDestination('https://example.com/tickets'), '/');
  });
  test('ticket auth returns retain only the order identifier', () {
    expect(
        ticketAccountReturn(
            '/tickets?order=order-123&accessKey=secret#transfer=secret'),
        '/tickets?order=order-123');
    expect(ticketAccountReturn('/tickets#recovery=secret'), '/tickets');
  });
  test('ticket auth returns reject external and unrelated destinations', () {
    for (final String? value in <String?>[
      null,
      'https://example.com/tickets',
      '//example.com/tickets',
      '/admin',
      '/tickets/elsewhere'
    ]) {
      expect(ticketAccountReturn(value), null);
    }
  });
}
