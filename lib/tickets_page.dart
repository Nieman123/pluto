import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'src/email_verification.dart';
import 'src/html_open_link.dart';
import 'src/offline_ticket_cache.dart';
import 'src/ticket_access_store.dart';
import 'src/ticket_qr.dart';
import 'src/ticket_wallet.dart';
import 'ticketing_repository.dart';

class TicketsPage extends StatefulWidget {
  const TicketsPage({super.key, required this.uri});
  final Uri uri;
  @override
  State<TicketsPage> createState() => _TicketsPageState();
}

class _TicketsPageState extends State<TicketsPage> {
  final TicketingRepository _repository = TicketingRepository();
  final OfflineTicketCache _cache = OfflineTicketCache(
      read: ticketAccessRead,
      write: ticketAccessWrite,
      remove: ticketAccessRemove,
      keys: ticketAccessKeys);
  String? _lastAccount;
  final TextEditingController _email = TextEditingController();
  StreamSubscription<User?>? _authSubscription;
  Map<String, dynamic>? _data;
  String? _orderId;
  String? _holderToken;
  String? _transferToken;
  String? _error;
  String? _notice;
  bool _busy = false;
  bool _refreshAfterAuthChange = false;
  static const bool _showAddToWallet =
      bool.fromEnvironment('TICKETING_WALLET_UI_ENABLED');
  Timer? _locationRevealTimer;
  Map<String, dynamic> _digitalWallets = <String, dynamic>{};
  String _money(dynamic cents) => NumberFormat.simpleCurrency(name: 'USD')
      .format((cents as num? ?? 0) / 100);
  String _orderLabel(Map<dynamic, dynamic> order) {
    if (order['method'] != 'rsvp') {
      return '${order['status']} · ${_money(order['total'])}';
    }
    return 'RSVP · ${switch (order['rsvpStatus']) {
      'pending' => 'Awaiting approval',
      'approved' => 'Approved',
      'declined' => 'Declined',
      'withdrawn' => 'Withdrawn',
      _ => 'Status unavailable',
    }}';
  }

  @override
  void initState() {
    super.initState();
    _orderId = widget.uri.queryParameters['order'];
    _lastAccount = FirebaseAuth.instance.currentUser?.uid;
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen((_) {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (_lastAccount == uid) return;
      if (_lastAccount != null && _lastAccount != uid)
        _cache.clear('account-$_lastAccount');
      _lastAccount = uid;
      if (mounted) setState(() => _data = null);
      if (!_busy) {
        _refresh();
      } else {
        _refreshAfterAuthChange = true;
      }
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
      if (mounted && _refreshAfterAuthChange) {
        _refreshAfterAuthChange = false;
        _refresh();
      }
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
          await ticketAccessWrite(
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
            await ticketAccessWrite(
                'pluto-holder-$_holderToken', _holderToken!);
            _transferToken = null;
          } catch (error) {
            if (!error.toString().contains('not found')) rethrow;
          }
        }
        await _load();
      });
  Future<void> _load() async {
    // Provider setup is optional and must not prevent access to in-app tickets.
    if (_showAddToWallet) {
      try {
        _digitalWallets = await _repository.request('wallet/options');
      } catch (_) {
        _digitalWallets = <String, dynamic>{};
      }
    }
    if (_holderToken != null)
      _data = await _cachedRequest(
          'holder', <String, dynamic>{'token': _holderToken});
    else if (_orderId != null)
      _data = await _cachedRequest('order', <String, dynamic>{
        'orderId': _orderId,
        'accessKey': ticketAccessRead('pluto-order-$_orderId')
      });
    else
      _data = await _wallet();
    _scheduleLocationRefresh();
    if (mounted) setState(() {});
  }

  void _scheduleLocationRefresh() {
    _locationRevealTimer?.cancel();
    final venues = <dynamic>[
      _data?['venue'],
      ...((_data?['tickets'] as List?) ?? <dynamic>[])
          .map((dynamic t) => (t as Map)['venue'])
    ];
    final times = venues
        .whereType<Map>()
        .where((v) => v['available'] == false)
        .map((v) => DateTime.tryParse(v['revealAt'] as String? ?? ''))
        .whereType<DateTime>()
        .toList()
      ..sort();
    if (times.isEmpty) return;
    final seconds =
        (times.first.difference(DateTime.now()).inSeconds + 2).clamp(5, 43200);
    _locationRevealTimer =
        Timer(Duration(seconds: seconds), _refreshRevealedLocation);
  }

  void _refreshRevealedLocation() {
    if (!mounted) return;
    if (_busy) {
      _locationRevealTimer =
          Timer(const Duration(seconds: 5), _refreshRevealedLocation);
      return;
    }
    _refresh();
  }

  Future<Map<String, dynamic>> _wallet() => loadTicketWallet(
      request: _cachedRequest,
      signedIn: FirebaseAuth.instance.currentUser != null,
      savedKeys: ticketAccessKeys(),
      readAccess: ticketAccessRead,
      removeAccess: ticketAccessRemove);

  Future<Map<String, dynamic>> _cachedRequest(
      String path, Map<String, dynamic> body) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final scope = uid == null ? 'guest' : 'account-$uid';
    final Map<String, dynamic> result;
    try {
      result = await _cache.request(path, body, scope, _repository.request);
    } catch (_) {
      if (mounted) setState(() => _data = null);
      rethrow;
    }
    if (FirebaseAuth.instance.currentUser?.uid != uid) {
      await _cache.clear(scope);
      throw const TicketingException(
          401, 'Your account changed. Refresh your tickets.');
    }
    return result;
  }

  Future<void> _refresh() => _run(_load);
  Future<void> _addToWallet(Map<String, dynamic> ticket) async {
    final platform = await showDialog<String>(
        context: context,
        builder: (context) => Theme(
            data: _walletTheme,
            child: AlertDialog(
              title: const Text('Add to Wallet'),
              content:
                  Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
                const Text(
                    'Keep your admission pass handy on your phone. Your ticket also stays here in the app.'),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                    onPressed: _digitalWallets['apple'] == true
                        ? () => Navigator.pop(context, 'apple')
                        : null,
                    icon: const Icon(Icons.phone_iphone),
                    label: const Text('Add to Apple Wallet')),
                OutlinedButton.icon(
                    onPressed: _digitalWallets['google'] == true
                        ? () => Navigator.pop(context, 'google')
                        : null,
                    icon: const Icon(Icons.account_balance_wallet_outlined),
                    label: const Text('Add to Google Wallet')),
                if (_digitalWallets['apple'] != true &&
                    _digitalWallets['google'] != true)
                  const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text(
                          'Digital wallet passes are coming soon. Show your in-app QR at the door.')),
              ]),
              actions: <Widget>[
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close'))
              ],
            )));
    if (platform == null || !mounted) return;
    await _run(() async {
      final result =
          await _repository.request('wallet/$platform', <String, dynamic>{
        'ticketId': ticket['id'],
        'accessKey':
            ticketAccessRead('pluto-order-${_orderId ?? ticket['orderId']}'),
        'holderToken': _holderToken ?? ticket['holderToken'],
      });
      // Navigation in the current browser avoids popup blocking after the API call.
      await htmlNavigateTo(result['url'] as String);
    });
  }

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

  Future<void> _startAccount(String route) async {
    final Map<String, dynamic>? data = _data;
    final List<dynamic> orders =
        data?['orders'] as List<dynamic>? ?? <dynamic>[];
    final Map? contact = _orderId != null
        ? data
        : orders.isNotEmpty
            ? orders.first as Map
            : null;
    await ticketAccessWrite(
        'pluto-account-email', contact?['email'] as String? ?? '');
    await ticketAccessWrite(
        'pluto-account-name', contact?['name'] as String? ?? '');
    if (!mounted) return;
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
        _body(_data?['method'] == 'rsvp'
            ? 'Keep your tickets and RSVPs together across devices. Your RSVP status and any available pass are shown below.'
            : 'Keep your tickets together across devices, earn Pluto Points and get ready for the next event. Your ticket is ready to use below.'),
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
      _body(_data?['method'] == 'rsvp'
          ? 'Verify ${user.email ?? 'your email'} to link this RSVP to your account. Your request status remains available in this browser while you finish.'
          : 'Verify ${user.email ?? 'your email'} to link purchases to your account. Your tickets in this browser remain available while you finish.'),
      const SizedBox(height: 16),
      Wrap(spacing: 12, runSpacing: 10, children: <Widget>[
        FilledButton(
            onPressed: _busy
                ? null
                : () => _run(() async {
                      await requestEmailVerification(user);
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
          ZoomableTicketQr(
              data: ticket['qr'] as String,
              label: 'Admission QR for ${ticket['name']}'),
          const SizedBox(height: 16),
          const Center(
              child: Text('Show this code at the door · Tap to enlarge',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: _muted, fontSize: 13))),
        ] else
          _body(
              'This admission credential is unavailable here. It may have been transferred, refunded or revoked.'),
        if ((ticket['calendarUrl'] as String? ?? '').isNotEmpty) ...<Widget>[
          const SizedBox(height: 16),
          SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                  onPressed: _busy
                      ? null
                      : () => htmlOpenLink(ticket['calendarUrl'] as String),
                  icon: const Icon(Icons.event_outlined, size: 18),
                  label: const Text('Add to Calendar'))),
        ],
        if (_showAddToWallet &&
            ticket['qr'] != null &&
            ticket['admission'] == null) ...<Widget>[
          const SizedBox(height: 16),
          SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                  onPressed: _busy ? null : () => _addToWallet(ticket),
                  icon: const Icon(Icons.account_balance_wallet_outlined,
                      size: 18),
                  label: const Text('Add to Wallet'))),
        ],
        if (ticket['transferable'] == true) ...<Widget>[
          const SizedBox(height: 16),
          SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _transfer(ticket),
                  icon: const Icon(Icons.send_outlined, size: 18),
                  label: const Text('Transfer ticket'))),
        ],
        if (_orderId == null &&
            _holderToken == null &&
            ticket['venue'] != null) ...<Widget>[
          const SizedBox(height: 18),
          _venue(ticket['venue'] as Map?),
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
          if (venue['available'] == false) ...<Widget>[
            _body(
                'The exact venue and directions are being kept private until the location reveal.'),
            const SizedBox(height: 8),
            if (DateTime.tryParse(venue['revealAt'] as String? ?? '')
                case final DateTime revealAt)
              _body(
                  'Reveals ${DateFormat.yMMMEd().add_jm().format(revealAt.toLocal())} (your time).'),
            const SizedBox(height: 8),
            _body(
                'This page will refresh when it is time. You can also use Refresh to check.'),
          ] else ...<Widget>[
            Text(venue['name'] as String? ?? '',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            SelectableText(venue['address'] as String? ?? '',
                style: const TextStyle(color: _muted, height: 1.6)),
            if ((venue['directions'] as String? ?? '').isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              _body(venue['directions'] as String)
            ],
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
        _body(data['method'] == 'rsvp'
            ? _orderLabel(data)
            : '${data['status']} · Total ${_money(data['total'])} · Refunds ${_money(data['refundedAmount'])}'),
        if (data['rsvpStatus'] == 'pending')
          _body(
              'Your RSVP is awaiting organizer approval. This request does not grant admission. Your QR and private venue details will appear here after approval. Refresh to check your status.'),
        if (data['rsvpStatus'] == 'declined')
          _body('Your RSVP was declined. No admission QR has been issued.'),
        if (data['rsvpStatus'] == 'withdrawn')
          _body('Your RSVP was withdrawn. Any previous QR is no longer valid.'),
        if (data['rsvpStatus'] == 'approved')
          _body(
              'Your RSVP is confirmed. This pass is for the named attendee and cannot be transferred. Bring a photo ID.'),
        if ((data['decisionNote'] as String? ?? '').isNotEmpty)
          _body('Organizer note: ${data['decisionNote']}'),
        if (data['eventStatus'] == 'cancelled')
          _body(data['method'] == 'rsvp'
              ? 'This event has been cancelled. Your RSVP no longer grants admission.'
              : 'This event has been cancelled. Contact Pluto about your order and refund approval.'),
        if ((data['discount'] as num? ?? 0) > 0)
          _body('Discounts: ${_money(data['discount'])}'),
        if ((data['taxAmount'] as num? ?? 0) > 0)
          _body('Applicable tax included: ${_money(data['taxAmount'])}'),
        if ((data['externalRefundAmount'] as num? ?? 0) > 0)
          _body(
              'An additional ${_money(data['externalRefundAmount'])} refund is awaiting ticket review.'),
        const SizedBox(height: 10),
        Wrap(spacing: 12, runSpacing: 8, children: <Widget>[
          if (data['status'] == 'paid')
            TextButton(
                onPressed: _busy || data['offline'] == true
                    ? null
                    : () => _run(() async {
                          await _repository.request('resend', <String, dynamic>{
                            'orderId': _orderId,
                            'accessKey':
                                ticketAccessRead('pluto-order-$_orderId')
                          });
                          if (mounted)
                            setState(() => _notice =
                                'Confirmation email queued. Your tickets stay in the app.');
                        }),
                child: const Text('Resend confirmation')),
          if (data['method'] == 'rsvp' &&
              <String>['pending', 'approved'].contains(data['rsvpStatus']))
            TextButton(
                onPressed: _busy || data['offline'] == true
                    ? null
                    : () => _run(() async {
                          final bool? withdraw = await showDialog<bool>(
                            context: context,
                            builder: (BuildContext context) => AlertDialog(
                              title: const Text('Withdraw RSVP?'),
                              content: const Text(
                                  'This removes your admission access and frees any unused capacity. Your existing RSVP remains in your history.'),
                              actions: <Widget>[
                                TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, false),
                                    child: const Text('Keep RSVP')),
                                TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, true),
                                    child: const Text('Withdraw RSVP')),
                              ],
                            ),
                          );
                          if (withdraw != true) return;
                          await _repository.request('cancel', <String, dynamic>{
                            'orderId': _orderId,
                            'accessKey':
                                ticketAccessRead('pluto-order-$_orderId'),
                          });
                          await _load();
                        }),
                child: const Text('Withdraw RSVP')),
          if ((data['receiptUrl'] as String? ?? '').isNotEmpty)
            TextButton(
                onPressed: () => htmlOpenLink(data['receiptUrl'] as String),
                child: const Text('Payment receipt')),
          if ((data['upgradeUrl'] as String? ?? '').isNotEmpty)
            TextButton(
                onPressed: data['offline'] == true
                    ? null
                    : () => htmlOpenLink(data['upgradeUrl'] as String),
                child: const Text('Browse VIP upgrades')),
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
        (_orderId != null &&
            (data?['status'] == 'paid' || data?['method'] == 'rsvp'));
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
                                        'Your admission tickets and RSVPs stay here in the Pluto app.'),
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
                                    if (data?['offline'] == true)
                                      _panel(children: <Widget>[
                                        _title('Saved tickets · Offline'),
                                        _body(
                                            'Last synced ${DateFormat.yMMMd().add_jm().format(DateTime.fromMillisecondsSinceEpoch(data!['savedAt'] as int))}. Admission status and venue details may have changed. Reconnect to refresh before arrival.')
                                      ]),
                                    for (final dynamic warning
                                        in data?['warnings'] as List? ??
                                            <dynamic>[])
                                      _panel(children: <Widget>[
                                        _body(warning as String)
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
                                                      await ticketAccessWrite(
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
                                                    _orderLabel(o as Map),
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
                                              onPressed: _busy ||
                                                      data?['offline'] == true
                                                  ? null
                                                  : _claim,
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
    _locationRevealTimer?.cancel();
    _authSubscription?.cancel();
    _repository.dispose();
    _email.dispose();
    super.dispose();
  }
}
