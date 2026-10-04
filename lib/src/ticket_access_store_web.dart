import 'package:web/web.dart' as web;

Future<void> ticketAccessInitialize() async {}

String? ticketAccessRead(String key) => web.window.localStorage.getItem(key);
Future<void> ticketAccessWrite(String key, String value) async =>
    web.window.localStorage.setItem(key, value);
Future<void> ticketAccessRemove(String key) async =>
    web.window.localStorage.removeItem(key);
List<String> ticketAccessKeys() => <String>[
      for (int i = 0; i < web.window.localStorage.length; i++)
        if (web.window.localStorage.key(i) != null)
          web.window.localStorage.key(i)!
    ];
