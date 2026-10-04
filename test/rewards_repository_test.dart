import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pluto/rewards_repository.dart';
import 'package:pluto/ticketing_repository.dart';

void main() {
  test(
      'a lost redemption response retries the same intent across repository reload',
      () async {
    final List<Map<String, dynamic>> requests = <Map<String, dynamic>>[];
    final TicketingRepository api = TicketingRepository(
        baseUri: Uri.parse('https://pluto.events'),
        tokenProvider: () async => 'firebase-proof',
        client: MockClient((http.Request request) async {
          expect(request.url.path, '/tickets/api/rewards/redeem');
          expect(request.headers['Authorization'], 'Bearer firebase-proof');
          requests
              .add(Map<String, dynamic>.from(jsonDecode(request.body) as Map));
          if (requests.length == 1)
            throw http.ClientException('Response lost after commit');
          return http.Response(
              '{"rewardName":"Shirt","pointsCost":100,"newPointsBalance":0}',
              200);
        }));
    await expectLater(RewardsRepository(api: api).redeem('retry-user', 'shirt'),
        throwsA(isA<http.ClientException>()));
    final Map<String, dynamic> receipt =
        await RewardsRepository(api: api).redeem('retry-user', 'shirt');
    expect(receipt['pointsCost'], 100);
    expect(requests[0]['attempt'], requests[1]['attempt']);
    expect(requests[0], containsPair('uid', 'retry-user'));
    expect(requests[0].containsKey('pointsCost'), false);
    await RewardsRepository(api: api).redeem('retry-user', 'shirt');
    expect(requests[2]['attempt'], isNot(requests[1]['attempt']),
        reason: 'a deliberate subsequent purchase is a new intent');
    api.dispose();
  });

  test(
      'authentication loss and throttling retain an uncertain successful attempt',
      () async {
    final List<String> attempts = <String>[];
    final List<int> statuses = <int>[503, 401, 429, 200];
    final TicketingRepository api = TicketingRepository(
        tokenProvider: () async => 'proof',
        client: MockClient((http.Request request) async {
          attempts.add((jsonDecode(request.body) as Map)['attempt'] as String);
          final int status = statuses.removeAt(0);
          return http.Response(
              status == 200
                  ? '{"pointsCost":100}'
                  : '{"error":"Retry later","code":"unavailable"}',
              status);
        }));
    for (int i = 0; i < 3; i++)
      await expectLater(
          RewardsRepository(api: api).redeem('throttled-user', 'shirt'),
          throwsA(isA<FirebaseException>()));
    await RewardsRepository(api: api).redeem('throttled-user', 'shirt');
    expect(attempts.toSet().length, 1);
    api.dispose();
  });

  test(
      'claims normalize QR codes, scope retry intent to the account, and preserve stable rejection codes',
      () async {
    final List<Map<String, dynamic>> requests = <Map<String, dynamic>>[];
    final TicketingRepository api = TicketingRepository(
        tokenProvider: () async => 'proof',
        client: MockClient((http.Request request) async {
          expect(request.url.path, '/tickets/api/rewards/claim');
          requests
              .add(Map<String, dynamic>.from(jsonDecode(request.body) as Map));
          return http.Response(
              '{"error":"You already claimed this event.","code":"already-claimed"}',
              409);
        }));
    final RewardsRepository rewards = RewardsRepository(api: api);
    await expectLater(
        rewards.claim('claim-user', ' event-code '),
        throwsA(isA<FirebaseException>().having(
            (FirebaseException error) => error.code,
            'code',
            'already-claimed')));
    await expectLater(rewards.claim('claim-user', 'EVENT-CODE'),
        throwsA(isA<FirebaseException>()));
    await expectLater(rewards.claim('another-user', 'EVENT-CODE'),
        throwsA(isA<FirebaseException>()));
    expect(
        requests.every((Map<String, dynamic> r) => r['code'] == 'EVENT-CODE'),
        true);
    expect(
        requests.map((Map<String, dynamic> r) => r['attempt']).toSet().length,
        3);
    expect(
        requests
            .every((Map<String, dynamic> r) => !r.containsKey('pointsAwarded')),
        true);
    api.dispose();
  });
}
