import 'dart:convert';

/// Clear only a completed attempt whose original proof matches this receipt.
/// An older ticket must never erase a newer checkout for the same event.
List<String> completedCheckoutKeys(
    Map<String, dynamic> data, String? Function(String) read) {
  if (data['offline'] == true) return [];
  final orders = [
    if (data['orderId'] != null) data,
    ...data['orders'] as List? ?? []
  ];
  final keys = <String>[];
  for (final raw in orders) {
    final order = raw as Map;
    if (![
          'paid',
          'expired',
          'cancelled',
          'pending-approval',
          'refunded',
          'partially-refunded',
          'declined',
          'withdrawn'
        ].contains(order['status']) ||
        order['eventId'] == null) continue;
    final key = 'pluto-checkout-${order['eventId']}';
    final proof = read('pluto-order-${order['orderId']}');
    final saved = read(key);
    if (saved == null || proof == null) continue;
    try {
      final attempt = jsonDecode(saved) as Map;
      if (attempt['accessKey'] == proof &&
          attempt['eventId'] == order['eventId']) keys.add(key);
    } catch (_) {
      /* Leave unknown carts to the event page's safe reconciliation. */
    }
  }
  return keys;
}
