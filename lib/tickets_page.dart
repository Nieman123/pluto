import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'src/html_open_link.dart';
import 'src/ticket_access_store.dart';
import 'ticketing_repository.dart';

class TicketsPage extends StatefulWidget {
  const TicketsPage({super.key, required this.uri});
  final Uri uri;
  @override
  State<TicketsPage> createState() => _TicketsPageState();
}

class _TicketsPageState extends State<TicketsPage> {
  final TicketingRepository _repository = TicketingRepository();
  final TextEditingController _email = TextEditingController();
  StreamSubscription<User?>? _authSubscription;
  Map<String, dynamic>? _data;
  String? _orderId;
  String? _holderToken;
  String? _transferToken;
  String? _error;
  String? _notice;
  bool _busy = false;
  String _money(dynamic cents) => NumberFormat.simpleCurrency(name: 'USD')
      .format((cents as num? ?? 0) / 100);

  @override
  void initState() {
    super.initState();
    _orderId = widget.uri.queryParameters['order'];
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen((_) {
      if (!_busy) _refresh();
    });
    _openLink();
  }

  @override
  void didUpdateWidget(TicketsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uri != widget.uri) {
      _orderId = widget.uri.queryParameters['order'];
      _holderToken = null;
      _transferToken = null;
      _data = null;
      _openLink();
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted)
        setState(
            () => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openLink() => _run(() async {
        final Map<String, String> fragments =
            Uri.splitQueryString(widget.uri.fragment);
        if (fragments['recovery'] != null) {
          final Map<String, dynamic> result = await _repository.request(
              'recover/accept',
              <String, dynamic>{'token': fragments['recovery']});
          _orderId = result['orderId'] as String;
          ticketAccessWrite(
              'pluto-order-$_orderId', result['accessKey'] as String);
          if (mounted) context.replace('/tickets?order=$_orderId');
        }
        if (fragments['transfer'] != null) {
          _transferToken = fragments['transfer'];
          try {
            // Accepted links work on a second device as well as this browser.
            await _repository
                .request('holder', <String, dynamic>{'token': _transferToken});
            _holderToken = _transferToken;
            ticketAccessWrite('pluto-holder-$_holderToken', _holderToken!);
            _transferToken = null;
          } catch (error) {
            if (!error.toString().contains('not found')) rethrow;
          }
        }
        await _load();
      });
  Future<void> _load() async {
    if (_holderToken != null)
      _data = await _repository
          .request('holder', <String, dynamic>{'token': _holderToken});
    else if (_orderId != null)
      _data = await _repository.request('order', <String, dynamic>{
        'orderId': _orderId,
        'accessKey': ticketAccessRead('pluto-order-$_orderId')
      });
    else
      _data = await _wallet();
    if (mounted) setState(() {});
  }

  Future<Map<String, dynamic>> _wallet() async {
    final Map<String, dynamic> linked =
        FirebaseAuth.instance.currentUser == null
            ? <String, dynamic>{'orders': <dynamic>[], 'tickets': <dynamic>[]}
            : await _repository.request('mine');
    final Map<String, dynamic> orders = <String, dynamic>{
      for (final dynamic order in linked['orders'] as List)
        order['orderId'] as String: order
    };
    final Map<String, dynamic> tickets = <String, dynamic>{
      for (final dynamic ticket in linked['tickets'] as List)
        ticket['id'] as String: ticket
    };
    final List<String> saved = ticketAccessKeys()
        .where((key) =>
            key.startsWith('pluto-order-') || key.startsWith('pluto-holder-'))
        .toList()
        .reversed
        .take(30)
        .toList();
    for (final String key in saved) {
      try {
        if (key.startsWith('pluto-order-')) {
          final String orderId = key.substring('pluto-order-'.length);
          final Map<String, dynamic> order = await _repository.request(
              'order', <String, dynamic>{
            'orderId': orderId,
            'accessKey': ticketAccessRead(key)
          });
          orders[orderId] = order;
          for (final dynamic ticket in order['tickets'] as List) {
            tickets[ticket['id'] as String] = <String, dynamic>{
              ...ticket as Map<String, dynamic>,
              'orderId': orderId,
              'eventTitle': order['eventTitle']
            };
          }
        } else {
          final String? token = ticketAccessRead(key);
          final Map<String, dynamic> ticket = await _repository
              .request('holder', <String, dynamic>{'token': token});
          tickets[ticket['id'] as String] = <String, dynamic>{
            ...ticket,
            'holderToken': token
          };
        }
      } on TicketingException catch (error) {
        if (<int>[403, 404].contains(error.status))
          ticketAccessRemove(key);
        else
          rethrow;
      }
    }
    return <String, dynamic>{
      'orders': orders.values.toList(),
      'tickets': tickets.values.toList()
    };
  }

  Future<void> _refresh() => _run(_load);
  Future<void> _transfer(Map<String, dynamic> ticket) async {
    final TextEditingController recipient = TextEditingController();
    final String? target = await showDialog<String>(
        context: context,
        builder: (BuildContext context) => AlertDialog(
                title: const Text('Transfer ticket'),
                content:
                    Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
                  const Text(
                      'The recipient must accept before first admission. Once accepted, your previous QR will stop working. Your payment receipt stays with you.'),
                  TextField(
                      controller: recipient,
                      keyboardType: TextInputType.emailAddress,
                      decoration:
                          const InputDecoration(labelText: 'Recipient email')),
                ]),
                actions: <Widget>[
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, recipient.text),
                      child: const Text('Send invitation'))
                ]));
    recipient.dispose();
    if (target == null || !mounted) return;
    await _run(() async {
      await _repository.request('transfer', <String, dynamic>{
        'orderId': _orderId ?? ticket['orderId'],
        'accessKey': ticketAccessRead('pluto-order-$_orderId'),
        'holderToken': _holderToken ?? ticket['holderToken'],
        'ticketId': ticket['id'],
        'email': target
      });
      setState(() => _notice =
          'Transfer invitation queued. Your ticket remains yours until the recipient accepts.');
    });
  }

  Widget _ticket(Map<String, dynamic> ticket) => Card(
      child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(ticket['name'] as String? ?? 'Ticket',
                    style: Theme.of(context).textTheme.titleLarge),
                if (ticket['eventTitle'] != null)
                  Text(ticket['eventTitle'] as String),
                Text(ticket['holderName'] as String? ?? ''),
                Text('Status: ${ticket['status'] ?? 'valid'}'),
                if (ticket['admission'] != null)
                  const Text(
                      'First admission recorded. Use your wristband for festival re-entry.'),
                if (ticket['qr'] != null)
                  LayoutBuilder(
                      builder: (context, constraints) => Center(
                          child: Container(
                              color: Colors.white,
                              padding: const EdgeInsets.all(12),
                              margin: const EdgeInsets.symmetric(vertical: 20),
                              child: QrImageView(
                                  data: ticket['qr'] as String,
                                  size: (constraints.maxWidth - 24)
                                      .clamp(0, 260)
                                      .toDouble(),
                                  backgroundColor: Colors.white,
                                  semanticsLabel:
                                      'Admission QR for ${ticket['name']}')))),
                if (ticket['qr'] == null)
                  const Text(
                      'This admission credential is unavailable here. It may have been transferred, refunded or revoked.'),
                if (ticket['transferable'] == true)
                  TextButton.icon(
                      onPressed: _busy ? null : () => _transfer(ticket),
                      icon: const Icon(Icons.send_outlined),
                      label: const Text('Transfer ticket')),
              ])));
  Widget _venue(Map? venue) => venue == null
      ? const SizedBox.shrink()
      : Card(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Getting here',
                        style: Theme.of(context).textTheme.titleLarge),
                    Text(venue['name'] as String? ?? ''),
                    SelectableText(venue['address'] as String? ?? ''),
                    Text(venue['directions'] as String? ?? ''),
                  ])));
  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic>? data = _data;
    final List<dynamic> orders =
        data?['orders'] as List<dynamic>? ?? <dynamic>[];
    final List<dynamic> tickets =
        data?['tickets'] as List<dynamic>? ?? <dynamic>[];
    return Material(
        color: Theme.of(context).colorScheme.surface,
        child: SafeArea(
            child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(children: <Widget>[
                        Expanded(
                            child: Text('My tickets',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium)),
                        IconButton(
                            onPressed: _busy ? null : _refresh,
                            tooltip: 'Refresh tickets',
                            icon: const Icon(Icons.refresh))
                      ]),
                      const Text(
                          'Your admission tickets stay here in the Pluto app.'),
                      if (_busy) const LinearProgressIndicator(),
                      if (_error != null)
                        Padding(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            child: Text(_error!,
                                style: TextStyle(
                                    color:
                                        Theme.of(context).colorScheme.error))),
                      if (_notice != null)
                        Padding(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            child: Text(_notice!)),
                      if (_transferToken != null)
                        Card(
                            child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: <Widget>[
                                      const Text(
                                          'A ticket has been sent to you. Accepting moves its admission credential to you and invalidates the previous QR.'),
                                      FilledButton(
                                          onPressed: _busy
                                              ? null
                                              : () => _run(() async {
                                                    _data = await _repository
                                                        .request(
                                                            'transfer/accept',
                                                            <String, dynamic>{
                                                          'token':
                                                              _transferToken
                                                        });
                                                    _holderToken =
                                                        _transferToken;
                                                    ticketAccessWrite(
                                                        'pluto-holder-$_holderToken',
                                                        _holderToken!);
                                                    _transferToken = null;
                                                    setState(() {});
                                                  }),
                                          child: const Text('Accept ticket')),
                                    ]))),
                      if (_holderToken != null && data != null) ...<Widget>[
                        _ticket(data),
                        _venue(data['venue'] as Map?),
                        TextButton(
                            onPressed: () => context.replace('/tickets'),
                            child: const Text('All my tickets'))
                      ],
                      if (_orderId != null && data != null) ...<Widget>[
                        if (data['eventStatus'] == 'cancelled')
                          const Text(
                              'This event has been cancelled. Contact Pluto about your order and refund approval.'),
                        Text(data['eventTitle'] as String? ?? '',
                            style: Theme.of(context).textTheme.headlineSmall),
                        Text(
                            '${data['status']} · Total ${_money(data['total'])} · Refunds ${_money(data['refundedAmount'])}'),
                        if ((data['discount'] as num? ?? 0) > 0)
                          Text('Discounts: ${_money(data['discount'])}'),
                        if ((data['taxAmount'] as num? ?? 0) > 0)
                          Text(
                              'Applicable tax included: ${_money(data['taxAmount'])}'),
                        if ((data['externalRefundAmount'] as num? ?? 0) > 0)
                          Text(
                              'An additional ${_money(data['externalRefundAmount'])} refund is awaiting ticket review.'),
                        Wrap(spacing: 12, children: <Widget>[
                          TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => _run(() async {
                                        await _repository.request(
                                            'resend', <String, dynamic>{
                                          'orderId': _orderId,
                                          'accessKey': ticketAccessRead(
                                              'pluto-order-$_orderId')
                                        });
                                        setState(() => _notice =
                                            'Confirmation email queued. Your tickets stay in the app.');
                                      }),
                              child: const Text('Resend confirmation')),
                          if ((data['receiptUrl'] as String? ?? '').isNotEmpty)
                            TextButton(
                                onPressed: () =>
                                    htmlOpenLink(data['receiptUrl'] as String),
                                child: const Text('Payment receipt')),
                          TextButton(
                              onPressed: () {
                                _orderId = null;
                                context.replace('/tickets');
                                _refresh();
                              },
                              child: const Text('All my tickets')),
                        ]),
                        ...tickets.map((dynamic t) =>
                            _ticket(Map<String, dynamic>.from(t as Map))),
                        _venue(data['venue'] as Map?),
                      ],
                      if (_orderId == null &&
                          _holderToken == null &&
                          _transferToken == null) ...<Widget>[
                        if (FirebaseAuth.instance.currentUser != null)
                          TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => _run(() async {
                                        await _repository.request('claim');
                                        await _load();
                                        setState(() => _notice =
                                            'Orders matching your verified email are linked to your account.');
                                      }),
                              child: const Text(
                                  'Claim purchases with my verified email')),
                        ...orders.map((dynamic o) => Card(
                            child: ListTile(
                                title: Text(o['eventTitle'] as String),
                                subtitle: Text(
                                    '${o['status']} · ${_money(o['total'])}'),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () {
                                  _orderId = o['orderId'] as String;
                                  context.replace('/tickets?order=$_orderId');
                                  _refresh();
                                }))),
                        ...tickets.map((dynamic t) =>
                            _ticket(Map<String, dynamic>.from(t as Map))),
                        if (orders.isEmpty && tickets.isEmpty && !_busy)
                          const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Text(
                                  'No tickets are linked here yet. Open your secure confirmation link or recover your order below.')),
                        if (FirebaseAuth.instance.currentUser == null)
                          TextButton(
                              onPressed: () => context.go('/sign-on'),
                              child:
                                  const Text('Sign in to see linked tickets')),
                        Card(
                            child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text('Recover a purchase',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleLarge),
                                      TextField(
                                          controller: _email,
                                          keyboardType:
                                              TextInputType.emailAddress,
                                          autofillHints: const <String>[
                                            AutofillHints.email
                                          ],
                                          decoration: const InputDecoration(
                                              labelText: 'Purchase email')),
                                      FilledButton(
                                          onPressed: _busy
                                              ? null
                                              : () => _run(() async {
                                                    final Map<String, dynamic>
                                                        response =
                                                        await _repository
                                                            .request(
                                                                'recover',
                                                                <String,
                                                                    dynamic>{
                                                          'email': _email.text
                                                        });
                                                    setState(() => _notice =
                                                        response['message']
                                                            as String);
                                                  }),
                                          child: const Text(
                                              'Email me a secure app link')),
                                    ]))),
                      ],
                      TextButton(
                          onPressed: () => htmlNavigateTo('/events'),
                          child: const Text('Explore upcoming events')),
                    ]))));
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    _repository.dispose();
    _email.dispose();
    super.dispose();
  }
}
