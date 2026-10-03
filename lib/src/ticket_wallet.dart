import '../ticketing_repository.dart';

typedef WalletRequest = Future<Map<String, dynamic>> Function(
    String path, Map<String, dynamic> body);

Future<Map<String, dynamic>> loadTicketWallet({
  required WalletRequest request,
  required bool signedIn,
  required Iterable<String> savedKeys,
  required String? Function(String) readAccess,
  required void Function(String) removeAccess,
}) async {
  final Map<String, dynamic> orders = <String, dynamic>{};
  final Map<String, dynamic> tickets = <String, dynamic>{};
  final Set<String> warnings = <String>{};
  if (signedIn) {
    try {
      final Map<String, dynamic> linked =
          await request('mine', <String, dynamic>{});
      for (final dynamic order in linked['orders'] as List) {
        orders[order['orderId'] as String] = order;
      }
      for (final dynamic ticket in linked['tickets'] as List) {
        tickets[ticket['id'] as String] = ticket;
      }
    } catch (_) {
      warnings.add('Account tickets could not be loaded. Refresh to retry. '
          'Saved tickets that are available are shown below.');
    }
  }
  final List<String> saved = savedKeys
      .where((key) =>
          key.startsWith('pluto-order-') || key.startsWith('pluto-holder-'))
      .toList()
      .reversed
      .take(30)
      .toList();
  for (final String key in saved) {
    final bool holder = key.startsWith('pluto-holder-');
    try {
      if (holder) {
        final String? token = readAccess(key);
        final Map<String, dynamic> ticket =
            await request('holder', <String, dynamic>{'token': token});
        tickets[ticket['id'] as String] = <String, dynamic>{
          ...ticket,
          'holderToken': token
        };
      } else {
        final String orderId = key.substring('pluto-order-'.length);
        final Map<String, dynamic> order = await request(
            'order', <String, dynamic>{
          'orderId': orderId,
          'accessKey': readAccess(key)
        });
        orders[orderId] = order;
        for (final dynamic ticket in order['tickets'] as List) {
          tickets[ticket['id'] as String] = <String, dynamic>{
            ...ticket as Map<String, dynamic>,
            'orderId': orderId,
            'eventTitle': order['eventTitle']
          };
        }
      }
    } catch (error) {
      final bool revoked = holder &&
          error is TicketingException &&
          (error.code == 'ticket-access-revoked' ||
              error.status == 404 ||
              (error.status == 409 &&
                  error.message ==
                      'This ticket credential is no longer valid.'));
      if (revoked) {
        removeAccess(key);
        warnings.add('A saved transferred ticket is no longer valid. '
            'It may have been refunded or transferred again.');
      } else if (!holder &&
          error is TicketingException &&
          <int>[403, 404].contains(error.status)) {
        // Retain the order reference so financial history can be recovered.
        warnings.add('A saved order needs a new secure link. '
            'Use email recovery to restore access to its receipt and tickets.');
      } else {
        warnings.add(holder
            ? 'A saved transferred ticket could not be loaded. Refresh to retry; '
                'contact Pluto if its payment is under review.'
            : 'A saved order could not be loaded. Refresh to retry. '
                'Its access is still saved on this device.');
      }
    }
  }
  return <String, dynamic>{
    'orders': orders.values.toList(),
    'tickets': tickets.values.toList(),
    'warnings': warnings.toList()
  };
}
