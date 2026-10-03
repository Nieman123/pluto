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
        builder: (BuildContext context) => Theme(
            data: _walletTheme,
            child: AlertDialog(
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
                ])));
    recipient.dispose();
    if (target == null || !mounted) return;
    await _run(() async {
      await _repository.request('transfer', <String, dynamic>{
        'orderId': _orderId ?? ticket['orderId'],
        'accessKey':
            ticketAccessRead('pluto-order-${_orderId ?? ticket['orderId']}'),
        'holderToken': _holderToken ?? ticket['holderToken'],
        'ticketId': ticket['id'],
        'email': target
      });
      setState(() => _notice =
          'Transfer invitation queued. Your ticket remains yours until the recipient accepts.');
    });
  }

  static const Color _ink = Color(0xFFF4EFF8);
  static const Color _muted = Color(0xFFBDB0CB);
  static const Color _accent = Color(0xFFD49CFF);
  static const Color _panelColor = Color(0xE60C0910);

  ThemeData get _walletTheme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        fontFamily: 'Montserrat',
        colorScheme: ColorScheme.fromSeed(
          seedColor: _accent,
          brightness: Brightness.dark,
          primary: _accent,
          surface: const Color(0xFF16101D),
          error: const Color(0xFFFFB4AB),
        ),
        textTheme: ThemeData.dark().textTheme.apply(
              fontFamily: 'Montserrat',
              bodyColor: _ink,
              displayColor: _ink,
            ),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFF7F48D6),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        )),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
          foregroundColor: _ink,
          side: const BorderSide(color: Colors.white24),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        )),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF15111B),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Colors.white24)),
          labelStyle: const TextStyle(color: _muted),
        ),
        dividerColor: Colors.white12,
      );

  Widget _panel(
          {required List<Widget> children, Color border = Colors.white12}) =>
      Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 18),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: _panelColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: border),
          boxShadow: <BoxShadow>[
            BoxShadow(
                color: Colors.black.withValues(alpha: .16),
                blurRadius: 22,
                offset: const Offset(0, 10))
          ],
        ),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );

  Widget _title(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(text,
            style: const TextStyle(
                fontSize: 21, height: 1.25, fontWeight: FontWeight.w800)),
      );
  Widget _body(String text) => Text(text,
      style: const TextStyle(color: _muted, height: 1.6, fontSize: 14));

  void _startAccount(String route) {
    final Map<String, dynamic>? data = _data;
    final List<dynamic> orders =
        data?['orders'] as List<dynamic>? ?? <dynamic>[];
    final Map? contact = _orderId != null
        ? data
        : orders.isNotEmpty
            ? orders.first as Map
            : null;
    ticketAccessWrite(
        'pluto-account-email', contact?['email'] as String? ?? '');
    ticketAccessWrite('pluto-account-name', contact?['name'] as String? ?? '');
    final String returnTo = Uri(
        path: '/tickets',
        queryParameters: <String, String>{
          if (_orderId != null) 'order': _orderId!
        }).toString();
    context.go(Uri(
        path: route,
        queryParameters: <String, String>{'returnTo': returnTo}).toString());
  }

  Future<void> _claim() => _run(() async {
        await FirebaseAuth.instance.currentUser?.reload();
        final User? user = FirebaseAuth.instance.currentUser;
        if (user?.emailVerified != true) {
          throw const TicketingException(403,
              'Your email is not verified yet. Open the verification email, then try again.');
        }
        await user!.getIdToken(true);
        await _repository.request('claim');
        await _load();
        if (mounted)
          setState(() => _notice =
              'Your purchases are linked to your Pluto account. You can find them here on any device.');
      });

  Widget _accountPrompt() {
    final User? user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      return _panel(border: _accent.withValues(alpha: .45), children: <Widget>[
        const Icon(Icons.auto_awesome_outlined, color: _accent, size: 28),
        const SizedBox(height: 14),
        _title('Finish your Pluto account'),
        _body(
            'Keep your tickets together across devices, earn Pluto Points and get ready for the next event. Your ticket is ready to use below.'),
        const SizedBox(height: 18),
        Wrap(spacing: 12, runSpacing: 10, children: <Widget>[
          FilledButton.icon(
              onPressed: () => _startAccount('/sign-up'),
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Create my account')),
          TextButton(
              onPressed: () => _startAccount('/sign-on'),
              child: const Text('Already a member? Sign in')),
        ]),
      ]);
    }
    if (user.emailVerified) return const SizedBox.shrink();
    return _panel(border: _accent.withValues(alpha: .45), children: <Widget>[
      _title('One more step: verify your email'),
      _body(
          'Verify ${user.email ?? 'your email'} to link purchases to your account. Your tickets in this browser remain available while you finish.'),
      const SizedBox(height: 16),
      Wrap(spacing: 12, runSpacing: 10, children: <Widget>[
        FilledButton(
            onPressed: _busy
                ? null
                : () => _run(() async {
                      await user.sendEmailVerification();
                      if (mounted)
                        setState(() => _notice =
                            'Verification email sent. Open the link, then select “I’ve verified my email” here.');
                    }),
            child: const Text('Send verification email')),
        OutlinedButton(
            onPressed: _busy ? null : _claim,
            child: const Text('I’ve verified my email')),
      ]),
    ]);
  }

  Widget _ticket(Map<String, dynamic> ticket) => _panel(children: <Widget>[
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          const Padding(
              padding: EdgeInsets.only(right: 14, top: 3),
              child: Icon(Icons.confirmation_number_outlined,
                  color: _accent, size: 30)),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                Text(
                    ticket['eventTitle'] as String? ??
                        _data?['eventTitle'] as String? ??
                        'PLUTO EVENTS',
                    style: const TextStyle(
                        color: _accent,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        height: 1.5)),
                const SizedBox(height: 4),
                _title(ticket['name'] as String? ?? 'Ticket'),
                _body(ticket['holderName'] as String? ?? ''),
              ])),
        ]),
        const SizedBox(height: 16),
        Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
                color: _accent.withValues(alpha: .12),
                borderRadius: BorderRadius.circular(30)),
            child: Text('Status: ${ticket['status'] ?? 'valid'}',
                style: const TextStyle(
                    color: _accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w700))),
        if (ticket['admission'] != null) ...<Widget>[
          const SizedBox(height: 14),
          _body(
              'First admission recorded. Use your wristband for festival re-entry.'),
        ],
        const Padding(
            padding: EdgeInsets.symmetric(vertical: 20), child: Divider()),
        if (ticket['qr'] != null) ...<Widget>[
          LayoutBuilder(
              builder: (context, constraints) => Center(
                      child: Container(
                    decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.all(16),
                    child: QrImageView(
                        data: ticket['qr'] as String,
                        size: (constraints.maxWidth - 32)
                            .clamp(0, 248)
                            .toDouble(),
                        backgroundColor: Colors.white,
                        semanticsLabel: 'Admission QR for ${ticket['name']}'),
                  ))),
          const SizedBox(height: 16),
          const Center(
              child: Text('Show this code at the door',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: _muted, fontSize: 13))),
        ] else
          _body(
              'This admission credential is unavailable here. It may have been transferred, refunded or revoked.'),
        if (ticket['transferable'] == true) ...<Widget>[
          const SizedBox(height: 16),
          OutlinedButton.icon(
              onPressed: _busy ? null : () => _transfer(ticket),
              icon: const Icon(Icons.send_outlined, size: 18),
              label: const Text('Transfer ticket')),
        ],
      ]);

  Widget _ticketGrid(List<dynamic> tickets) =>
      LayoutBuilder(builder: (context, constraints) {
        final double width = constraints.maxWidth >= 700
            ? (constraints.maxWidth - 18) / 2
            : constraints.maxWidth;
        return Wrap(
            spacing: 18,
            children: tickets
                .map((dynamic ticket) => SizedBox(
                    width: width,
                    child: _ticket(Map<String, dynamic>.from(ticket as Map))))
                .toList());
      });

  Widget _venue(Map? venue) => venue == null
      ? const SizedBox.shrink()
      : _panel(children: <Widget>[
          const Icon(Icons.location_on_outlined, color: _accent),
          const SizedBox(height: 12),
          _title('Getting here'),
          Text(venue['name'] as String? ?? '',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          SelectableText(venue['address'] as String? ?? '',
              style: const TextStyle(color: _muted, height: 1.6)),
          if ((venue['directions'] as String? ?? '').isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            _body(venue['directions'] as String)
          ],
        ]);

  void _allTickets() {
    _orderId = null;
    _holderToken = null;
    context.replace('/tickets');
    _refresh();
  }

  Widget _orderSummary(Map<String, dynamic> data) => _panel(children: <Widget>[
        _title(data['eventTitle'] as String? ?? 'Your order'),
        _body(
            '${data['status']} · Total ${_money(data['total'])} · Refunds ${_money(data['refundedAmount'])}'),
        if (data['eventStatus'] == 'cancelled')
          _body(
              'This event has been cancelled. Contact Pluto about your order and refund approval.'),
        if ((data['discount'] as num? ?? 0) > 0)
          _body('Discounts: ${_money(data['discount'])}'),
        if ((data['taxAmount'] as num? ?? 0) > 0)
          _body('Applicable tax included: ${_money(data['taxAmount'])}'),
        if ((data['externalRefundAmount'] as num? ?? 0) > 0)
          _body(
              'An additional ${_money(data['externalRefundAmount'])} refund is awaiting ticket review.'),
        const SizedBox(height: 10),
        Wrap(spacing: 12, runSpacing: 8, children: <Widget>[
          TextButton(
              onPressed: _busy
                  ? null
                  : () => _run(() async {
                        await _repository.request('resend', <String, dynamic>{
                          'orderId': _orderId,
                          'accessKey': ticketAccessRead('pluto-order-$_orderId')
                        });
                        if (mounted)
                          setState(() => _notice =
                              'Confirmation email queued. Your tickets stay in the app.');
                      }),
              child: const Text('Resend confirmation')),
          if ((data['receiptUrl'] as String? ?? '').isNotEmpty)
            TextButton(
                onPressed: () => htmlOpenLink(data['receiptUrl'] as String),
                child: const Text('Payment receipt')),
          TextButton(
              onPressed: _allTickets, child: const Text('All my tickets')),
        ]),
      ]);

  Widget _recovery() => _panel(children: <Widget>[
        _title('Recover a purchase'),
        _body(
            'Use the email from checkout to receive a secure link back to your tickets.'),
        const SizedBox(height: 16),
        TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const <String>[AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Purchase email')),
        const SizedBox(height: 16),
        FilledButton(
            onPressed: _busy
                ? null
                : () => _run(() async {
                      final Map<String, dynamic> response = await _repository
                          .request('recover',
                              <String, dynamic>{'email': _email.text});
                      if (mounted)
                        setState(() => _notice = response['message'] as String);
                    }),
            child: const Text('Email me a secure app link')),
      ]);

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic>? data = _data;
    final List<dynamic> orders =
        data?['orders'] as List<dynamic>? ?? <dynamic>[];
    final List<dynamic> tickets =
        data?['tickets'] as List<dynamic>? ?? <dynamic>[];
    final bool wallet =
        _orderId == null && _holderToken == null && _transferToken == null;
    final bool hasTickets = tickets.isNotEmpty ||
        _holderToken != null ||
        (_orderId != null && data?['status'] == 'paid');
    return Theme(
        data: _walletTheme,
        child: Builder(
            builder: (BuildContext context) => Material(
                  color: Colors.transparent,
                  child: SafeArea(
                      top: false,
                      child: SingleChildScrollView(
                        padding: EdgeInsets.all(
                            MediaQuery.sizeOf(context).width < 600 ? 16 : 32),
                        child: Center(
                            child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 960),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    const SizedBox(height: 12),
                                    const Text('YOUR NEXT NIGHT STARTS HERE',
                                        style: TextStyle(
                                            color: _accent,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 1.5)),
                                    const SizedBox(height: 10),
                                    Row(children: <Widget>[
                                      const Expanded(
                                          child: Text('My tickets',
                                              style: TextStyle(
                                                  fontSize: 34,
                                                  fontWeight: FontWeight.w900,
                                                  height: 1.15))),
                                      IconButton(
                                          onPressed: _busy ? null : _refresh,
                                          tooltip: 'Refresh tickets',
                                          icon: const Icon(Icons.refresh)),
                                    ]),
                                    const SizedBox(height: 10),
                                    _body(
                                        'Your admission tickets stay here in the Pluto app.'),
                                    const SizedBox(height: 18),
                                    Wrap(
                                        spacing: 12,
                                        runSpacing: 10,
                                        children: <Widget>[
                                          OutlinedButton.icon(
                                              onPressed: () =>
                                                  htmlNavigateTo('/events'),
                                              icon: const Icon(
                                                  Icons.explore_outlined),
                                              label:
                                                  const Text('Explore events')),
                                          OutlinedButton.icon(
                                              onPressed: () => context.go('/'),
                                              icon: const Icon(
                                                  Icons.dashboard_outlined),
                                              label:
                                                  const Text('Open Pluto app')),
                                        ]),
                                    const SizedBox(height: 24),
                                    if (_busy)
                                      const Padding(
                                          padding: EdgeInsets.only(bottom: 18),
                                          child: LinearProgressIndicator()),
                                    if (_error != null)
                                      _panel(
                                          border: const Color(0xFFFFB4AB),
                                          children: <Widget>[
                                            Text(_error!,
                                                style: const TextStyle(
                                                    color: Color(0xFFFFB4AB),
                                                    height: 1.6))
                                          ]),
                                    if (_notice != null)
                                      _panel(children: <Widget>[
                                        Text(_notice!,
                                            style: const TextStyle(
                                                color: _accent, height: 1.6))
                                      ]),
                                    if (hasTickets) _accountPrompt(),
                                    if (_transferToken != null)
                                      _panel(children: <Widget>[
                                        _title('A ticket is waiting for you'),
                                        _body(
                                            'Accepting moves its admission credential to you and invalidates the previous QR.'),
                                        const SizedBox(height: 16),
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
                                                      if (mounted)
                                                        setState(() {});
                                                    }),
                                            child: const Text('Accept ticket')),
                                      ]),
                                    if (_holderToken != null &&
                                        data != null) ...<Widget>[
                                      _ticket(data),
                                      _venue(data['venue'] as Map?),
                                      TextButton(
                                          onPressed: _allTickets,
                                          child: const Text('All my tickets')),
                                    ],
                                    if (_orderId != null &&
                                        data != null) ...<Widget>[
                                      _orderSummary(data),
                                      _ticketGrid(tickets),
                                      _venue(data['venue'] as Map?),
                                    ],
                                    if (wallet) ...<Widget>[
                                      if (orders.isNotEmpty) ...<Widget>[
                                        _title('Your orders'),
                                        ...orders.map((dynamic o) => Padding(
                                            padding: const EdgeInsets.only(
                                                bottom: 12),
                                            child: Material(
                                              color: _panelColor,
                                              borderRadius:
                                                  BorderRadius.circular(16),
                                              child: ListTile(
                                                contentPadding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 20,
                                                        vertical: 8),
                                                leading: const Icon(
                                                    Icons.receipt_long_outlined,
                                                    color: _accent),
                                                title: Text(
                                                    o['eventTitle'] as String),
                                                subtitle: Text(
                                                    '${o['status']} · ${_money(o['total'])}',
                                                    style: const TextStyle(
                                                        color: _muted)),
                                                trailing: const Icon(
                                                    Icons.chevron_right,
                                                    color: _accent),
                                                onTap: () => context.replace(
                                                    '/tickets?order=${o['orderId']}'),
                                              ),
                                            ))),
                                        const SizedBox(height: 12),
                                      ],
                                      if (tickets.isNotEmpty)
                                        _ticketGrid(tickets),
                                      if (orders.isEmpty &&
                                          tickets.isEmpty &&
                                          !_busy)
                                        _panel(children: <Widget>[
                                          const Icon(
                                              Icons
                                                  .confirmation_number_outlined,
                                              color: _accent,
                                              size: 38),
                                          const SizedBox(height: 16),
                                          _title(
                                              'Something to look forward to.'),
                                          _body(
                                              'No tickets are linked here yet. Explore the next event, open your secure confirmation link or recover a purchase below.'),
                                          if (FirebaseAuth
                                                  .instance.currentUser ==
                                              null)
                                            TextButton(
                                                onPressed: () =>
                                                    _startAccount('/sign-on'),
                                                child: const Text(
                                                    'Sign in to see linked tickets')),
                                        ]),
                                      _recovery(),
                                    ],
                                    if (FirebaseAuth.instance.currentUser
                                            ?.emailVerified ==
                                        true)
                                      Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 14),
                                          child: TextButton.icon(
                                              onPressed: _busy ? null : _claim,
                                              icon: const Icon(Icons.sync),
                                              label: const Text(
                                                  'Link purchases with my verified email'))),
                                    const Padding(
                                        padding:
                                            EdgeInsets.symmetric(vertical: 12),
                                        child: Text(
                                            'PLUTO · MUSIC BRINGS US TOGETHER',
                                            style: TextStyle(
                                                color: _muted,
                                                fontSize: 11,
                                                letterSpacing: 1.3))),
                                  ],
                                ))),
                      )),
                )));
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    _repository.dispose();
    _email.dispose();
    super.dispose();
  }
}
