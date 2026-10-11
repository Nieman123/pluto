import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/event_checkout_link.dart';
import 'package:pluto/src/native_links.dart';

void main() {
  final order = 'a' * 64;
  for (final entry in {
    'https://pluto.events': 'events.pluto.app',
    'https://pluto-staging-92eb7.web.app': 'events.pluto.app.staging',
  }.entries) {
    final origin = Uri.parse(entry.key);
    test('${entry.value} tags event checkout and returns to native tickets',
        () {
      final event = Uri.parse('/events/show?ref=promoter#tickets');
      final link = eventCheckoutLink(event, origin: origin, native: true);
      expect(link.queryParameters, {'ref': 'promoter', 'native_app': '1'});
      expect(link.fragment, 'tickets');
      expect(eventCheckoutLink(event, origin: origin, native: false),
          origin.resolveUri(event));
      expect(
          nativeAppRoute(Uri.parse('${entry.value}://tickets?order=$order'),
              origin: origin),
          Uri.parse('/tickets?order=$order'));
      expect(
          nativeAppRoute(Uri.parse('${entry.value}://tickets'), origin: origin),
          Uri.parse('/tickets'));
    });
    test('${entry.value} rejects crossed apps, redirects and capabilities', () {
      final other = entry.value.endsWith('.staging')
          ? 'events.pluto.app'
          : 'events.pluto.app.staging';
      for (final link in [
        '$other://tickets?order=$order',
        '${entry.value}://profile?order=$order',
        '${entry.value}://tickets/extra?order=$order',
        '${entry.value}://user@tickets?order=$order',
        '${entry.value}://tickets:123?order=$order',
        '${entry.value}://tickets?order=invalid',
        '${entry.value}://tickets?order=%FF',
        '${entry.value}://tickets?order=$order&order=$order',
        '${entry.value}://tickets?order=$order&accessKey=secret',
        '${entry.value}://tickets?returnTo=https://evil.example',
        '${entry.value}://tickets?order=$order#recovery=secret',
      ]) {
        expect(nativeAppRoute(Uri.parse(link), origin: origin), isNull);
      }
      for (final url in [
        'https://posh.vip/e/show',
        'https://evil.example/events/show',
        'mailto:contact@pluto.events',
        '/tickets/admin',
        '/events/show/media/id',
      ]) {
        final link = origin.resolve(url);
        expect(eventCheckoutLink(link, origin: origin, native: true), link);
      }
    });
  }
}
