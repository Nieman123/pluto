import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/src/ticket_wallet_browser.dart';

void main() {
  Map<String, dynamic> ticket(int id, String event) =>
      {'id': 'ticket-$id', 'eventId': event, 'eventTitle': event};
  Future<void> pump(WidgetTester tester, List<dynamic> tickets,
          {bool orders = false,
          String? event,
          void Function(String?)? onEvent,
          List<dynamic> receipts = const []}) =>
      tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: TicketWalletBrowser(
        header: const [],
        footer: const [],
        tickets: tickets,
        orders: receipts,
        wallet: true,
        showOrders: orders,
        eventId: event,
        onEvent: onEvent ?? (_) {},
        ticketBuilder: (t) =>
            SizedBox(height: 600, child: Text(t['id'] as String)),
        orderBuilder: (o) => Text('Receipt ${o['orderId']}'),
      ))));

  testWidgets('one event opens directly and only builds visible ticket rows',
      (tester) async {
    await pump(tester, List.generate(80, (i) => ticket(i, 'Manafest')));
    expect(find.text('ticket-0'), findsOneWidget);
    expect(find.text('ticket-79'), findsNothing);
    expect(find.byType(RepaintBoundary).evaluate().length, lessThan(15));
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1800));
    await tester.pumpAndSettle();
    expect(find.text('ticket-0'), findsNothing);
  });
  testWidgets('multiple events show a picker without building any ticket rows',
      (tester) async {
    String? chosen;
    await pump(tester, [ticket(0, 'Manafest'), ticket(1, 'Halloween')],
        onEvent: (id) => chosen = id);
    expect(find.text('ticket-0'), findsNothing);
    expect(find.text('ticket-1'), findsNothing);
    await tester.tap(find.text('Halloween'));
    expect(chosen, 'Halloween');
    await pump(tester, [ticket(0, 'Manafest'), ticket(1, 'Halloween')],
        event: chosen);
    expect(find.text('ticket-1'), findsOneWidget);
    expect(find.text('ticket-0'), findsNothing);
    expect(find.text('All events'), findsOneWidget);
  });
  testWidgets('orders view contains receipts and builds no ticket rows',
      (tester) async {
    await pump(tester, [ticket(0, 'Manafest')],
        orders: true,
        receipts: [
          {'orderId': 'one'}
        ]);
    expect(find.text('Receipt one'), findsOneWidget);
    expect(find.text('ticket-0'), findsNothing);
  });
  test(
      'events with the same name remain distinct by ID; pending RSVPs remain discoverable',
      () {
    final groups = walletEvents([
      {...ticket(0, 'first'), 'eventTitle': 'Party'},
      {...ticket(1, 'second'), 'eventTitle': 'Party'},
    ], [
      {
        'orderId': 'pending',
        'eventId': 'third',
        'eventTitle': 'RSVP',
        'method': 'rsvp',
        'rsvpStatus': 'pending'
      }
    ]);
    expect(groups.map((e) => e.id), ['first', 'second', 'third']);
    expect(groups.last.tickets, isEmpty);
  });
}
