import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'src/scanner/scanner_pin_entry.dart';
import 'src/scanner/scanner_storage.dart';
import 'src/scanner/ticket_scanner.dart';
import 'ticketing_repository.dart';

class TicketScannerPage extends StatefulWidget {
  const TicketScannerPage({super.key, this.initialPin, this.scanner});
  final String? initialPin;
  final TicketScanner? scanner;
  @override
  State<TicketScannerPage> createState() => _TicketScannerPageState();
}

class _TicketScannerPageState extends State<TicketScannerPage>
    with WidgetsBindingObserver {
  TicketingRepository? _repository;
  TicketScanner? _scanner;
  final _pin = TextEditingController();
  final _manual = TextEditingController();
  MobileScannerController? _camera;
  bool _cameraOn = false, _busy = true;
  bool _initialized = false;
  String? _initialPin;
  String _message = '', _lastQr = '';
  DateTime? _lastSeen;
  Map<String, dynamic>? _feedback;
  final _history = <Map<String, dynamic>>[];
  Timer? _feedbackTimer;
  int _tab = 0;
  List<Map<String, dynamic>> _guests = [], _attendees = [];
  String _guestSearch = '', _guestFilter = 'all', _attendanceSearch = '';
  Map<String, dynamic>? _attendance;
  Map<String, dynamic>? _pendingMovement;
  final _quantity = TextEditingController(text: '1');
  String _walkupAction = 'arrive';

  @override
  void initState() {
    super.initState();
    _initialPin = widget.initialPin;
    WidgetsBinding.instance.addObserver(this);
    if (nativeTicketScanningSupported) {
      _start();
    } else {
      _busy = false;
    }
  }

  Future<void> _start() async {
    final initialPin = _initialPin;
    _initialPin = null;
    await _run(() async {
      if (!_initialized) {
        _repository ??= widget.scanner == null ? TicketingRepository() : null;
        _scanner ??=
            widget.scanner ??
            TicketScanner(
              store: createScannerStore(),
              connectionAvailable: () async {
                try {
                  final connections = await Connectivity().checkConnectivity();
                  return connections.any((c) => c != ConnectivityResult.none);
                } catch (_) {
                  // If status detection fails, the API remains authoritative.
                  return true;
                }
              },
              request: (path, body, token) =>
                  _repository!.scannerRequest(path, body, scannerToken: token),
            );
        await _scanner!.initialize(restoreSession: initialPin == null);
        _initialized = true;
      }
      if (initialPin != null) await _scanner!.login(initialPin);
      if (_scanner!.session != null) await _loadGuests();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _feedbackTimer?.cancel();
    _camera?.dispose();
    _repository?.dispose();
    _pin.dispose();
    _manual.dispose();
    _quantity.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Returning to the foreground requires an explicit camera restart. No
    // background frames or surprise scans while another app covers this one.
    // The first camera permission dialog also makes the app inactive.
    if (_camera?.value.hasCameraPermission != true) return;
    if (state != AppLifecycleState.resumed) _stopCamera();
  }

  Future<void> _stopCamera() async {
    if (!_cameraOn) return;
    if (mounted) setState(() => _cameraOn = false);
    try {
      await _camera?.stop();
    } catch (_) {
      /* Already released by OS. */
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (mounted)
      setState(() {
        _busy = true;
        _message = '';
      });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _message = _friendly(error));
      if (_scanner?.session == null) await _stopCamera();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendly(Object error) {
    if (scannerNetworkError(error))
      return 'Unable to connect. Prepare offline admission online before using this lane without internet.';
    if (error is StateError) return error.message;
    if (error is FormatException) return error.message;
    return error.toString();
  }

  Future<void> _login() async {
    final pin = _pin.text;
    _pin.clear();
    FocusScope.of(context).unfocus();
    await _run(() async {
      await _scanner!.login(pin);
      await _loadGuests();
    });
  }

  Future<void> _loadGuests() async {
    _guests = await _scanner!.guests();
  }

  Future<void> _scan(String qr) async {
    if (_busy || qr.trim().isEmpty) return;
    await _run(() async {
      try {
        _showResult(await _scanner!.scan(qr));
      } catch (error) {
        _showResult({'result': 'error', 'detail': _friendly(error)});
        rethrow;
      }
    });
  }

  void _showResult(Map<String, dynamic> result) {
    if (!mounted) return;
    _feedbackTimer?.cancel();
    setState(() {
      _feedback = result;
      _history.insert(0, result);
      if (_history.length > 30) _history.removeLast();
    });
    if (result['result'] == 'accepted') HapticFeedback.mediumImpact();
    _feedbackTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _feedback = null);
    });
  }

  Future<void> _toggleCamera() async {
    if (_cameraOn) {
      await _stopCamera();
      return;
    }
    _camera ??= MobileScannerController(
      autoStart: false,
      formats: const [BarcodeFormat.qrCode],
    );
    _lastQr = '';
    _lastSeen = null;
    setState(() => _cameraOn = true);
    await _run(() async {
      try {
        await _camera!.start();
        if (!mounted ||
            WidgetsBinding.instance.lifecycleState !=
                AppLifecycleState.resumed) {
          await _stopCamera();
        }
      } catch (_) {
        await _stopCamera();
        throw StateError(
          'Camera unavailable. Allow camera access in your phone settings, then try again, or use manual entry.',
        );
      }
    });
  }

  void _detect(BarcodeCapture capture) {
    for (final barcode in capture.barcodes) {
      final qr = barcode.rawValue;
      if (qr == null || qr.isEmpty) continue;
      final now = DateTime.now();
      final sameInView =
          qr == _lastQr &&
          _lastSeen != null &&
          now.difference(_lastSeen!).inMilliseconds < 2500;
      if (qr == _lastQr) _lastSeen = now;
      if (_busy || _feedback != null || sameInView) return;
      _lastQr = qr;
      _lastSeen = now;
      _scan(qr);
      return;
    }
  }

  String _date(Object? value) => value is num
      ? DateFormat.yMMMd().add_jm().format(
          DateTime.fromMillisecondsSinceEpoch(value.toInt()),
        )
      : 'Unavailable';
  Future<void> _prepare() => _run(() async {
    final summary = await _scanner!.prepare();
    await _loadGuests();
    _message =
        'Offline admission prepared for up to 4 hours. '
        '${summary['accepted']} synced · ${summary['conflicts']} conflicts · '
        '${summary['held']} retained for organizer review. Use one offline lane.';
  });
  Future<void> _replay() => _run(() async {
    final summary = await _scanner!.replay();
    await _loadGuests();
    _message =
        '${summary['accepted']} admissions synced. '
        '${summary['conflicts']} conflicts need review.';
  });
  Future<void> _logout() => _run(() async {
    await _stopCamera();
    await _scanner!.logout();
    _history.clear();
    _feedback = null;
    _guests = [];
    _attendees = [];
    _attendance = null;
    _pendingMovement = null;
    _message = 'Scanner session ended. Queued scans stay on this device. Your Pluto account is unchanged.';
  });
  Future<void> _export() => _run(() async {
    final bytes = Uint8List.fromList(utf8.encode(_scanner!.exportRecords()));
    final path = await FilePicker.platform.saveFile(
      dialogTitle: 'Save offline admission records',
      fileName: 'pluto-offline-review-${_scanner!.session!['eventId']}.json',
      type: FileType.custom,
      allowedExtensions: ['json'],
      bytes: bytes,
    );
    if (path != null) _message = 'Offline records saved. Give this file to the event organizer for review.';
  });
  Future<void> _attendancePage({bool more = false}) async {
    final data = await _scanner!.attendance(
      cursor: more ? (_attendance?['cursor'] as Map<String, dynamic>?) : null,
    );
    _attendees = [
      if (more) ..._attendees,
      ...(data['rows'] as List).cast<Map<String, dynamic>>(),
    ];
    _attendance = data;
  }

  Future<void> _move(Map<String, dynamic> body) => _run(() async {
    // Retain an uncertain attempt for the exact retry; never send a second
    // walk-up increment if the original response was lost.
    _pendingMovement ??= {...body, 'attempt': scannerAttempt()};
    try {
      await _scanner!.movement(_pendingMovement!);
    } on TicketingException catch (error) {
      if ([400, 403, 409].contains(error.status)) _pendingMovement = null;
      rethrow;
    }
    _pendingMovement = null;
    await _attendancePage();
    _message = 'Door movement recorded.';
  });
  Future<void> _review(Map<String, dynamic> record) async {
    await _stopCamera();
    if (!mounted) return;
    final controller = TextEditingController();
    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Review offline conflict'),
        content: TextField(
          controller: controller,
          maxLength: 500,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Review note'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Record review'),
          ),
        ],
      ),
    );
    // Dispose after the dialog's closing animation releases the text field.
    Future<void>.delayed(const Duration(seconds: 1), controller.dispose);
    if (note != null && mounted)
      await _run(() async {
        await _scanner!.review(record['scanId'] as String, note);
        _message = 'Review saved. Ask an event manager to confirm or reject the recorded admission on the website.';
      });
  }

  Widget _button(String label, VoidCallback action, {IconData? icon}) =>
      OutlinedButton.icon(
        onPressed: _busy ? null : action,
        icon: Icon(icon ?? Icons.arrow_forward),
        label: Text(label),
      );
  Widget _loginView() => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.qr_code_scanner, size: 64),
            const SizedBox(height: 20),
            const Text(
              'Ticket scanner PIN',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            const Text(
              'Enter the PIN from your event organizer. No Pluto account needed.',
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _pin,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.go,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(8),
              ],
              onSubmitted: (_) {
                if (!_busy) _login();
              },
              decoration: const InputDecoration(
                labelText: '8-digit scanner PIN',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _busy ? null : _login,
              child: const Text('Open ticket scanner'),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _feedbackCard(Map<String, dynamic> result) {
    final accepted = result['result'] == 'accepted';
    final duplicate = result['result'] == 'duplicate';
    final offline = result['offline'] == true;
    final title = accepted
        ? 'Ticket scanned'
        : duplicate
        ? 'Already scanned'
        : result['result'] == 'outside-window'
        ? 'Outside admission window'
        : result['result'] == 'error'
        ? 'Scan not confirmed'
        : 'Ticket not accepted';
    final note = accepted
        ? offline
              ? 'Offline · Queued on this device. Server confirmation pending.'
              : 'Admission confirmed.'
        : duplicate
        ? 'Do not admit again.'
        : result['detail'] ?? 'No admission recorded.';
    return Semantics(
      liveRegion: true,
      child: Card(
        color: accepted
            ? offline
                  ? const Color(0xFF675000)
                  : const Color(0xFF14552D)
            : duplicate
            ? const Color(0xFF6A420D)
            : const Color(0xFF7C2020),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 26,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (result['holderName'] != null)
                Text(
                  '${result['holderName']}',
                  style: const TextStyle(color: Colors.white),
                ),
              if (result['name'] != null)
                Text(
                  '${result['name']}',
                  style: const TextStyle(color: Colors.white),
                ),
              Text('$note', style: const TextStyle(color: Colors.white)),
              if (result['warning'] != null)
                Text(
                  '${result['warning']}',
                  style: const TextStyle(color: Colors.white),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _scanView() {
    final scanner = _scanner!;
    final manifest = scanner.manifest;
    final age = manifest == null
        ? null
        : DateTime.now()
              .difference(
                DateTime.fromMillisecondsSinceEpoch(
                  (manifest['generatedAt'] as num).toInt() -
                      (manifest['deviceClockOffsetMs'] as num).toInt(),
                ),
              )
              .inMinutes;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          children: [
            _button(
              _cameraOn ? 'Stop camera' : 'Start camera',
              _toggleCamera,
              icon: Icons.camera_alt_outlined,
            ),
            if (_cameraOn)
              _button(
                'Flashlight',
                () => _run(() => _camera!.toggleTorch()),
                icon: Icons.flash_on,
              ),
            if (_cameraOn)
              _button(
                'Switch camera',
                () => _run(() => _camera!.switchCamera()),
                icon: Icons.cameraswitch,
              ),
          ],
        ),
        if (_cameraOn)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 280,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    MobileScanner(
                      controller: _camera,
                      onDetect: _detect,
                      errorBuilder: (context, error) => const Center(
                        child: Padding(
                          padding: EdgeInsets.all(20),
                          child: Text(
                            'Camera unavailable. Allow camera access in phone settings, or use manual entry.',
                          ),
                        ),
                      ),
                    ),
                    if (_busy)
                      const ColoredBox(
                        color: Colors.black54,
                        child: Center(child: CircularProgressIndicator()),
                      ),
                  ],
                ),
              ),
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _manual,
          minLines: 1,
          maxLines: 3,
          autocorrect: false,
          enableSuggestions: false,
          decoration: const InputDecoration(
            labelText: 'Ticket QR text (manual fallback)',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _busy ? null : () => _scan(_manual.text),
          child: const Text('Check ticket'),
        ),
        const Divider(height: 32),
        const Text(
          'Offline admission',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(
          '${scanner.pending.length} queued scans · ${scanner.offline ? 'Offline' : 'Connected on last request'}',
        ),
        Text(
          scanner.prepared
              ? 'Prepared $age minutes ago · Offline access until ${_date(manifest!['offlineUntil'])}.'
              : 'Prepare this event online before scanning without internet. PIN offline access lasts up to 4 hours.',
        ),
        if (age != null && age > 15)
          const Text(
            'Stale snapshot: new sales, transfers and refunds may be missing.',
          ),
        const Text(
          'Use one offline lane. PIN revocation is checked when this device reconnects. Wristbands handle festival re-entry.',
        ),
        Wrap(
          spacing: 8,
          children: [
            _button(
              'Prepare / refresh offline',
              _prepare,
              icon: Icons.download,
            ),
            _button('Sync queued scans', _replay, icon: Icons.sync),
            _button('Export offline records', _export, icon: Icons.save_alt),
          ],
        ),
        ...scanner.pending
            .where((r) => r['keyRotationBlocked'] == true)
            .map(
              (r) => Card(
                child: ListTile(
                  title: Text(
                    '${r['holderName'] ?? r['name'] ?? r['ticketId']}',
                  ),
                  subtitle: Text(
                    'Held for organizer review · ${r['reviewReason']}. Export these records for your event manager.',
                  ),
                ),
              ),
            ),
        ...scanner.conflicts.map(
          (r) => Card(
            child: ListTile(
              title: Text(
                '${r['name'] ?? r['ticketId']} · ${r['result']['result']}',
              ),
              subtitle: Text(
                r['reviewed'] == true
                    ? 'Reviewed: ${r['note']}'
                    : 'Offline conflict · Needs review',
              ),
              trailing: r['reviewed'] == true
                  ? null
                  : TextButton(
                      onPressed: _busy ? null : () => _review(r),
                      child: const Text('Review'),
                    ),
            ),
          ),
        ),
        if (_history.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text('Recent scans', style: TextStyle(fontSize: 20)),
          ),
        ..._history.map(
          (r) => ListTile(
            leading: Icon(
              r['result'] == 'accepted'
                  ? Icons.check_circle
                  : Icons.warning_amber,
            ),
            title: Text('${r['result']}'.toUpperCase()),
            subtitle: Text(
              [
                r['holderName'],
                r['name'],
                r['detail'],
                if (r['offline'] == true) 'Queued offline',
              ].whereType<String>().join(' · '),
            ),
          ),
        ),
      ],
    );
  }

  Widget _guestView() {
    final matches = _guests
        .where(
          (g) =>
              '${g['name']} ${g['note']}'.toLowerCase().contains(
                _guestSearch.toLowerCase(),
              ) &&
              (_guestFilter == 'all' ||
                  (_guestFilter == 'arrived') == (g['arrived'] != null)),
        )
        .toList();
    final arrived = _guests.where((g) => g['arrived'] != null).length;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          '${_guests.length} guests · $arrived arrived · ${_guests.length - arrived} waiting',
        ),
        if (_scanner!.offline)
          const Text(
            'Prepared guest list · Offline arrivals await confirmation. Use one offline lane.',
          ),
        const SizedBox(height: 12),
        TextField(
          onChanged: (value) => setState(() => _guestSearch = value),
          decoration: const InputDecoration(
            labelText: 'Search guest name or door note',
          ),
        ),
        DropdownButton<String>(
          value: _guestFilter,
          isExpanded: true,
          items: const [
            DropdownMenuItem(value: 'all', child: Text('Everyone')),
            DropdownMenuItem(value: 'waiting', child: Text('Waiting')),
            DropdownMenuItem(value: 'arrived', child: Text('Arrived')),
          ],
          onChanged: (value) => setState(() => _guestFilter = value!),
        ),
        _button(
          'Refresh guest list',
          () => _run(_loadGuests),
          icon: Icons.refresh,
        ),
        if (matches.isEmpty)
          const Padding(
            padding: EdgeInsets.all(20),
            child: Text('No matching guests.'),
          ),
        ...matches.map(
          (g) => Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '${g['name']}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if ((g['note'] as String? ?? '').isNotEmpty)
                    Text('${g['note']}'),
                  Text(
                    g['arrived'] == null
                        ? 'Waiting for arrival'
                        : 'Arrived ${_date(g['arrived']['at'])}${g['arrived']['pending'] == true ? ' · Awaiting sync' : ''}',
                  ),
                  FilledButton(
                    onPressed:
                        _busy ||
                            g['arrived'] != null ||
                            g['reviewPending'] == true
                        ? null
                        : () => _run(() async {
                            _showResult(
                              await _scanner!.arriveGuest(g['id'] as String),
                            );
                            await _loadGuests();
                          }),
                    child: Text(
                      g['reviewPending'] == true
                          ? 'Organizer review required'
                          : g['arrived'] != null
                          ? 'Arrived'
                          : 'Mark arrived',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _attendanceView() {
    final data = _attendance;
    final rows = _attendees.where(
      (r) => '${r['name']} ${r['pass']} ${r['source']}'.toLowerCase().contains(
        _attendanceSearch.toLowerCase(),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Live attendance',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const Text(
          'Connect to view attendance and record exits or re-entry. Offline arrivals appear after sync. Recorded inside depends on staff recording every movement.',
        ),
        _button(
          'Refresh attendance',
          () => _run(() => _attendancePage()),
          icon: Icons.refresh,
        ),
        if (_pendingMovement != null) ...[
          const Text(
            'A door movement has not been confirmed. Retry the same action before recording another.',
          ),
          _button(
            'Retry door movement',
            () => _move(_pendingMovement!),
            icon: Icons.sync,
          ),
        ],
        if (data != null) ...[
          Text('Checked ${_date(data['checkedAt'])}'),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              for (final item in const {
                'tickets': 'Ticket arrivals',
                'rsvps': 'RSVP arrivals',
                'guests': 'Guest arrivals',
                'walkups': 'Walk-up arrivals',
                'arrivals': 'First arrivals',
                'inside': 'Recorded inside',
              }.entries)
                Chip(label: Text('${item.value}: ${data['counts'][item.key]}')),
            ],
          ),
          if (data['free'] == true) ...[
            const Text(
              'Free-event walk-up counter',
              style: TextStyle(fontSize: 20),
            ),
            Text(
              '${data['walkups']['inside']} inside · ${data['walkups']['exits']} exits · ${data['walkups']['reentries']} re-entries',
            ),
            TextField(
              controller: _quantity,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Number of people (1–500)',
              ),
            ),
            DropdownButton<String>(
              value: _walkupAction,
              isExpanded: true,
              items: const [
                DropdownMenuItem(value: 'arrive', child: Text('First arrival')),
                DropdownMenuItem(value: 'exit', child: Text('Exit')),
                DropdownMenuItem(value: 'reenter', child: Text('Re-entry')),
              ],
              onChanged: _pendingMovement != null
                  ? null
                  : (value) => setState(() => _walkupAction = value!),
            ),
            FilledButton(
              onPressed: _busy || _pendingMovement != null
                  ? null
                  : () {
                      final quantity = int.tryParse(_quantity.text) ?? 0;
                      if (quantity < 1 || quantity > 500) {
                        setState(
                          () => _message = 'Enter between 1 and 500 people.',
                        );
                        return;
                      }
                      _move({
                        'kind': 'walkup',
                        'action': _walkupAction,
                        'quantity': quantity,
                        'version': data['walkups']['version'] ?? 0,
                      });
                    },
              child: const Text('Record walk-up count'),
            ),
          ],
          TextField(
            onChanged: (value) => setState(() => _attendanceSearch = value),
            decoration: const InputDecoration(
              labelText: 'Search loaded attendees',
            ),
          ),
          ...rows.map(
            (r) => Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${r['name']}',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text(
                      '${r['source']} · ${r['pass']} · ${r['arrivedAt'] == null
                          ? 'Not arrived'
                          : r['inside'] == true
                          ? 'Inside'
                          : 'Outside'}${r['valid'] == true ? '' : ' · Pass unavailable'}',
                    ),
                    if (r['arrivedAt'] != null)
                      OutlinedButton(
                        onPressed:
                            _busy ||
                                _pendingMovement != null ||
                                r['valid'] != true && r['inside'] != true
                            ? null
                            : () => _move({
                                'kind': r['kind'],
                                'id': r['id'],
                                'action': r['inside'] == true
                                    ? 'exit'
                                    : 'reenter',
                                'version': r['version'],
                              }),
                        child: Text(
                          r['inside'] == true
                              ? 'Record exit'
                              : 'Record re-entry',
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          if (data['cursor'] != null)
            _button(
              'Load more attendees',
              () => _run(() => _attendancePage(more: true)),
            ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!nativeTicketScanningSupported)
      return Scaffold(
        appBar: AppBar(title: const Text('Ticket scanner')),
        body: const Center(
          child: Text('Use the website admission scanner in your browser.'),
        ),
      );
    final session = _scanner?.session;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ticket scanner'),
        actions: [
          if (session != null)
            TextButton(
              onPressed: _busy ? null : _logout,
              child: const Text('End session'),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_busy) const LinearProgressIndicator(),
            if (_message.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Semantics(liveRegion: true, child: Text(_message)),
              ),
            if (!_initialized && !_busy)
              _button('Retry opening scanner', _start),
            if (session != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${session['eventTitle']}',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      '${session['label']} · Session ends ${_date(session['expiresAt'])}',
                    ),
                  ],
                ),
              ),
            Expanded(
              child: session == null
                  ? _loginView()
                  : Stack(
                      children: [
                        Positioned.fill(
                          child: switch (_tab) {
                            1 => _guestView(),
                            2 => _attendanceView(),
                            _ => _scanView(),
                          },
                        ),
                        if (_feedback != null)
                          Align(
                            alignment: Alignment.topCenter,
                            child: IgnorePointer(
                              child: _feedbackCard(_feedback!),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: session == null
          ? null
          : NavigationBar(
              selectedIndex: _tab,
              onDestinationSelected: _busy
                  ? null
                  : (index) async {
                      await _stopCamera();
                      if (!mounted) return;
                      setState(() {
                        _tab = index;
                        _feedback = null;
                      });
                      if (index == 1) await _run(_loadGuests);
                      if (index == 2) await _run(() => _attendancePage());
                    },
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.qr_code_scanner),
                  label: 'Scan',
                ),
                NavigationDestination(
                  icon: Icon(Icons.people_outline),
                  label: 'Guest list',
                ),
                NavigationDestination(
                  icon: Icon(Icons.door_front_door_outlined),
                  label: 'Attendance',
                ),
              ],
            ),
    );
  }
}
