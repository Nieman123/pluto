import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../ticketing_repository.dart';

class OfflineTicketCache {
  OfflineTicketCache(
      {required this.read,
      required this.write,
      required this.remove,
      required this.keys,
      DateTime Function()? now})
      : now = now ?? DateTime.now;
  final String? Function(String) read;
  final Future<void> Function(String, String) write;
  final Future<void> Function(String) remove;
  final List<String> Function() keys;
  final DateTime Function() now;
  String prefix(String scope) => 'pluto-ticket-cache-v1:$scope:';
  Future<void> clear(String scope) async {
    for (final key in keys().where((key) => key.startsWith(prefix(scope)))) {
      await remove(key);
    }
  }

  Future<void> _invalidate(
      String path, Map<String, dynamic> body, String scope, String key) async {
    if (path == 'mine') return clear(scope);
    String? orderId = body['orderId'] as String?;
    String? ticketId;
    try {
      final stored = jsonDecode(read(key)!) as Map;
      orderId ??= stored['data']['orderId'] as String?;
      ticketId = stored['data']['id'] as String?;
    } catch (_) {/* A new/unknown link has no previous admission snapshot. */}
    for (final other in keys().where((k) => k.startsWith(prefix(scope)))) {
      try {
        if (other == key) {
          await remove(other);
          continue;
        }
        final stored = jsonDecode(read(other)!) as Map<String, dynamic>;
        final payload = stored['data'] as Map<String, dynamic>;
        bool affected(Map item) =>
            orderId != null && item['orderId'] == orderId ||
            ticketId != null && item['id'] == ticketId;
        if (affected(payload)) {
          await remove(other);
          continue;
        }
        bool changed = false;
        for (final list in ['tickets', 'orders']) {
          if (payload[list] is List) {
            final previous = payload[list] as List;
            final retained = [
              for (final item in previous)
                if (!affected(item as Map)) item
            ];
            if (retained.length != previous.length) {
              changed = true;
              payload[list] = retained;
            }
          }
        }
        if (changed) await write(other, jsonEncode(stored));
      } catch (_) {
        await remove(other);
      }
    }
  }

  Future<Map<String, dynamic>> request(
      String path,
      Map<String, dynamic> body,
      String scope,
      Future<Map<String, dynamic>> Function(String, Map<String, dynamic>)
          fetch) async {
    final key =
        '${prefix(scope)}$path:${body['orderId'] ?? body['token'] ?? ''}';
    try {
      final data = await fetch(path, body);
      // The account list is complete: tickets absent after a transfer must not
      // survive in an older order/holder snapshot under the same account.
      if (path == 'mine') await clear(scope);
      // A successful response replaces admission state, including revoked QRs.
      final latest = <String, dynamic>{
        for (final t in data['tickets'] as List? ?? []) t['id'] as String: t
      };
      if (data['id'] is String) latest[data['id'] as String] = data;
      for (final other in keys().where((k) => k.startsWith(prefix(scope)))) {
        if (other == key) continue;
        try {
          final stored = jsonDecode(read(other)!) as Map<String, dynamic>;
          final payload = stored['data'] as Map<String, dynamic>;
          final before = jsonEncode(payload);
          if (payload['id'] != null && latest.containsKey(payload['id']))
            stored['data'] = latest[payload['id']];
          if (payload['tickets'] is List)
            payload['tickets'] = [
              for (final t in payload['tickets'] as List)
                if (latest[t['id']] == null)
                  t
                else
                  {...t as Map, ...latest[t['id']] as Map}
            ];
          if (jsonEncode(stored['data']) != before)
            await write(other, jsonEncode(stored));
        } catch (_) {
          await remove(other);
        }
      }
      try {
        await write(
            key,
            jsonEncode(
                {'savedAt': now().millisecondsSinceEpoch, 'data': data}));
      } catch (_) {
        return {
          ...data,
          'warnings': [
            ...data['warnings'] as List? ?? [],
            'Offline ticket storage is unavailable on this device.'
          ]
        };
      }
      final saved = keys().where((k) => k.startsWith(prefix(scope))).toList();
      for (final old
          in saved.take((saved.length - 60).clamp(0, saved.length))) {
        await remove(old);
      }
      return data;
    } on TicketingException {
      // An HTTP response is authoritative. Never mask access revocation, payment
      // review or another server error with the affected order's old QR. Other
      // purchases remain available; a mine/auth rejection clears the account.
      await _invalidate(path, body, scope, key);
      rethrow;
    } catch (error) {
      if (error is FirebaseAuthException &&
          error.code != 'network-request-failed') {
        await clear(scope);
        rethrow;
      }
      if (error is! http.ClientException &&
          error is! TimeoutException &&
          !(error is FirebaseAuthException &&
              error.code == 'network-request-failed')) rethrow;
      final saved = read(key);
      if (saved == null) rethrow;
      try {
        final snapshot = jsonDecode(saved) as Map<String, dynamic>;
        final savedAt = snapshot['savedAt'] as int;
        if (now().millisecondsSinceEpoch - savedAt >
            const Duration(days: 7).inMilliseconds) {
          await remove(key);
          rethrow;
        }
        final data = Map<String, dynamic>.from(snapshot['data'] as Map);
        Map<String, dynamic> ticket(Map raw) {
          final result = Map<String, dynamic>.from(raw);
          final expiry =
              DateTime.tryParse(result['validUntil'] as String? ?? '');
          if (expiry == null ||
              !expiry.isAfter(now()) ||
              result['status'] != 'valid' ||
              result['admission'] != null) {
            result['qr'] = null;
            result['venue'] = null;
          }
          result['transferable'] = false;
          return result;
        }

        if (data['id'] != null) data.addAll(ticket(data));
        if (data['tickets'] is List)
          data['tickets'] = [
            for (final t in data['tickets'] as List) ticket(t as Map)
          ];
        return {...data, 'offline': true, 'savedAt': savedAt};
      } catch (_) {
        rethrow;
      }
    }
  }
}
