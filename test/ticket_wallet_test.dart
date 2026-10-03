import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_wallet.dart';
import 'package:pluto/ticketing_repository.dart';

void main() {
  for (final String cause in <String>['refunded', 'retransferred']) {
    test('a $cause saved holder does not hide a valid order', () async {
      final List<String> removed = <String>[];
      final Map<String, dynamic> result = await loadTicketWallet(
          request: (path, body) async {
            if (path == 'holder') {
              throw const TicketingException(
                  409, 'This ticket credential is no longer valid.',
                  code: 'ticket-access-revoked');
            }
            return <String, dynamic>{
              'eventTitle': 'Valid event',
              'tickets': <dynamic>[
                <String, dynamic>{'id': 'valid-ticket', 'qr': 'valid-qr'}
              ]
            };
          },
          signedIn: false,
          savedKeys: <String>['pluto-order-good', 'pluto-holder-bad'],
          readAccess: (_) => 'proof',
          removeAccess: removed.add);
      expect((result['tickets'] as List).single['qr'], 'valid-qr');
      expect((result['orders'] as List).length, 1);
      expect(removed, <String>['pluto-holder-bad']);
      expect(result['warnings'], isNotEmpty);
    });
  }
  test(
      'transient history and account failures preserve access and other tickets',
      () async {
    final List<String> removed = <String>[];
    final Map<String, dynamic> result = await loadTicketWallet(
        request: (path, body) async {
          if (path == 'mine' || body['orderId'] == 'old') {
            throw const TicketingException(503, 'Unavailable');
          }
          if (path == 'holder') {
            throw const TicketingException(409, 'Payment needs staff review');
          }
          return <String, dynamic>{
            'eventTitle': 'Valid event',
            'tickets': <dynamic>[
              <String, dynamic>{'id': 'valid-ticket', 'qr': 'valid-qr'}
            ]
          };
        },
        signedIn: true,
        savedKeys: <String>[
          'pluto-order-good',
          'pluto-order-old',
          'pluto-holder-review'
        ],
        readAccess: (_) => 'proof',
        removeAccess: removed.add);
    expect((result['tickets'] as List).single['qr'], 'valid-qr');
    expect(removed, isEmpty);
    expect((result['warnings'] as List).length, 3);
  });
  test('expired order access is retained for financial history recovery',
      () async {
    final List<String> removed = <String>[];
    final Map<String, dynamic> result = await loadTicketWallet(
        request: (path, body) async =>
            throw const TicketingException(403, 'Use your secure order link'),
        signedIn: false,
        savedKeys: <String>['pluto-order-old'],
        readAccess: (_) => 'proof',
        removeAccess: removed.add);
    expect(removed, isEmpty);
    expect((result['warnings'] as List).single, contains('email recovery'));
  });
}
