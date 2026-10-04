class PersistentTicketStore {
  PersistentTicketStore(
      {required this.load, required this.save, required this.erase});
  final Future<Map<String, String>> Function() load;
  final Future<void> Function(String, String) save;
  final Future<void> Function(String) erase;
  final Map<String, String> values = <String, String>{};
  Future<void>? _ready;
  Future<void> _writes = Future<void>.value();
  Future<void> initialize() => _ready ??= load().then(values.addAll);
  Future<void> write(String key, String value) {
    values[key] = value;
    return _writes =
        _writes.catchError((Object _) {}).then((_) => save(key, value));
  }

  Future<void> remove(String key) {
    values.remove(key);
    return _writes = _writes.catchError((Object _) {}).then((_) => erase(key));
  }
}
