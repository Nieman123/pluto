import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pluto/current_events_repository.dart';

CurrentEvent _eventWithTitle(String title,
    {String registrationMode = 'tickets', String id = 'event-id'}) {
  return CurrentEvent(
    id: id,
    title: title,
    details: '',
    ticketUrl: '',
    flyerDataUrl: '',
    isActive: true,
    sortOrder: 0,
    createdAt: null,
    updatedAt: null,
    registrationMode: registrationMode,
  );
}

void main() {
  test('active discovery recovers after an initial network failure', () async {
    var requests = 0;
    final client = MockClient((_) async => ++requests == 1
        ? http.Response('Unavailable', 503)
        : http.Response(
            jsonEncode({
              'events': [
                {'id': 'live'}
              ]
            }),
            200));
    addTearDown(client.close);
    final repository = CurrentEventsRepository(
        client: client,
        baseUri: Uri.parse('https://pluto.example'),
        refreshInterval: const Duration(milliseconds: 10));
    await expectLater(repository.watchEvents(onlyActive: true).take(1),
        emitsInOrder([emitsError(isA<StateError>()), isNotEmpty, emitsDone]));
  });
  test(
      'active discovery removes completed/inactive events at the precise end boundary',
      () async {
    final now = DateTime.parse('2027-09-18T12:00:00Z');
    final records = [
      {'id': 'ended', 'endAt': now.toIso8601String()},
      {
        'id': 'ongoing',
        'startAt': now.subtract(const Duration(days: 1)).toIso8601String(),
        'endAt': now.add(const Duration(days: 1)).toIso8601String()
      },
      {'id': 'inactive', 'isActive': false},
      {
        'id': 'future',
        'startAt': now.add(const Duration(days: 2)).toIso8601String(),
        'endAt': now.add(const Duration(days: 3)).toIso8601String()
      },
    ];
    final client = MockClient((request) async {
      expect(request.url.toString(),
          'https://pluto.example/tickets/api/public/events');
      return http.Response(jsonEncode({'events': records}), 200);
    });
    addTearDown(client.close);
    final repository = CurrentEventsRepository(
        client: client,
        baseUri: Uri.parse('https://pluto.example'),
        now: () => now);
    expect(
        (await repository.watchEvents(onlyActive: true).first).map((e) => e.id),
        ['ongoing', 'future']);
  });
  test(
      'an event disappears while the dashboard stays open and polling stops on cancellation',
      () async {
    var now = DateTime.parse('2027-09-18T12:00:00Z'), requests = 0;
    final ends = now.add(const Duration(seconds: 1));
    final client = MockClient((_) async {
      requests++;
      return http.Response(
          jsonEncode({
            'events': [
              {'id': 'live', 'endAt': ends.toIso8601String()}
            ]
          }),
          200);
    });
    addTearDown(client.close);
    final repository = CurrentEventsRepository(
        client: client,
        baseUri: Uri.parse('https://pluto.example'),
        now: () => now,
        refreshInterval: const Duration(milliseconds: 10));
    final values = await repository
        .watchEvents(onlyActive: true)
        .map((events) {
          now = ends;
          return events.map((e) => e.id).toList();
        })
        .take(2)
        .toList();
    expect(values, [
      ['live'],
      []
    ]);
    final finalRequests = requests;
    await Future<void>.delayed(const Duration(milliseconds: 30));
    expect(requests, finalRequests);
  });
  test(
      'free and RSVP event cards use appropriate actions, while legacy cards keep tickets',
      () {
    expect(_eventWithTitle('Legacy event').actionLabel, 'Tickets');
    final CurrentEvent party =
        _eventWithTitle('Brew Pump Halloween', registrationMode: 'free');
    expect(party.isFree, isTrue);
    expect(party.isRsvp, isFalse);
    expect(party.actionLabel, 'View event');
    expect(
        _eventWithTitle('RSVP event', registrationMode: 'rsvp-approval')
            .actionLabel,
        'RSVP');
  });
  group('CurrentEventX.isManaFest', () {
    test('Studio ManaFest cards are not hidden with the old featured festival',
        () {
      expect(_eventWithTitle('ManaFest 2026').isLegacyManaFest, isTrue);
      expect(
          _eventWithTitle('ManaFest 2027', id: 'native-live').isLegacyManaFest,
          isFalse);
    });
    test('recognizes common ManaFest title formats', () {
      expect(_eventWithTitle('ManaFest').isManaFest, isTrue);
      expect(_eventWithTitle('Mana Fest 2026').isManaFest, isTrue);
      expect(_eventWithTitle('MANAFEST: Weekend Pass').isManaFest, isTrue);
    });

    test('does not classify unrelated events as ManaFest', () {
      expect(_eventWithTitle('Subterranea').isManaFest, isFalse);
      expect(_eventWithTitle('Pluto Pool Party').isManaFest, isFalse);
    });
  });
}
