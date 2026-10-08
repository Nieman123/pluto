import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_checkout_cleanup.dart';

void main() {
  final order = <String, dynamic>{
    'orderId': 'one',
    'eventId': 'festival',
    'status': 'paid'
  };
  final storage = <String, String>{
    'pluto-order-one': 'original',
    'pluto-checkout-festival':
        jsonEncode({'eventId': 'festival', 'accessKey': 'original'})
  };
  test(
      'authoritative order and account responses clear their completed attempts',
      () {
    expect(completedCheckoutKeys(order, (k) => storage[k]),
        ['pluto-checkout-festival']);
    expect(
        completedCheckoutKeys({
          'orders': [order]
        }, (k) => storage[k]),
        ['pluto-checkout-festival']);
  });
  test('old receipts never erase a newer checkout for the same event', () {
    final newer = {
      ...storage,
      'pluto-checkout-festival':
          jsonEncode({'eventId': 'festival', 'accessKey': 'new-attempt'})
    };
    expect(completedCheckoutKeys(order, (k) => newer[k]), isEmpty);
    expect(
        completedCheckoutKeys({...order, 'status': 'open'}, (k) => storage[k]),
        isEmpty);
    expect(
        completedCheckoutKeys({...order, 'offline': true}, (k) => storage[k]),
        isEmpty);
  });
}
