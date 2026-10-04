import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'persistent_ticket_store.dart';

const _secure = FlutterSecureStorage(
    iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device));
final _store = PersistentTicketStore(
    load: _secure.readAll,
    save: (key, value) => _secure.write(key: key, value: value),
    erase: (key) => _secure.delete(key: key));
Future<void> ticketAccessInitialize() => _store.initialize();
String? ticketAccessRead(String key) => _store.values[key];
Future<void> ticketAccessWrite(String key, String value) =>
    _store.write(key, value);
Future<void> ticketAccessRemove(String key) => _store.remove(key);
List<String> ticketAccessKeys() => _store.values.keys.toList();
