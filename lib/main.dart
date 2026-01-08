import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app.dart';
import 'camping.dart';
import 'firebase_options.dart';
import 'links.dart';
//import 'schedule.dart';
import 'schedule.dart';
import 'src/configure_web.dart';
import 'src/json_service.dart';
import 'src/theme/config.dart';
import 'src/theme/custom_theme.dart';

Future<void> main() async {
  // ignore: unused_local_variable
  final currentToken;
  //setUrlStrategy(PathUrlStrategy());
  WidgetsFlutterBinding.ensureInitialized();
  configureApp();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
  if (await FirebaseMessaging.instance.isSupported()) {
    currentToken = await FirebaseMessaging.instance.getToken(
        vapidKey:
            'BBwgiNd7-lSc0iqFjrIprkGQDgiV8Z67WprIVKqc3-hVFpanH9xOAnrHQKZ45h4JaMIp9nljQONhdqzBvpuJINE');
  }
}

class MyApp extends StatefulWidget {
  const MyApp({Key? key}) : super(key: key);
  @override
  _MyAppState createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  late final GoRouter _router;

  @override
  void initState() {
    getPermission();
    messageListener(context);
    super.initState();
    currentTheme.addListener(() {
      setState(() {});
    });
    jsonService.init();
    jsonService.addListener(() {
      setState(() {});
    });

    _router = GoRouter(routes: [
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState state) => const App(),
      ),
      GoRoute(
        path: '/links',
        builder: (BuildContext context, GoRouterState state) {
          return const LinksPage();
        },
      ),
      GoRoute(
        path: '/camping',
        builder: (BuildContext context, GoRouterState state) {
          return const CampingInfoPage();
        },
      ),
      GoRoute(
        path: '/schedule',
        builder: (BuildContext context, GoRouterState state) {
          return const SchedulePage();
        },
      ),
    ], debugLogDiagnostics: true);
  }

  Future<void> getPermission() async {
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );

    print('User granted permission: ${settings.authorizationStatus}');
  }

  void messageListener(BuildContext context) {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      //print('Got a message whilst in the foreground!');
      //print('Message data: ${message.data}');

      if (message.notification != null) {
        //print(
        //    'Message also contained a notification: ${message.notification!.body}');
        showDialog(
            context: context,
            builder: (BuildContext context) {
              return DynamicDialog(
                  title: message.notification!.title,
                  body: message.notification!.body);
            });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      routerDelegate: _router.routerDelegate,
      routeInformationParser: _router.routeInformationParser,
      routeInformationProvider: _router.routeInformationProvider,
      theme: CustomTheme.darkTheme,
      darkTheme: CustomTheme.darkTheme,
      themeMode: currentTheme.currentTheme,
    );
  }
}

//push notification dialog for foreground
class DynamicDialog extends StatefulWidget {
  final title;
  final body;
  DynamicDialog({this.title, this.body});
  @override
  _DynamicDialogState createState() => _DynamicDialogState();
}

class _DynamicDialogState extends State<DynamicDialog> {
  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title.toString()),
      actions: <Widget>[
        OutlinedButton.icon(
            label: const Text('Close'),
            onPressed: () {
              Navigator.pop(context);
            },
            icon: const Icon(Icons.close))
      ],
      content: Text(widget.body.toString()),
    );
  }
}
