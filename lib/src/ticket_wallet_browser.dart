import 'package:flutter/material.dart';

class WalletEvent {
  WalletEvent(this.id, this.title);
  final String id;
  final String title;
  final List<Map<String, dynamic>> tickets = [];
}

List<WalletEvent> walletEvents(List<dynamic> tickets, List<dynamic> orders) {
  final receipts = <String, Map>{
    for (final o in orders) o['orderId'] as String: o as Map
  };
  final groups = <String, WalletEvent>{};
  for (final raw in tickets) {
    final ticket = Map<String, dynamic>.from(raw as Map);
    final order = receipts[ticket['orderId']];
    final title = ticket['eventTitle'] as String? ??
        order?['eventTitle'] as String? ??
        'Pluto event';
    final id = ticket['eventId'] as String? ??
        order?['eventId'] as String? ??
        'legacy:$title';
    (groups[id] ??= WalletEvent(id, title)).tickets.add(ticket);
  }
  for (final raw in orders) {
    final order = raw as Map;
    if (order['method'] != 'rsvp' ||
        !['pending', 'approved'].contains(order['rsvpStatus'])) continue;
    final title = order['eventTitle'] as String? ?? 'Pluto event';
    final id = order['eventId'] as String? ?? 'legacy:$title';
    groups.putIfAbsent(id, () => WalletEvent(id, title));
  }
  return groups.values.toList();
}

/// Builds only visible ticket rows. Event and order navigation never builds QRs.
class TicketWalletBrowser extends StatelessWidget {
  const TicketWalletBrowser(
      {super.key,
      required this.header,
      required this.footer,
      required this.tickets,
      required this.orders,
      required this.wallet,
      required this.showOrders,
      required this.ticketBuilder,
      required this.orderBuilder,
      required this.onEvent,
      this.eventId});

  final List<Widget> header;
  final List<Widget> footer;
  final List<dynamic> tickets;
  final List<dynamic> orders;
  final bool wallet;
  final bool showOrders;
  final String? eventId;
  final Widget Function(Map<String, dynamic>) ticketBuilder;
  final Widget Function(Map<String, dynamic>) orderBuilder;
  final void Function(String?) onEvent;

  @override
  Widget build(BuildContext context) {
    final groups = walletEvents(tickets, orders);
    final selected = groups.where((e) => e.id == eventId).firstOrNull ??
        (groups.length == 1 ? groups.single : null);
    final visible =
        wallet ? selected?.tickets ?? <Map<String, dynamic>>[] : tickets;
    return LayoutBuilder(builder: (context, constraints) {
      final edge = constraints.maxWidth < 600 ? 16.0 : 32.0;
      final inset =
          ((constraints.maxWidth - 960) / 2).clamp(edge, double.infinity);
      final contentWidth = constraints.maxWidth - inset * 2;
      final columns = contentWidth >= 700 && visible.length > 1 ? 2 : 1;
      return CustomScrollView(
        key: PageStorageKey(
            'wallet-${showOrders ? 'orders' : eventId ?? 'tickets'}'),
        slivers: <Widget>[
          SliverPadding(
              padding: EdgeInsets.fromLTRB(inset, edge, inset, 0),
              sliver: SliverToBoxAdapter(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: header))),
          if (wallet && showOrders)
            SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: inset),
                sliver: SliverList.builder(
                    itemCount: orders.length,
                    itemBuilder: (_, index) => orderBuilder(
                        Map<String, dynamic>.from(orders[index] as Map)))),
          if (wallet && !showOrders && selected == null)
            SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: inset),
                sliver: SliverList.builder(
                    itemCount: groups.length,
                    itemBuilder: (_, index) {
                      final event = groups[index];
                      return Card(
                          margin: const EdgeInsets.only(bottom: 14),
                          child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 12),
                              leading: const Icon(Icons.event_outlined),
                              title: Text(event.title,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold)),
                              subtitle: Text(event.tickets.isEmpty
                                  ? 'RSVP status in Orders'
                                  : '${event.tickets.length} ticket${event.tickets.length == 1 ? '' : 's'}'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => onEvent(event.id)));
                    })),
          if (wallet && !showOrders && selected != null)
            SliverPadding(
                padding: EdgeInsets.fromLTRB(inset, 0, inset, 16),
                sliver: SliverToBoxAdapter(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                      if (groups.length > 1)
                        TextButton.icon(
                            onPressed: () => onEvent(null),
                            icon: const Icon(Icons.arrow_back),
                            label: const Text('All events')),
                      Text(selected.title,
                          style: const TextStyle(
                              fontSize: 24, fontWeight: FontWeight.bold)),
                      if (selected.tickets.isEmpty)
                        const Padding(
                            padding: EdgeInsets.only(top: 12),
                            child: Text(
                                'Your RSVP status is in Orders. Admission tickets appear after approval.')),
                    ]))),
          if (!showOrders && visible.isNotEmpty)
            SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: inset),
                sliver: SliverList.builder(
                    itemCount: (visible.length / columns).ceil(),
                    itemBuilder: (_, row) => Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              for (var column = 0;
                                  column < columns;
                                  column++) ...<Widget>[
                                if (column > 0) const SizedBox(width: 18),
                                Expanded(
                                    child:
                                        row * columns + column < visible.length
                                            ? RepaintBoundary(
                                                child: ticketBuilder(
                                                    Map<String, dynamic>.from(
                                                        visible[row * columns +
                                                            column] as Map)))
                                            : const SizedBox.shrink()),
                              ],
                            ]))),
          SliverPadding(
              padding: EdgeInsets.fromLTRB(inset, 12, inset, edge),
              sliver: SliverToBoxAdapter(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: footer))),
        ],
      );
    });
  }
}
