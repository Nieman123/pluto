import '../ticketing_repository.dart';

typedef WalletRequest = Future<Map<String, dynamic>> Function(
    String path, Map<String, dynamic> body);

Future<Map<String, dynamic>> loadTicketWallet({
  required WalletRequest request,
  required bool signedIn,
  required Iterable<String> savedKeys,
  required String? Function(String) readAccess,
  required void Function(String) removeAccess,
  bool claimPurchases = false,
}) async {
  final Map<String, dynamic> orders = <String, dynamic>{};
  final Map<String, dynamic> tickets = <String, dynamic>{};
  final ranks = <String, int>{};
  void mergeTicket(Map<String, dynamic> ticket, int rank) {
    final id = ticket['id'] as String;
    if (rank >= (ranks[id] ?? -1)) {
      tickets[id] = ticket;
      ranks[id] = rank;
    }
  }

  final Set<String> warnings = <String>{};
  bool demo = false;
  final List<int> savedTimes = <int>[];
  if (signedIn) {
    try {
      final Map<String, dynamic> linked = await request('mine',
          <String, dynamic>{if (claimPurchases) 'claimPurchases': true});
      demo = linked['demo'] == true;
      if (linked['offline'] == true) savedTimes.add(linked['savedAt'] as int);
      for (final dynamic order in linked['orders'] as List) {
        orders[order['orderId'] as String] = order;
      }
      for (final dynamic ticket in linked['tickets'] as List) {
        mergeTicket(Map<String, dynamic>.from(ticket as Map),
            linked['offline'] == true ? 3 : 13);
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
  // Account results already contain these orders and their current tickets.
  // Refreshing their saved receipts again adds latency and stale overwrite risk.
  final pending = saved
      .where((key) =>
          !key.startsWith('pluto-order-') ||
          !orders.containsKey(key.substring('pluto-order-'.length)))
      .toList();
  Future<void> loadSaved(String key) async {
    final bool holder = key.startsWith('pluto-holder-');
    try {
      if (holder) {
        final String? token = readAccess(key);
        final Map<String, dynamic> ticket =
            await request('holder', <String, dynamic>{'token': token});
        if (ticket['offline'] == true) savedTimes.add(ticket['savedAt'] as int);
        mergeTicket(<String, dynamic>{...ticket, 'holderToken': token},
            ticket['offline'] == true ? 2 : 12);
      } else {
        final String orderId = key.substring('pluto-order-'.length);
        final Map<String, dynamic> order = await request(
            'order', <String, dynamic>{
          'orderId': orderId,
          'accessKey': readAccess(key)
        });
        if (order['offline'] == true) savedTimes.add(order['savedAt'] as int);
        orders[orderId] = order;
        for (final dynamic ticket in order['tickets'] as List) {
          mergeTicket(<String, dynamic>{
            ...ticket as Map<String, dynamic>,
            'orderId': orderId,
            'eventId': order['eventId'],
            'eventTitle': order['eventTitle'],
            'venue': ticket['venue'] ??
                (ticket['qr'] != null ? order['venue'] : null),
          }, order['offline'] == true ? 1 : 11);
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

  // Bound concurrency, especially for guest devices with many saved purchases.
  for (var offset = 0; offset < pending.length; offset += 4) {
    await Future.wait(pending.skip(offset).take(4).map(loadSaved));
  }
  return <String, dynamic>{
    if (demo) 'demo': true,
    'orders': orders.values.toList(),
    'tickets': tickets.values.toList(),
    'warnings': warnings.toList(),
    if (savedTimes.isNotEmpty) 'offline': true,
    if (savedTimes.isNotEmpty) 'savedAt': (savedTimes..sort()).first,
  };
}
