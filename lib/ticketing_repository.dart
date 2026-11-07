import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import 'src/native_environment.dart';
import 'src/ticket_client_identity.dart';

class TicketingException implements Exception {
  const TicketingException(this.status, this.message, {this.code = ''});
  final int status;
  final String message;
  final String code;
  @override
  String toString() => message;
}

class TicketingRepository {
  TicketingRepository({
    http.Client? client,
    Uri? baseUri,
    Future<String?> Function()? tokenProvider,
  }) : _client = client ?? http.Client(),
       _baseUri = baseUri ?? ticketingBaseUri(),
       _tokenProvider =
           tokenProvider ??
           (() async => FirebaseAuth.instance.currentUser?.getIdToken());
  final http.Client _client;
  final Uri _baseUri;
  final Future<String?> Function() _tokenProvider;

  Future<Map<String, dynamic>> request(
    String path, [
    Map<String, dynamic> body = const <String, dynamic>{},
  ]) async {
    final String? token = await _tokenProvider();
    return _send(path, body, token: token);
  }

  /// PIN access never uses or changes the signed-in Firebase account.
  Future<Map<String, dynamic>> scannerRequest(
    String path,
    Map<String, dynamic> body, {
    String? scannerToken,
  }) {
    const allowed = {
      'scanner/login',
      'scanner/session',
      'scanner/logout',
      'staff/scan',
      'staff/manifest',
      'staff/scan-review',
      'staff/guestlist',
      'staff/guestlist/arrive',
      'staff/attendance',
      'staff/attendance/move',
    };
    if (!allowed.contains(path) ||
        (path != 'scanner/login' &&
            (scannerToken == null || scannerToken.isEmpty))) {
      throw StateError('Enter your scanner PIN to continue.');
    }
    return _send(path, body, scannerToken: scannerToken);
  }

  Future<Map<String, dynamic>> _send(
    String path,
    Map<String, dynamic> body, {
    String? token,
    String? scannerToken,
  }) async {
    final http.Response response = await _client
        .post(
          _baseUri.resolve('/tickets/api/$path'),
          headers: <String, String>{
            'Content-Type': 'application/json',
            'X-Pluto-Client': ticketClientIdentity(),
            if (scannerToken != null) 'X-Pluto-Scanner': scannerToken,
            if (token != null) 'Authorization': 'Bearer $token',
          },
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 45));
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw TicketingException(
        response.statusCode,
        'The ticket service could not confirm this request. Please retry.',
      );
    }
    if (response.statusCode != 200)
      throw TicketingException(
        response.statusCode,
        decoded is Map
            ? decoded['error'] ?? 'Ticket request failed. Please retry.'
            : 'Ticket request failed.',
        code: decoded is Map ? decoded['code'] as String? ?? '' : '',
      );
    return Map<String, dynamic>.from(decoded as Map);
  }

  void dispose() => _client.close();
}
