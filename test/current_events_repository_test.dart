import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/current_events_repository.dart';

CurrentEvent _eventWithTitle(String title) {
  return CurrentEvent(
    id: 'event-id',
    title: title,
    details: '',
    ticketUrl: '',
    flyerDataUrl: '',
    isActive: true,
    sortOrder: 0,
    createdAt: null,
    updatedAt: null,
  );
}

void main() {
  group('CurrentEventX.isManaFest', () {
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
