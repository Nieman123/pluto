import 'dart:convert';
import 'dart:math';
import 'package:firebase_core/firebase_core.dart';
import 'src/ticket_access_store.dart';
import 'ticketing_repository.dart';

class RewardsRepository {
  RewardsRepository({TicketingRepository? api})
      : _api = api ?? TicketingRepository();
  final TicketingRepository _api;
  static final Map<String, String> _pending = <String, String>{};

  Future<Map<String, dynamic>> redeem(String uid, String rewardId) => _request(
      uid, 'redeem', rewardId, <String, dynamic>{'rewardItemId': rewardId});
  Future<Map<String, dynamic>> claim(String uid, String scannedCode) {
    final String normalized = scannedCode.trim().toUpperCase();
    return _request(
        uid, 'claim', normalized, <String, dynamic>{'code': normalized});
  }

  Future<Map<String, dynamic>> _request(String uid, String action,
      String resource, Map<String, dynamic> body) async {
    final String storageKey =
        'pluto-reward-${base64UrlEncode(utf8.encode('$uid/$action/$resource'))}';
    String? saved;
    try {
      saved = ticketAccessRead(storageKey);
    } catch (_) {/* Storage can be restricted. */}
    final String key =
        saved != null && RegExp(r'^[a-f0-9]{64}$').hasMatch(saved)
            ? saved
            : _pending[storageKey] ?? _newKey();
    _pending[storageKey] = key;
    try {
      ticketAccessWrite(storageKey, key);
    } catch (_) {/* Retain in memory. */}
    try {
      final Map<String, dynamic> result = await _api.request('rewards/$action',
          <String, dynamic>{...body, 'uid': uid, 'attempt': key});
      _clear(storageKey, key);
      return result;
    } on TicketingException catch (error) {
      // A server rejection is definite. Network/5xx failures retain the key so a
      // committed debit or award is retrieved, never applied again on retry.
      if (error.status >= 400 &&
          error.status < 500 &&
          !<int>[401, 403, 429].contains(error.status)) _clear(storageKey, key);
      throw FirebaseException(
          plugin: 'pluto_rewards',
          code: error.code.isEmpty ? 'unavailable' : error.code,
          message: error.message);
    }
  }

  static void _clear(String key, String attempt) {
    if (_pending[key] != attempt) return;
    _pending.remove(key);
    try {
      if (ticketAccessRead(key) == attempt) ticketAccessRemove(key);
    } catch (_) {/* Storage can be restricted. */}
  }

  static String _newKey() {
    final Random random = Random.secure();
    return List<String>.generate(
            32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'))
        .join();
  }
}
