abstract class ScannerStateStore {
  Future<Map<String, dynamic>> load();
  Future<void> save(Map<String, dynamic> state);
}
