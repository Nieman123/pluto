import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pluto/src/offline_ticket_cache.dart';
import 'package:pluto/src/persistent_ticket_store.dart';
import 'package:pluto/ticketing_repository.dart';

void main() {
  late Map<String, String> disk;
  late OfflineTicketCache cache;
  late DateTime now;
  const body = <String, dynamic>{'orderId': 'one'};
  Map<String, dynamic> order(
          {String? qr = 'signed-qr', String status = 'valid'}) =>
      {
        'orderId': 'one',
        'status': 'paid',
        'tickets': [
          {
            'id': 'ticket',
            'status': status,
            'qr': qr,
            'validUntil': now.add(const Duration(hours: 3)).toIso8601String(),
            'venue': {
              'available': false,
              'address': '',
              'revealAt': now.add(const Duration(hours: 1)).toIso8601String()
            }
          }
        ]
      };
  Future<Map<String, dynamic>> offline(
          String _, Map<String, dynamic> __) async =>
      throw http.ClientException('offline');
  setUp(() {
    disk = {};
    now = DateTime.utc(2026, 10, 4);
    cache = OfflineTicketCache(
        read: (key) => disk[key],
        write: (key, value) async {
          disk[key] = value;
        },
        remove: (key) async {
          disk.remove(key);
        },
        keys: () => disk.keys.toList(),
        now: () => now);
  });
  test(
      'transport failures use saved QR and never reveal a scheduled private venue',
      () async {
    await cache.request('order', body, 'guest', (_, __) async => order());
    now = now.add(const Duration(hours: 2));
    final data = await cache.request('order', body, 'guest', offline);
    expect(data['offline'], true);
    expect(data['tickets'][0]['qr'], 'signed-qr');
    expect(data['tickets'][0]['venue']['address'], '');
    expect(data['tickets'][0]['transferable'], false);
  });
  test('expired admission and old snapshots cannot display usable QR',
      () async {
    await cache.request('order', body, 'guest', (_, __) async => order());
    now = now.add(const Duration(hours: 4));
    expect(
        (await cache.request('order', body, 'guest', offline))['tickets'][0]
            ['qr'],
        null);
    now = now.add(const Duration(days: 8));
    await expectLater(cache.request('order', body, 'guest', offline),
        throwsA(isA<http.ClientException>()));
    expect(disk, isEmpty);
  });
  test('authoritative revocation removes an order from every cached view',
      () async {
    await cache.request('order', body, 'account-a', (_, __) async => order());
    await cache.request(
        'mine',
        {},
        'account-a',
        (_, __) async => {
              'orders': [],
              'tickets': [
                {...order()['tickets'][0] as Map, 'orderId': 'one'}
              ]
            });
    await cache.request('order', body, 'account-b', (_, __) async => order());
    await expectLater(
        cache.request('order', body, 'account-a',
            (_, __) async => throw const TicketingException(403, 'Revoked')),
        throwsA(isA<TicketingException>()));
    expect((await cache.request('mine', {}, 'account-a', offline))['tickets'],
        isEmpty);
    expect(
        (await cache.request('order', body, 'account-b', offline))['offline'],
        true);
  });
  test(
      'an obsolete order link cannot erase offline access to unrelated purchases',
      () async {
    await cache.request('order', body, 'guest', (_, __) async => order());
    await expectLater(
        cache.request('order', {'orderId': 'obsolete'}, 'guest',
            (_, __) async => throw const TicketingException(403, 'Replaced')),
        throwsA(isA<TicketingException>()));
    expect(
        (await cache.request('order', body, 'guest', offline))['tickets'][0]
            ['qr'],
        'signed-qr');
  });
  test(
      'successful refund update removes QR from older account wallet snapshots',
      () async {
    await cache.request(
        'mine', {}, 'account-a', (_, __) async => {'orders': [], ...order()});
    await cache.request('order', body, 'account-a',
        (_, __) async => order(qr: null, status: 'refunded'));
    expect(
        (await cache.request('mine', {}, 'account-a', offline))['tickets'][0]
            ['qr'],
        null);
  });
  test('server failures never use stale admission data', () async {
    await cache.request('order', body, 'guest', (_, __) async => order());
    await expectLater(
        cache.request(
            'order',
            body,
            'guest',
            (_, __) async =>
                throw const TicketingException(503, 'Unavailable')),
        throwsA(isA<TicketingException>()));
    expect(disk, isEmpty);
  });
  test(
      'a ticket absent from a refreshed account cannot survive in an older order',
      () async {
    await cache.request('order', body, 'account-a', (_, __) async => order());
    await cache.request('mine', {}, 'account-a',
        (_, __) async => {'orders': [], 'tickets': []});
    await expectLater(cache.request('order', body, 'account-a', offline),
        throwsA(isA<http.ClientException>()));
  });
  test(
      'native access survives process restart and serializes write/remove operations',
      () async {
    PersistentTicketStore store() => PersistentTicketStore(
        load: () async => Map.of(disk),
        save: (key, value) async {
          await Future<void>.delayed(const Duration(milliseconds: 1));
          disk[key] = value;
        },
        erase: (key) async {
          disk.remove(key);
        });
    final first = store();
    await first.initialize();
    await first.write('pluto-order-one', 'secure-access');
    final restarted = store();
    await restarted.initialize();
    expect(restarted.values['pluto-order-one'], 'secure-access');
    final writing = restarted.write('temporary', 'proof');
    final removing = restarted.remove('temporary');
    await Future.wait([writing, removing]);
    expect(disk.containsKey('temporary'), false);
  });
}
