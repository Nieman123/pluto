import 'package:web/web.dart' as web;

String? ticketAccessRead(String key) => web.window.localStorage.getItem(key);
void ticketAccessWrite(String key, String value) =>
    web.window.localStorage.setItem(key, value);
void ticketAccessRemove(String key) => web.window.localStorage.removeItem(key);
List<String> ticketAccessKeys() => <String>[
      for (int i = 0; i < web.window.localStorage.length; i++)
        if (web.window.localStorage.key(i) != null)
          web.window.localStorage.key(i)!
    ];
