import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'admin_page.dart';
import 'app.dart';
import 'camping.dart';
import 'event_qr_scan_page.dart';
import 'firebase_options.dart';
import 'item_shop_page.dart';
import 'links.dart';
import 'profile_page.dart';
import 'schedule.dart';
import 'sign_on_page.dart';
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
    messageListener();
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
      GoRoute(
        path: '/sign-on',
        builder: (BuildContext context, GoRouterState state) {
          return const SignOnPage();
        },
      ),
      GoRoute(
        path: '/admin',
        builder: (BuildContext context, GoRouterState state) {
          return const AdminPage();
        },
      ),
      GoRoute(
        path: '/profile',
        builder: (BuildContext context, GoRouterState state) {
          return const ProfilePage();
        },
      ),
      GoRoute(
        path: '/scan-qr',
        builder: (BuildContext context, GoRouterState state) {
          return const EventQrScanPage();
        },
      ),
      GoRoute(
        path: '/shop',
        builder: (BuildContext context, GoRouterState state) {
          return const ItemShopPage();
        },
      ),
    ], debugLogDiagnostics: true);
  }

  Future<void> getPermission() async {
    final FirebaseMessaging messaging = FirebaseMessaging.instance;

    final NotificationSettings settings = await messaging.requestPermission();

    debugPrint('User granted permission: ${settings.authorizationStatus}');
  }

  void messageListener() {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      //print('Got a message whilst in the foreground!');
      //print('Message data: ${message.data}');

      if (message.notification != null) {
        if (!mounted) {
          return;
        }
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
  const DynamicDialog({super.key, this.title, this.body});
  final title;
  final body;
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
