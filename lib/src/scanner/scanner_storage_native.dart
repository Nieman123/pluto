import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:path_provider/path_provider.dart';

import '../native_environment.dart';
import '../ticket_access_store.dart';
import 'scanner_state_store.dart';

ScannerStateStore createScannerStore() => NativeScannerStore(
  scope: ticketingBaseUri().host,
  directory: getApplicationSupportDirectory,
  readKey: ticketAccessRead,
  writeKey: ticketAccessWrite,
);

/// Large manifests live in an authenticated encrypted file; only its key lives
/// in the device keychain. One atomic replacement commits the queue and snapshot.
class NativeScannerStore implements ScannerStateStore {
  NativeScannerStore({
    required this.scope,
    required this.directory,
    required this.readKey,
    required this.writeKey,
  });
  final String scope;
  final Future<Directory> Function() directory;
  final String? Function(String) readKey;
  final Future<void> Function(String, String) writeKey;
  late final _cipher = AesGcm.with256bits();
  late File _file;
  SecretKey? _key;

  Future<void> _initialize() async {
    if (_key != null) return;
    await ticketAccessInitialize();
    final root = await directory();
    await root.create(recursive: true);
    final file = File('${root.path}/pluto-scanner-$scope.bin');
    final keyName = 'pluto-scanner-key:$scope';
    final encoded = readKey(keyName);
    if (encoded == null && file.existsSync()) {
      throw StateError(
        'Scanner storage is locked. Restore device keychain access before using this scanner.',
      );
    }
    final key = encoded == null
        ? await _cipher.newSecretKey()
        : SecretKey(base64Decode(encoded));
    if (encoded == null) {
      await writeKey(keyName, base64Encode(await key.extractBytes()));
    }
    _file = file;
    _key = key;
  }

  @override
  Future<Map<String, dynamic>> load() async {
    await _initialize();
    if (!_file.existsSync()) return {};
    final box = SecretBox.fromConcatenation(
      await _file.readAsBytes(),
      nonceLength: 12,
      macLength: 16,
    );
    final bytes = await _cipher.decrypt(box, secretKey: _key!);
    return Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map);
  }

  @override
  Future<void> save(Map<String, dynamic> state) async {
    await _initialize();
    final box = await _cipher.encrypt(
      utf8.encode(jsonEncode(state)),
      secretKey: _key!,
    );
    final temporary = File('${_file.path}.pending');
    await temporary.writeAsBytes(box.concatenation(), flush: true);
    await temporary.rename(_file.path);
  }
}
