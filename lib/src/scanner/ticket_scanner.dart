import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import '../../ticketing_repository.dart';
import 'scanner_state_store.dart';
import 'ticket_verifier.dart';

typedef ScannerRequest = Future<Map<String, dynamic>> Function(
  String path,
  Map<String, dynamic> body,
  String? token,
);

String scannerAttempt() {
  final random = Random.secure();
  return List.generate(
    32,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

bool scannerNetworkError(Object error) =>
    error is http.ClientException || error is TimeoutException;

/// Owns PIN authority and durable admission evidence, independently of Firebase
/// sign-in. Operations are serialized, including network calls and disk commits.
class TicketScanner {
  TicketScanner({
    required this.request,
    required this.store,
    this.connectionAvailable,
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;
  final ScannerRequest request;
  final ScannerStateStore store;
  final Future<bool> Function()? connectionAvailable;
  final DateTime Function() now;
  Map<String, dynamic> _state = {};
  Future<void> _tail = Future<void>.value();
  bool offline = false;
  Map<String, dynamic>? get session =>
      _state['session'] as Map<String, dynamic>?;
  Map<String, dynamic>? get manifest =>
      _state['manifest'] as Map<String, dynamic>?;
  List<Map<String, dynamic>> _records(String key) =>
      (_state[key] as List? ?? []).cast<Map<String, dynamic>>();
  List<Map<String, dynamic>> get pending =>
      _records('queue')
          .where((r) => r['eventId'] == session?['eventId'])
          .toList();
  List<Map<String, dynamic>> get conflicts => _records('conflicts')
      .where(
        (r) =>
            r['eventId'] == session?['eventId'] &&
            r['staffUid'] == session?['uid'],
      )
      .toList();
  int get _time =>
      now().millisecondsSinceEpoch +
      ((manifest?['deviceClockOffsetMs'] as num?)?.toInt() ?? 0);
  Map<String, dynamic> _copy() =>
      jsonDecode(jsonEncode(_state)) as Map<String, dynamic>;
  Future<T> _serial<T>(Future<T> Function() action) {
    final result = _tail.then((_) => action());
    _tail = result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  Future<void> _commit(Map<String, dynamic> next) async {
    await store.save(next);
    _state = next;
  }

  void _requireSession() {
    if (session == null || (session!['expiresAt'] as num) <= _time) {
      _state.remove('session');
      _state.remove('manifest');
      throw StateError(
        'Scanner access has expired. Enter your PIN again online.',
      );
    }
  }

  void _requirePrepared() {
    _requireSession();
    if (manifest == null ||
        manifest!['eventId'] != session!['eventId'] ||
        manifest!['staffUid'] != session!['uid'] ||
        manifest!['leaseToken'] is! String ||
        (manifest!['offlineUntil'] as num? ?? 0) <= _time ||
        (manifest!['generatedAt'] as num? ?? double.infinity) > _time) {
      throw StateError(
        'Offline admission is unavailable or expired. Connect and prepare it again.',
      );
    }
  }

  bool get prepared {
    try {
      _requirePrepared();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> _api(
    String path, [
    Map<String, dynamic> body = const {},
  ]) async {
    if (path != 'scanner/login') _requireSession();
    try {
      // Airplane mode must go straight to the prepared lane rather than wait
      // for a network timeout for every attendee. A connected interface still
      // requires a real API response and never grants admission by itself.
      if (connectionAvailable != null && !await connectionAvailable!()) {
        throw http.ClientException('No network connection.');
      }
      final result = await request(
        path,
        body,
        path == 'scanner/login' ? null : session!['token'] as String,
      );
      offline = false;
      return result;
    } on TicketingException catch (error) {
      offline = false;
      if (path != 'scanner/login' && [401, 403].contains(error.status)) {
        // Denial wins immediately, even if the local device cannot save it.
        _state = _copy()
          ..remove('session')
          ..remove('manifest');
        await store.save(_state);
      }
      rethrow;
    } catch (error) {
      if (scannerNetworkError(error)) offline = true;
      rethrow;
    }
  }

  Future<void> initialize({bool restoreSession = true}) => _serial(() async {
    _state = await store.load();
    if (!restoreSession) return;
    if (session == null) return;
    if ((session!['expiresAt'] as num) <= _time) {
      await _commit(
        _copy()
          ..remove('session')
          ..remove('manifest'),
      );
      return;
    }
    try {
      final refreshed = await _api('scanner/session');
      await _commit(_copy()..['session'] = {...session!, ...refreshed});
    } catch (error) {
      if (!scannerNetworkError(error) || !prepared) rethrow;
      // Only a network failure may restore a prepared, unexpired offline lane.
    }
  });

  Future<void> login(String rawPin) => _serial(() async {
    final pin = rawPin.replaceAll(RegExp(r'[\s-]'), '');
    if (!RegExp(r'^\d{8}$').hasMatch(pin)) {
      throw const FormatException('Enter your 8-digit scanner PIN.');
    }
    Map<String, dynamic> nextSession;
    try {
      nextSession = await _api('scanner/login', {'pin': pin});
    } catch (_) {
      // A failed explicit PIN login must never silently resume an older lane.
      _state = _copy()
        ..remove('session')
        ..remove('manifest');
      await store.save(_state);
      rethrow;
    }
    final next = _copy();
    if (session?['uid'] != nextSession['uid'] ||
        session?['eventId'] != nextSession['eventId'])
      next.remove('manifest');
    next['session'] = nextSession;
    await _commit(next);
  });

  Future<void> logout() => _serial(() async {
    try {
      if (session != null) await _api('scanner/logout');
    } catch (error) {
      if (!scannerNetworkError(error)) rethrow;
    } finally {
      await _commit(
        _copy()
          ..remove('session')
          ..remove('manifest'),
      );
    }
  });

  Map<String, dynamic>? _item(String kind, Object? id) {
    for (final item in manifest?[kind] as List? ?? []) {
      if (item['id'] == id) return item as Map<String, dynamic>;
    }
    return null;
  }

  Map<String, dynamic>? _queued(String kind, Object? id) {
    for (final record in pending) {
      if (kind == 'guests'
          ? record['kind'] == 'guest' && record['guestId'] == id
          : record['kind'] != 'guest' &&
                (record['ticketId'] == id ||
                    _item('tickets', record['ticketId'])?['rsvpTicketId'] ==
                        id)) {
        return record;
      }
    }
    // Upgrades linked to a retained RSVP must be held as well.
    if (kind == 'tickets') {
      final parent = _item('tickets', id)?['rsvpTicketId'];
      if (parent != null && parent != '') return _queued('parents', parent);
    }
    return null;
  }

  void _checkHold(String kind, Object? id) {
    final held = _queued(kind, id);
    if (held != null &&
        (held['keyRotationBlocked'] == true ||
            held['staffUid'] != session!['uid'])) {
      throw StateError(
        'This attendee has an unresolved offline admission. Export the records for an event manager to review.',
      );
    }
  }

  Map<String, dynamic>? _pendingDuplicate(String kind, Object? id) {
    _checkHold(kind, id);
    final record = _queued(kind, id);
    return record == null
        ? null
        : {
            'result': 'duplicate',
            'name': record['name'],
            'holderName': record['holderName'],
            'offline': true,
          };
  }

  Map<String, dynamic>? _claimed(String qr) {
    try {
      if (qr.length > 3000) return null;
      return jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(qr.split('.')[1]))),
      ) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  void _window(Object? from, Object? until) {
    final start = DateTime.tryParse(from as String? ?? '');
    final end = DateTime.tryParse(until as String? ?? '');
    if (start == null ||
        end == null ||
        _time < start.millisecondsSinceEpoch ||
        _time > end.millisecondsSinceEpoch) {
      throw StateError('Outside the admission window. No admission recorded.');
    }
  }

  Future<Map<String, dynamic>> scan(String rawQr) => _serial(() async {
    _requireSession();
    final qr = rawQr.trim();
    if (qr.isEmpty)
      throw const FormatException('Scan or enter a ticket QR code.');
    final claimed = _claimed(qr);
    if (claimed?['eventId'] == session!['eventId']) {
      _checkHold('tickets', claimed?['id']);
    }
    final scanId = scannerAttempt();
    Map<String, dynamic> result;
    try {
      result = await _api('staff/scan', {
        'eventId': session!['eventId'],
        'qr': qr,
        'scanId': scanId,
      });
    } catch (error) {
      if (!scannerNetworkError(error)) rethrow;
      _requirePrepared();
      final token = await TicketVerifier(manifest!).verify(qr);
      final ticket = _item('tickets', token['id']);
      if (token['eventId'] != session!['eventId'] ||
          ticket == null ||
          ticket['version'] != token['version'] ||
          ticket['status'] != 'valid' ||
          (ticket['itemProof'] as String? ?? '').isEmpty) {
        throw StateError(
          'Ticket is not valid in the prepared list. Reconnect if it is new or transferred.',
        );
      }
      _window(ticket['validFrom'], ticket['validUntil']);
      final queued = _pendingDuplicate('tickets', ticket['id']);
      if (queued != null) return queued;
      if (ticket['admitted'] == true)
        return {
          'result': 'duplicate',
          'name': ticket['name'],
          'holderName': ticket['holderName'],
        };
      final next = _copy();
      (next['queue'] ??= <dynamic>[]).add({
        'scanId': scanId,
        'eventId': session!['eventId'],
        'qr': qr,
        'ticketId': ticket['id'],
        'orderId': ticket['orderId'] ?? '',
        'holderName': ticket['holderName'],
        'name': ticket['name'],
        'deviceTime': _time,
        'leaseToken': manifest!['leaseToken'],
        'itemProof': ticket['itemProof'],
        'staffUid': session!['uid'],
      });
      _markTicket(next, ticket['id'], ticket['rsvpTicketId']);
      // A durable write must succeed before displaying an offline acceptance.
      await _commit(next);
      return {
        'result': 'accepted',
        'name': ticket['name'],
        'holderName': ticket['holderName'],
        'offline': true,
      };
    }
    if (['accepted', 'duplicate'].contains(result['result']) &&
        manifest != null) {
      final next = _copy();
      _markTicket(next, result['ticketId'], result['rsvpTicketId']);
      try {
        await _commit(next);
      } catch (_) {
        // Admission already succeeded on the server. Disable stale offline
        // preparation instead of misreporting the confirmed result as a failure.
        _state.remove('manifest');
        result = {
          ...result,
          'warning': 'Admission confirmed. Offline storage failed; prepare again before going offline.',
        };
      }
    }
    return result;
  });
  void _markTicket(Map<String, dynamic> state, Object? id, Object? parent) {
    for (final ticket in state['manifest']?['tickets'] as List? ?? []) {
      if (ticket['id'] == id || ticket['id'] == parent)
        ticket['admitted'] = true;
    }
  }

  Future<List<Map<String, dynamic>>> guests() => _serial(() async {
    _requireSession();
    List<Map<String, dynamic>> guests;
    try {
      final data = await _api('staff/guestlist', {
        'eventId': session!['eventId'],
      });
      guests = (data['guests'] as List).cast<Map<String, dynamic>>();
      if (manifest != null) {
        final next = _copy();
        next['manifest']['guests'] = [
          for (final prepared in manifest!['guests'] as List? ?? [])
            for (final latest in guests)
              if (latest['id'] == prepared['id'] &&
                  latest['version'] == prepared['version'])
                {...latest, 'itemProof': prepared['itemProof']},
        ];
        await _commit(next);
      }
    } catch (error) {
      if (!scannerNetworkError(error)) rethrow;
      _requirePrepared();
      guests = (manifest!['guests'] as List? ?? [])
          .cast<Map<String, dynamic>>();
    }
    return guests.map((guest) {
      final queued = _queued('guests', guest['id']);
      return {
        ...guest,
        if (queued != null)
          'arrived': {
            'at': queued['deviceTime'],
            'pending': true,
            'label': session!['label'],
          },
        'reviewPending':
            queued?['keyRotationBlocked'] == true ||
            queued != null && queued['staffUid'] != session!['uid'],
      };
    }).toList();
  });

  Future<Map<String, dynamic>> arriveGuest(String id) => _serial(() async {
    _requireSession();
    final duplicate = _pendingDuplicate('guests', id);
    if (duplicate != null) return duplicate;
    final scanId = scannerAttempt();
    try {
      final result = await _api('staff/guestlist/arrive', {
        'eventId': session!['eventId'],
        'guestId': id,
        'scanId': scanId,
      });
      if (manifest != null &&
          ['accepted', 'duplicate'].contains(result['result'])) {
        final next = _copy();
        for (final guest in next['manifest']['guests'] as List? ?? []) {
          if (guest['id'] == id)
            guest['arrived'] = {'at': _time, 'label': session!['label']};
        }
        try {
          await _commit(next);
        } catch (_) {
          _state.remove('manifest');
        }
      }
      return result;
    } catch (error) {
      if (!scannerNetworkError(error)) rethrow;
      _requirePrepared();
      final guest = _item('guests', id);
      if (guest == null || (guest['itemProof'] as String? ?? '').isEmpty) {
        throw StateError(
          'This guest is missing from the prepared list. Prepare again online.',
        );
      }
      _window(manifest!['guestValidFrom'], manifest!['guestValidUntil']);
      if (guest['arrived'] != null)
        return {'result': 'duplicate', 'name': guest['name']};
      final next = _copy();
      (next['queue'] ??= <dynamic>[]).add({
        'kind': 'guest',
        'scanId': scanId,
        'eventId': session!['eventId'],
        'guestId': id,
        'guestVersion': guest['version'],
        'ticketId': 'guest_$id',
        'name': guest['name'],
        'deviceTime': _time,
        'leaseToken': manifest!['leaseToken'],
        'itemProof': guest['itemProof'],
        'staffUid': session!['uid'],
      });
      for (final entry in next['manifest']['guests'] as List) {
        if (entry['id'] == id)
          entry['arrived'] = {
            'at': _time,
            'label': session!['label'],
            'pending': true,
          };
      }
      await _commit(next);
      return {'result': 'accepted', 'name': guest['name'], 'offline': true};
    }
  });

  Future<Map<String, int>> _replay({bool holdUnavailable = false}) async {
    _requireSession();
    var accepted = 0, conflicts = 0, held = 0;
    for (final item in pending) {
      Map<String, dynamic> result;
      try {
        if (item['staffUid'] != session!['uid']) {
          if (!holdUnavailable)
            throw StateError(
              'Use the original scanner PIN to sync these admissions.',
            );
          throw const TicketingException(
            409,
            'Scanner access changed; organizer review required.',
            code: 'offline-key-unavailable',
          );
        }
        result = await _api(
          item['kind'] == 'guest' ? 'staff/guestlist/arrive' : 'staff/scan',
          {...item, 'offline': true},
        );
      } catch (error) {
        if (!holdUnavailable ||
            error is! TicketingException ||
            error.status != 409 ||
            ![
              'ticket-key-unavailable',
              'offline-key-unavailable',
            ].contains(error.code))
          rethrow;
        final next = _copy();
        for (final row in next['queue'] as List) {
          if (row['scanId'] == item['scanId']) {
            row['keyRotationBlocked'] = true;
            row['reviewReason'] = error.message;
          }
        }
        await _commit(next);
        held++;
        continue;
      }
      final next = _copy();
      if (result['result'] != 'accepted') {
        (next['conflicts'] ??= <dynamic>[]).add({
          ...item,
          'result': result,
          'reviewed': false,
        });
        conflicts++;
      } else {
        accepted++;
      }
      (next['queue'] as List).removeWhere(
        (dynamic r) => r['scanId'] == item['scanId'],
      );
      await _commit(next);
    }
    return {'accepted': accepted, 'conflicts': conflicts, 'held': held};
  }

  Future<Map<String, int>> replay() => _serial(() => _replay());
  Future<Map<String, int>> prepare() => _serial(() async {
    // Reconcile the old lease before replacing it. Retain key-rotation failures
    // with their original evidence and conservatively hold those attendees.
    final summary = await _replay(holdUnavailable: true);
    final latest = await _api('staff/manifest', {
      'eventId': session!['eventId'],
    });
    TicketVerifier(
      latest,
    ); // Validate the keyring before committing preparation.
    latest['deviceClockOffsetMs'] =
        (latest['generatedAt'] as num).toInt() - now().millisecondsSinceEpoch;
    await _commit(_copy()..['manifest'] = latest);
    return summary;
  });

  Future<void> review(String scanId, String note) => _serial(() async {
    if (note.trim().isEmpty || note.trim().length > 500) {
      throw const FormatException('Add a review note of up to 500 characters.');
    }
    await _api('staff/scan-review', {
      'eventId': session!['eventId'],
      'scanId': scanId,
      'note': note.trim(),
    });
    final next = _copy();
    for (final record in next['conflicts'] as List? ?? []) {
      if (record['scanId'] == scanId && record['staffUid'] == session!['uid']) {
        record['reviewed'] = true;
        record['note'] = note.trim();
      }
    }
    await _commit(next);
  });
  Future<Map<String, dynamic>> attendance({Map<String, dynamic>? cursor}) =>
      _serial(
        () => _api('staff/attendance', {
          'eventId': session!['eventId'],
          if (cursor != null) 'cursor': cursor,
        }),
      );
  Future<void> movement(Map<String, dynamic> body) => _serial(() async {
    await _api('staff/attendance/move', {
      'eventId': session!['eventId'],
      ...body,
    });
  });
  String exportRecords() {
    _requireSession();
    final records = [
      ..._records('queue'),
      ..._records('conflicts'),
    ].where((r) => r['eventId'] == session!['eventId']).toList();
    if (records.isEmpty)
      throw StateError('There are no retained offline scans for this event.');
    return const JsonEncoder.withIndent('  ').convert({
      'version': 1,
      'eventId': session!['eventId'],
      'exportedAt': now().toUtc().toIso8601String(),
      'records': records,
    });
  }
}
