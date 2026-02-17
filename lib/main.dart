import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
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
import 'src/theme/config.dart';
import 'src/theme/custom_theme.dart';

Future<void> main() async {
  //setUrlStrategy(PathUrlStrategy());
  WidgetsFlutterBinding.ensureInitialized();
  configureApp();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({Key? key}) : super(key: key);
  @override
  _MyAppState createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  static const String _webVapidKey =
      'BBwgiNd7-lSc0iqFjrIprkGQDgiV8Z67WprIVKqc3-hVFpanH9xOAnrHQKZ45h4JaMIp9nljQONhdqzBvpuJINE';

  late final GoRouter _router;
  bool _notificationsSupported = false;
  bool _isCheckingNotificationSupport = true;
  bool _isRequestingNotificationPermission = false;
  bool _notificationPromptDismissed = false;
  NotificationSettings? _notificationSettings;

  bool get _hasNotificationPermission {
    final AuthorizationStatus? status =
        _notificationSettings?.authorizationStatus;
    return status == AuthorizationStatus.authorized ||
        status == AuthorizationStatus.provisional;
  }

  bool get _shouldShowNotificationPrompt {
    return !_isCheckingNotificationSupport &&
        _notificationsSupported &&
        !_hasNotificationPermission &&
        !_notificationPromptDismissed;
  }

  @override
  void initState() {
    super.initState();
    _initializeNotifications();
    messageListener();
    currentTheme.addListener(() {
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

  Future<void> _initializeNotifications() async {
    final FirebaseMessaging messaging = FirebaseMessaging.instance;
    final bool supported = await messaging.isSupported();
    if (!mounted) {
      return;
    }

    if (!supported) {
      setState(() {
        _notificationsSupported = false;
        _isCheckingNotificationSupport = false;
      });
      return;
    }

    final NotificationSettings settings =
        await messaging.getNotificationSettings();
    if (!mounted) {
      return;
    }
    setState(() {
      _notificationsSupported = true;
      _notificationSettings = settings;
      _isCheckingNotificationSupport = false;
    });

    if (_hasNotificationPermission) {
      await _refreshMessagingToken();
    }
  }

  Future<void> _refreshMessagingToken() async {
    if (!_notificationsSupported) {
      return;
    }
    final FirebaseMessaging messaging = FirebaseMessaging.instance;
    await messaging.getToken(vapidKey: kIsWeb ? _webVapidKey : null);
  }

  Future<void> _requestPermissionFromUserAction() async {
    if (_isRequestingNotificationPermission) {
      return;
    }
    setState(() {
      _isRequestingNotificationPermission = true;
    });

    try {
      final FirebaseMessaging messaging = FirebaseMessaging.instance;
      final NotificationSettings settings = await messaging.requestPermission();
      if (!mounted) {
        return;
      }
      setState(() {
        _notificationSettings = settings;
        if (_hasNotificationPermission) {
          _notificationPromptDismissed = true;
        }
      });

      if (_hasNotificationPermission) {
        await _refreshMessagingToken();
      }
    } finally {
      if (mounted) {
        setState(() {
          _isRequestingNotificationPermission = false;
        });
      }
    }
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
      builder: (BuildContext context, Widget? child) {
        final Widget content = child ?? const SizedBox.shrink();
        if (!_shouldShowNotificationPrompt) {
          return content;
        }

        final AuthorizationStatus status =
            _notificationSettings?.authorizationStatus ??
                AuthorizationStatus.notDetermined;
        final bool isDenied = status == AuthorizationStatus.denied;

        return Stack(
          children: <Widget>[
            content,
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                minimum: const EdgeInsets.all(14),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 760),
                  child: Card(
                    color: Colors.black.withValues(alpha: 0.92),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            isDenied
                                ? 'Notifications are currently blocked'
                                : 'Enable Pluto notifications',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            isDenied
                                ? 'Allow notifications in browser settings, then tap Enable again. On iPhone/iPad, use the Home Screen app.'
                                : 'Get event drops and reward updates. On iPhone/iPad, install Pluto to Home Screen and open it there.',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: <Widget>[
                              ElevatedButton(
                                onPressed: _isRequestingNotificationPermission
                                    ? null
                                    : _requestPermissionFromUserAction,
                                child: Text(
                                  _isRequestingNotificationPermission
                                      ? 'Enabling...'
                                      : 'Enable Notifications',
                                ),
                              ),
                              OutlinedButton(
                                onPressed: () {
                                  setState(() {
                                    _notificationPromptDismissed = true;
                                  });
                                },
                                child: const Text('Not Now'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
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
