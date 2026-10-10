import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_wallet.dart';
import 'package:pluto/ticketing_repository.dart';

void main() {
  test('wallet retains backend demo marker to suppress live recovery controls',
      () async {
    final result = await loadTicketWallet(
        signedIn: true,
        savedKeys: [],
        readAccess: (_) => null,
        removeAccess: (_) {},
        request: (_, __) async => {'demo': true, 'orders': [], 'tickets': []});
    expect(result['demo'], true);
  });

  test(
      'linked orders are not downloaded again and native claiming shares the wallet request',
      () async {
    final calls = <String>[];
    final result = await loadTicketWallet(
        signedIn: true,
        claimPurchases: true,
        savedKeys: ['pluto-order-linked'],
        readAccess: (_) => 'proof',
        removeAccess: (_) {},
        request: (path, body) async {
          calls.add(path);
          expect(body['claimPurchases'], true);
          return {
            'orders': [
              {'orderId': 'linked'}
            ],
            'tickets': [
              {'id': 'ticket', 'qr': null}
            ]
          };
        });
    expect(calls, ['mine']);
    expect((result['tickets'] as List).single['qr'], isNull);
  });
  test(
      'guest receipt downloads have bounded concurrency and retain every ticket',
      () async {
    var running = 0, peak = 0;
    final result = await loadTicketWallet(
        signedIn: false,
        savedKeys: List.generate(12, (i) => 'pluto-order-$i'),
        readAccess: (_) => 'proof',
        removeAccess: (_) {},
        request: (path, body) async {
          running++;
          if (running > peak) peak = running;
          await Future<void>.delayed(const Duration(milliseconds: 10));
          running--;
          return {
            'tickets': [
              {'id': body['orderId'], 'qr': 'qr'}
            ]
          };
        });
    expect(peak, 4);
    expect((result['tickets'] as List).length, 12);
  });
  test('cached holder QR cannot overwrite an authoritative account revocation',
      () async {
    final result = await loadTicketWallet(
        signedIn: true,
        savedKeys: ['pluto-holder-token'],
        readAccess: (_) => 'proof',
        removeAccess: (_) {},
        request: (path, _) async => path == 'mine'
            ? {
                'orders': [],
                'tickets': [
                  {'id': 'same', 'qr': null}
                ]
              }
            : {'id': 'same', 'qr': 'old-qr', 'offline': true, 'savedAt': 123});
    expect((result['tickets'] as List).single['qr'], isNull);
  });
  test('saved orders preserve gated locations only for usable tickets',
      () async {
    final Map<String, dynamic> waitingVenue = <String, dynamic>{
      'available': false,
      'revealAt': '2026-10-04T20:00:00.000Z',
      'name': '',
      'address': '',
      'directions': '',
    };
    final Map<String, dynamic> ticketVenue = <String, dynamic>{
      'available': true,
      'name': 'Current ticket venue',
    };
    final Map<String, dynamic> result = await loadTicketWallet(
        request: (path, body) async => <String, dynamic>{
              'eventTitle': 'Private event',
              'venue': waitingVenue,
              'tickets': <dynamic>[
                <String, dynamic>{'id': 'current', 'qr': 'current-qr'},
                <String, dynamic>{
                  'id': 'specific',
                  'qr': 'specific-qr',
                  'venue': ticketVenue,
                },
                <String, dynamic>{'id': 'transferred', 'qr': null},
              ],
            },
        signedIn: false,
        savedKeys: <String>['pluto-order-private'],
        readAccess: (_) => 'proof',
        removeAccess: (_) {});
    final List<dynamic> tickets = result['tickets'] as List<dynamic>;
    expect(tickets[0]['venue'], waitingVenue);
    expect(tickets[1]['venue'], ticketVenue);
    expect(tickets[2]['venue'], isNull);
  });
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
