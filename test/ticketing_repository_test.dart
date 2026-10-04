import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pluto/ticketing_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});
  test('ticket requests use the same-origin API and attach Firebase proof',
      () async {
    final TicketingRepository repository = TicketingRepository(
        baseUri: Uri.parse('http://localhost:4173'),
        tokenProvider: () async => 'verified-token',
        client: MockClient((http.Request request) async {
          expect(request.url.toString(),
              'http://localhost:4173/tickets/api/order');
          expect(request.headers['Authorization'], 'Bearer verified-token');
          expect(request.headers['X-Pluto-Client'],
              matches(RegExp(r'^[a-f0-9]{64}$')));
          expect(jsonDecode(request.body),
              <String, dynamic>{'orderId': 'order', 'accessKey': 'proof'});
          return http.Response('{"status":"paid","tickets":[]}', 200);
        }));
    expect(
        (await repository.request('order', <String, dynamic>{
          'orderId': 'order',
          'accessKey': 'proof'
        }))['status'],
        'paid');
    repository.dispose();
  });
  test(
      'guest requests carry an order-scoped proof and surface server rejection',
      () async {
    final TicketingRepository repository = TicketingRepository(
        baseUri: Uri.parse('https://pluto.events'),
        tokenProvider: () async => null,
        client: MockClient((http.Request request) async {
          expect(request.headers.containsKey('Authorization'), false);
          return http.Response('{"error":"Use your secure order link."}', 403);
        }));
    await expectLater(
        repository.request('order'),
        throwsA(predicate(
            (Object error) => error.toString().contains('secure order link'))));
    repository.dispose();
  });
}
