import 'dart:convert';

import 'package:cryptography/cryptography.dart';

/// Matches the website's PLUTO1/PLUTO2 verification and key rotation rules.
class TicketVerifier {
  TicketVerifier(Map<String, dynamic> manifest) {
    final ring = manifest['verificationKeys'];
    if (ring is Map) {
      legacyKeyId = manifest['legacyKeyId'] as String?;
      if (ring.isEmpty ||
          ring.length > 16 ||
          legacyKeyId != null && !_validId(legacyKeyId)) {
        throw const FormatException(
          'Invalid scanner verification keys. Prepare again online.',
        );
      }
      for (final entry in ring.entries) {
        _addKey(entry.key as String, entry.value as Map);
      }
    } else {
      legacyKeyId = 'legacy';
      _addKey('legacy', manifest['verificationKey'] as Map);
    }
  }
  final _keys = <String, SimplePublicKey>{};
  String? legacyKeyId;
  static bool _validId(Object? id) =>
      id is String && RegExp(r'^[A-Za-z0-9_-]{1,64}$').hasMatch(id);
  void _addKey(String id, Map jwk) {
    if (!_validId(id) ||
        jwk['kty'] != 'OKP' ||
        jwk['crv'] != 'Ed25519' ||
        jwk.containsKey('d') ||
        jwk['kid'] != null && jwk['kid'] != id) {
      throw const FormatException('Invalid scanner verification key.');
    }
    final bytes = base64Url.decode(base64Url.normalize(jwk['x'] as String));
    if (bytes.length != 32)
      throw const FormatException('Invalid scanner verification key.');
    _keys[id] = SimplePublicKey(bytes, type: KeyPairType.ed25519);
  }

  Future<Map<String, dynamic>> verify(String qr) async {
    const invalid = FormatException('Invalid ticket signature.');
    final parts = qr.split('.');
    if (qr.length > 3000 ||
        parts.length != 3 ||
        !['PLUTO1', 'PLUTO2'].contains(parts[0]) ||
        !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(parts[1]) ||
        !RegExp(r'^[A-Za-z0-9_-]{86}$').hasMatch(parts[2]))
      throw invalid;
    Map<String, dynamic> token;
    try {
      token = Map<String, dynamic>.from(
        jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))))
            as Map,
      );
    } catch (_) {
      throw invalid;
    }
    final legacy = parts[0] == 'PLUTO1';
    if (legacy ? token.containsKey('kid') : !_validId(token['kid']))
      throw invalid;
    final key = _keys[legacy ? legacyKeyId : token['kid']];
    if (key == null) {
      throw const FormatException(
        'This ticket uses an unavailable verification key. Reconnect and prepare the scanner again.',
      );
    }
    final valid = await Ed25519().verify(
      utf8.encode(legacy ? parts[1] : '${parts[0]}.${parts[1]}'),
      signature: Signature(
        base64Url.decode(base64Url.normalize(parts[2])),
        publicKey: key,
      ),
    );
    if (!valid) throw invalid;
    if (token['id'] is! String ||
        token['eventId'] is! String ||
        token['version'] is! int ||
        token.containsKey('leaseHash') ||
        token.containsKey('kind'))
      throw invalid;
    return token;
  }
}
