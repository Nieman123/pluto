final Map<String, String> _access = <String, String>{};
String? ticketAccessRead(String key) => _access[key];
void ticketAccessWrite(String key, String value) => _access[key] = value;
void ticketAccessRemove(String key) => _access.remove(key);
List<String> ticketAccessKeys() => _access.keys.toList();
