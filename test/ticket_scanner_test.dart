import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pluto/src/scanner/scanner_state_store.dart';
import 'package:pluto/src/scanner/scanner_storage_native.dart';
import 'package:pluto/src/scanner/ticket_scanner.dart';
import 'package:pluto/src/scanner/ticket_verifier.dart';
import 'package:pluto/ticketing_repository.dart';

class MemoryScannerStore implements ScannerStateStore {
  Map<String, dynamic> state = {};
  bool failWrites = false;
  @override
  Future<Map<String, dynamic>> load() async =>
      jsonDecode(jsonEncode(state)) as Map<String, dynamic>;
  @override
  Future<void> save(Map<String, dynamic> value) async {
    if (failWrites) throw StateError('Storage unavailable');
    state = jsonDecode(jsonEncode(value)) as Map<String, dynamic>;
  }
}

class ScannerHarness {
  final store = MemoryScannerStore();
  DateTime now = DateTime.utc(2026, 11, 7, 23);
  bool networkDown = false;
  TicketingException? denial;
  String uid = 'scanner_door', token = 'a' * 64;
  String scanResult = 'accepted';
  final calls = <Map<String, dynamic>>[];
  late Map<String, dynamic> manifest;
  late SimpleKeyPair key;
  late String qr;
  Map<String, dynamic> get session => {
    'uid': uid,
    'token': token,
    'eventId': 'show',
    'eventTitle': 'First show',
    'label': 'Main door',
    'expiresAt': now.add(const Duration(hours: 12)).millisecondsSinceEpoch,
  };
  TicketScanner scanner() =>
      TicketScanner(request: request, store: store, now: () => now);
  Future<String> credential({
    bool legacy = false,
    String id = 'ticket',
    String eventId = 'show',
    int version = 1,
    String kid = 'current',
    Map<String, dynamic> extra = const {},
  }) async {
    final data = base64Url
        .encode(
          utf8.encode(
            jsonEncode({
              'id': id,
              'eventId': eventId,
              'version': version,
              if (!legacy) 'kid': kid,
              ...extra,
            }),
          ),
        )
        .replaceAll('=', '');
    final prefix = legacy ? 'PLUTO1' : 'PLUTO2';
    final signature = await Ed25519().sign(
      utf8.encode(legacy ? data : '$prefix.$data'),
      keyPair: key,
    );
    return '$prefix.$data.${base64Url.encode(signature.bytes).replaceAll('=', '')}';
  }

  Future<void> setup() async {
    key = await Ed25519().newKeyPairFromSeed(List.generate(32, (i) => i));
    final public = await key.extractPublicKey();
    manifest = {
      'eventId': 'show',
      'staffUid': uid,
      'generatedAt': now.millisecondsSinceEpoch,
      'offlineUntil': now.add(const Duration(hours: 4)).millisecondsSinceEpoch,
      'leaseToken': 'lease-proof',
      'legacyKeyId': 'current',
      'verificationKeys': {
        'current': {
          'kty': 'OKP',
          'crv': 'Ed25519',
          'x': base64Url.encode(public.bytes).replaceAll('=', ''),
        },
      },
      'guestValidFrom': now
          .subtract(const Duration(hours: 1))
          .toIso8601String(),
      'guestValidUntil': now.add(const Duration(hours: 6)).toIso8601String(),
      'tickets': [
        for (final id in ['ticket', 'rsvp', 'upgrade'])
          {
            'id': id,
            'orderId': 'order',
            'version': 1,
            'status': 'valid',
            'name': 'General admission',
            'holderName': 'Alex Rivera',
            'validFrom': now
                .subtract(const Duration(hours: 1))
                .toIso8601String(),
            'validUntil': now.add(const Duration(hours: 6)).toIso8601String(),
            'admitted': false,
            'itemProof': 'ticket-proof-$id',
            'rsvpTicketId': id == 'upgrade' ? 'rsvp' : '',
          },
      ],
      'guests': [
        {
          'id': 'guest',
          'version': 1,
          'name': 'Sam Taylor',
          'note': 'Artist guest',
          'itemProof': 'guest-proof',
          'arrived': null,
        },
      ],
    };
    qr = await credential();
  }

  Future<Map<String, dynamic>> request(
    String path,
    Map<String, dynamic> body,
    String? proof,
  ) async {
    calls.add({'path': path, 'body': body, 'token': proof});
    if (networkDown) throw http.ClientException('Offline');
    if (denial != null && path != 'scanner/login') throw denial!;
    switch (path) {
      case 'scanner/login':
        return session;
      case 'scanner/session':
        return {...session}..remove('token');
      case 'scanner/logout':
        return {'signedOut': true};
      case 'staff/manifest':
        return jsonDecode(jsonEncode(manifest)) as Map<String, dynamic>;
      case 'staff/guestlist':
        return {'guests': manifest['guests']};
      case 'staff/scan':
        return {
          'result': scanResult,
          'ticketId': 'ticket',
          'name': 'General admission',
          'holderName': 'Alex Rivera',
        };
      case 'staff/guestlist/arrive':
        return {'result': scanResult, 'name': 'Sam Taylor'};
      case 'staff/scan-review':
        return {'reviewed': true};
      case 'staff/attendance':
        return {
          'eventId': 'show',
          'rows': [],
          'cursor': null,
          'counts': {
            'tickets': 1,
            'rsvps': 0,
            'guests': 1,
            'walkups': 0,
            'arrivals': 2,
            'inside': 2,
          },
          'checkedAt': now.millisecondsSinceEpoch,
          'free': false,
          'walkups': {'version': 0},
        };
      case 'staff/attendance/move':
        return {'inside': false};
      default:
        throw StateError('Unexpected route $path');
    }
  }

  Future<TicketScanner> ready() async {
    final service = scanner();
    await service.initialize();
    await service.login('1234 5678');
    await service.prepare();
    return service;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});
  late ScannerHarness harness;
  setUp(() async {
    harness = ScannerHarness();
    await harness.setup();
  });

  test('PIN transport never reads Firebase credentials or authorizes staff management', () async {
    var requests = 0;
    final repository = TicketingRepository(
      baseUri: Uri.parse('https://pluto.events'),
      tokenProvider: () => throw StateError('Firebase must not be read'),
      client: MockClient((request) async {
        requests++;
        expect(request.headers['Authorization'], isNull);
        expect(
          request.headers['X-Pluto-Scanner'],
          requests == 1 ? isNull : 'pin-session',
        );
        return http.Response('{}', 200);
      }),
    );
    await repository.scannerRequest('scanner/login', {'pin': '12345678'});
    await repository.scannerRequest('staff/scan', {
      'qr': harness.qr,
    }, scannerToken: 'pin-session');
    expect(
      () => repository.scannerRequest(
        'staff/scanner-pins/create',
        {},
        scannerToken: 'pin-session',
      ),
      throwsStateError,
    );
    expect(() => repository.scannerRequest('staff/scan', {}), throwsStateError);
    expect(requests, 2);
    repository.dispose();
  });
  test(
    'malformed PINs never reach the network and plaintext PINs never persist',
    () async {
      final scanner = harness.scanner();
      await scanner.initialize();
      await expectLater(scanner.login('1234'), throwsFormatException);
      expect(harness.calls, isEmpty);
      await scanner.login('1234-5678');
      expect(harness.calls.single['body'], {'pin': '12345678'});
      expect(jsonEncode(harness.store.state), isNot(contains('12345678')));
    },
  );
  test('offline acceptance is durable, signature verified, and duplicate safe across restart', () async {
    var scanner = await harness.ready();
    harness.networkDown = true;
    expect((await scanner.scan(harness.qr))['result'], 'accepted');
    expect(scanner.pending.single['leaseToken'], 'lease-proof');
    expect(scanner.pending.single['itemProof'], 'ticket-proof-ticket');
    expect(
      scanner.pending.single['deviceTime'],
      harness.now.millisecondsSinceEpoch,
    );
    scanner = harness.scanner();
    await scanner.initialize();
    expect(scanner.offline, true);
    expect((await scanner.scan(harness.qr))['result'], 'duplicate');
    expect(scanner.pending.length, 1);
    harness.networkDown = false;
    final summary = await scanner.replay();
    expect(summary['accepted'], 1);
    expect(scanner.pending, isEmpty);
    final replay = harness.calls.last['body'] as Map;
    expect(replay['scanId'], matches(RegExp(r'^[a-f0-9]{64}$')));
    expect(replay['offline'], true);
    expect(replay['qr'], harness.qr);
    expect(harness.calls.last['token'], harness.token);
  });
  test('tampered, wrong-event, transferred and outside-window tickets never admit offline', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    final parts = harness.qr.split('.');
    final tampered = '${parts[0]}.${parts[1]}.${'A' * 86}';
    for (final invalid in [
      tampered,
      'not-a-ticket',
      await harness.credential(eventId: 'another-show'),
      await harness.credential(version: 2),
      await harness.credential(extra: {'kind': 'ticket', 'leaseHash': 'other'}),
      await harness.credential(kid: 'retired'),
    ]) {
      await expectLater(scanner.scan(invalid), throwsA(anything));
      expect(scanner.pending, isEmpty);
    }
    harness.now = harness.now.subtract(const Duration(hours: 2));
    await expectLater(scanner.scan(harness.qr), throwsStateError);
  });
  test('PLUTO1, PLUTO2 and the legacy single-key manifest match website verification', () async {
    final verifier = TicketVerifier(harness.manifest);
    expect((await verifier.verify(harness.qr))['id'], 'ticket');
    final legacy = await harness.credential(legacy: true);
    expect((await verifier.verify(legacy))['id'], 'ticket');
    final single = TicketVerifier({
      'verificationKey': harness.manifest['verificationKeys']['current'],
    });
    expect((await single.verify(legacy))['version'], 1);
    expect(
      () => TicketVerifier({...harness.manifest, 'legacyKeyId': 'invalid/key'}),
      throwsFormatException,
    );
    final invalidRing =
        jsonDecode(jsonEncode(harness.manifest)) as Map<String, dynamic>;
    invalidRing['verificationKeys']['current']['d'] = 'private-material';
    expect(() => TicketVerifier(invalidRing), throwsFormatException);
  });
  test('storage failure cannot display an offline acceptance or mutate the prepared state', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    harness.store.failWrites = true;
    await expectLater(scanner.scan(harness.qr), throwsStateError);
    expect(scanner.pending, isEmpty);
    expect(scanner.manifest!['tickets'][0]['admitted'], false);
    harness.store.failWrites = false;
    expect((await scanner.scan(harness.qr))['result'], 'accepted');
  });
  test('concurrent scans serialize into one offline acceptance', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    final results = await Future.wait([
      scanner.scan(harness.qr),
      scanner.scan(harness.qr),
    ]);
    expect(results.map((r) => r['result']), ['accepted', 'duplicate']);
    expect(scanner.pending.length, 1);
  });
  test(
    'revoked online PIN locks the lane and never falls back to prepared data',
    () async {
      final scanner = await harness.ready();
      harness.denial = const TicketingException(403, 'PIN revoked');
      await expectLater(
        scanner.scan(harness.qr),
        throwsA(isA<TicketingException>()),
      );
      expect(scanner.session, isNull);
      expect(scanner.manifest, isNull);
      expect(scanner.pending, isEmpty);
      expect(harness.store.state['session'], isNull);
    },
  );
  test(
    'HTTP errors and malformed responses never become offline admissions',
    () async {
      for (final status in [400, 409, 429, 500, 503]) {
        final scanner = await harness.ready();
        harness.denial = TicketingException(status, 'Admission not confirmed');
        await expectLater(
          scanner.scan(harness.qr),
          throwsA(isA<TicketingException>()),
        );
        expect(scanner.pending, isEmpty);
        harness.denial = null;
      }
    },
  );
  test(
    'expired offline lease fails closed even while session is still valid',
    () async {
      final scanner = await harness.ready();
      harness.networkDown = true;
      harness.now = harness.now.add(const Duration(hours: 4, seconds: 1));
      expect(scanner.prepared, false);
      await expectLater(scanner.scan(harness.qr), throwsStateError);
      expect(scanner.pending, isEmpty);
    },
  );
  test('guest arrivals, pending badges, and replay use the original guest evidence', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    expect((await scanner.arriveGuest('guest'))['result'], 'accepted');
    expect((await scanner.guests()).single['arrived']['pending'], true);
    expect((await scanner.arriveGuest('guest'))['result'], 'duplicate');
    final record = scanner.pending.single;
    expect(record['kind'], 'guest');
    expect(record['guestVersion'], 1);
    expect(record['itemProof'], 'guest-proof');
    harness.networkDown = false;
    await scanner.replay();
    expect(harness.calls.last['path'], 'staff/guestlist/arrive');
    expect(harness.calls.last['body']['scanId'], record['scanId']);
  });
  test('upgrades consume their RSVP locally and retained RSVP holds block linked upgrades', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    expect(
      (await scanner.scan(await harness.credential(id: 'upgrade')))['result'],
      'accepted',
    );
    expect(
      (await scanner.scan(await harness.credential(id: 'rsvp')))['result'],
      'duplicate',
    );
    expect(scanner.pending.length, 1);
  });
  test('lost response replays the exact attempt and keeps evidence until confirmation', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    await scanner.scan(harness.qr);
    final before = scanner.pending.single['scanId'];
    await expectLater(scanner.replay(), throwsA(isA<http.ClientException>()));
    expect(scanner.pending.single['scanId'], before);
    harness.networkDown = false;
    await scanner.replay();
    expect(harness.calls.last['body']['scanId'], before);
  });
  test(
    'sync conflicts remain exportable and support audited staff review notes',
    () async {
      final scanner = await harness.ready();
      harness.networkDown = true;
      await scanner.scan(harness.qr);
      harness.networkDown = false;
      harness.scanResult = 'invalid';
      expect((await scanner.replay())['conflicts'], 1);
      expect(scanner.pending, isEmpty);
      expect(scanner.conflicts.single['reviewed'], false);
      final scanId = scanner.conflicts.single['scanId'] as String;
      await scanner.review(scanId, 'Organizer contacted; no second entry.');
      expect(scanner.conflicts.single['reviewed'], true);
      final export = jsonDecode(scanner.exportRecords()) as Map;
      expect(export['version'], 1);
      expect(export['records'][0]['scanId'], scanId);
    },
  );
  test('key rotation retains evidence and blocks held tickets after fresh preparation', () async {
    final scanner = await harness.ready();
    harness.networkDown = true;
    await scanner.scan(harness.qr);
    final scanId = scanner.pending.single['scanId'];
    harness.networkDown = false;
    harness.denial = const TicketingException(
      409,
      'Retired key',
      code: 'offline-key-unavailable',
    );
    // Reject only old replay evidence, while allowing a new keyring preparation.
    final recovering = TicketScanner(
      store: harness.store,
      now: () => harness.now,
      request: (path, body, token) {
        if (path != 'staff/scan') {
          final saved = harness.denial;
          harness.denial = null;
          final result = harness.request(path, body, token);
          harness.denial = saved;
          return result;
        }
        return harness.request(path, body, token);
      },
    );
    await recovering.initialize();
    expect((await recovering.prepare())['held'], 1);
    expect(recovering.pending.single['scanId'], scanId);
    expect(recovering.pending.single['leaseToken'], 'lease-proof');
    expect(recovering.pending.single['keyRotationBlocked'], true);
    await expectLater(recovering.scan(harness.qr), throwsStateError);
    expect(
      jsonDecode(recovering.exportRecords())['records'][0]['reviewReason'],
      'Retired key',
    );
  });
  test('logout and PIN changes retain evidence without granting another lane replay authority', () async {
    var scanner = await harness.ready();
    harness.networkDown = true;
    await scanner.scan(harness.qr);
    final scanId = scanner.pending.single['scanId'];
    await scanner.logout();
    expect(scanner.session, isNull);
    expect(harness.store.state['queue'][0]['scanId'], scanId);
    harness.store.state['queue'].add({
      ...harness.store.state['queue'][0] as Map,
      'eventId': 'other-event',
      'scanId': 'other-event-scan',
    });
    harness.networkDown = false;
    harness.uid = 'scanner_other';
    scanner = harness.scanner();
    await scanner.initialize();
    await scanner.login('87654321');
    await expectLater(scanner.replay(), throwsStateError);
    expect(harness.store.state['queue'][0]['scanId'], scanId);
    // A replacement PIN can hand the retained evidence to an organizer without
    // acquiring the original PIN's replay authority.
    expect(jsonDecode(scanner.exportRecords())['records'][0]['scanId'], scanId);
    expect(jsonDecode(scanner.exportRecords())['records'], hasLength(1));
  });
  test('airplane mode uses prepared ticket and guest data without a network request', () async {
    await harness.ready();
    final previousCalls = harness.calls.length;
    final scanner = TicketScanner(
      store: harness.store,
      request: harness.request,
      now: () => harness.now,
      connectionAvailable: () async => false,
    );
    await scanner.initialize();
    expect((await scanner.scan(harness.qr))['offline'], true);
    expect((await scanner.arriveGuest('guest'))['offline'], true);
    expect((await scanner.guests()).single['arrived']['pending'], true);
    expect(harness.calls.length, previousCalls);
    expect(scanner.pending, hasLength(2));
  });
  test('a new PIN bypasses old revoked credentials and a failed login cannot reopen the old lane', () async {
    final previous = await harness.ready();
    harness.networkDown = true;
    await previous.scan(harness.qr);
    harness.networkDown = false;
    final paths = <String>[];
    final scanner = TicketScanner(
      store: harness.store,
      now: () => harness.now,
      request: (path, body, token) async {
        paths.add(path);
        if (path == 'scanner/login')
          throw const TicketingException(401, 'Invalid PIN');
        return harness.request(path, body, token);
      },
    );
    await scanner.initialize(restoreSession: false);
    expect(paths, isEmpty);
    await expectLater(
      scanner.login('87654321'),
      throwsA(isA<TicketingException>()),
    );
    expect(scanner.session, isNull);
    expect(scanner.manifest, isNull);
    expect(harness.store.state['queue'], hasLength(1));
  });
  test(
    'native storage encrypts attendee evidence and authenticates file contents',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pluto-scanner-test-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final keys = <String, String>{};
      NativeScannerStore create() => NativeScannerStore(
        scope: 'test',
        directory: () async => directory,
        readKey: (key) => keys[key],
        writeKey: (key, value) async {
          keys[key] = value;
        },
      );
      final store = create();
      expect(await store.load(), isEmpty);
      await store.save({
        'queue': [
          {'holderName': 'Alex Rivera', 'qr': harness.qr},
        ],
      });
      expect((await create().load())['queue'][0]['qr'], harness.qr);
      await store.save({
        'queue': [
          {'holderName': 'Alex Rivera', 'qr': harness.qr},
        ],
        'session': {'eventId': 'show'},
      });
      expect((await create().load())['session']['eventId'], 'show');
      final file = File('${directory.path}/pluto-scanner-test.bin');
      final bytes = await file.readAsBytes();
      expect(
        utf8.decode(bytes, allowMalformed: true),
        isNot(contains('Alex Rivera')),
      );
      bytes[20] ^= 1;
      await file.writeAsBytes(bytes);
      await expectLater(
        create().load(),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
    },
  );
}
