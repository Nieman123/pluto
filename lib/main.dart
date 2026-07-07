import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'admin_page.dart' deferred as admin_page hide AdminSectionX;
import 'app.dart';
import 'camping.dart' deferred as camping;
import 'event_qr_scan_page.dart' deferred as event_qr_scan_page;
import 'firebase_options.dart';
import 'item_shop_page.dart' deferred as item_shop_page;
import 'links.dart' deferred as links;
import 'manafest_page.dart' deferred as manafest_page;
import 'profile_page.dart' deferred as profile_page;
import 'push_notifications.dart' deferred as push_notifications;
import 'schedule.dart' deferred as schedule;
import 'sign_on_page.dart' deferred as sign_on_page;
import 'src/configure_web.dart';
import 'src/deferred_widget.dart';
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
  late final GoRouter _router;
  bool _notificationsSupported = false;
  bool _isCheckingNotificationSupport = true;
  bool _isRequestingNotificationPermission = false;
  bool _notificationPromptDismissed = false;
  bool _hasNotificationPermission = false;
  bool _isNotificationDenied = false;
  bool _pushNotificationLibraryLoaded = false;

  bool get _shouldShowNotificationPrompt {
    return !_isCheckingNotificationSupport &&
        _notificationsSupported &&
        !_hasNotificationPermission &&
        !_notificationPromptDismissed;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future<void>.delayed(const Duration(milliseconds: 1500), () {
        if (mounted) {
          _initializeNotifications();
        }
      });
    });
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
          return DeferredWidget(
            loadLibrary: links.loadLibrary,
            builder: (BuildContext context) => links.LinksPage(),
          );
        },
      ),
      GoRoute(
        path: '/camping',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: camping.loadLibrary,
            builder: (BuildContext context) => camping.CampingInfoPage(),
          );
        },
      ),
      GoRoute(
        path: '/schedule',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: schedule.loadLibrary,
            builder: (BuildContext context) => schedule.SchedulePage(),
          );
        },
      ),
      GoRoute(
        path: '/sign-on',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: sign_on_page.loadLibrary,
            builder: (BuildContext context) => sign_on_page.SignOnPage(),
          );
        },
      ),
      GoRoute(
        path: '/admin',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: admin_page.loadLibrary,
            builder: (BuildContext context) => admin_page.AdminPage(),
          );
        },
      ),
      GoRoute(
        path: '/admin/events',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: admin_page.loadLibrary,
            builder: (BuildContext context) => admin_page.AdminPage(
              section: admin_page.AdminSection.events,
            ),
          );
        },
      ),
      GoRoute(
        path: '/admin/rewards',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: admin_page.loadLibrary,
            builder: (BuildContext context) => admin_page.AdminPage(
              section: admin_page.AdminSection.rewards,
            ),
          );
        },
      ),
      GoRoute(
        path: '/admin/links',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: admin_page.loadLibrary,
            builder: (BuildContext context) => admin_page.AdminPage(
              section: admin_page.AdminSection.links,
            ),
          );
        },
      ),
      GoRoute(
        path: '/profile',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: profile_page.loadLibrary,
            builder: (BuildContext context) => profile_page.ProfilePage(),
          );
        },
      ),
      GoRoute(
        path: '/scan-qr',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: event_qr_scan_page.loadLibrary,
            builder: (BuildContext context) =>
                event_qr_scan_page.EventQrScanPage(),
          );
        },
      ),
      GoRoute(
        path: '/shop',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: item_shop_page.loadLibrary,
            builder: (BuildContext context) => item_shop_page.ItemShopPage(),
          );
        },
      ),
      GoRoute(
        path: '/manafest',
        builder: (BuildContext context, GoRouterState state) {
          return DeferredWidget(
            loadLibrary: manafest_page.loadLibrary,
            builder: (BuildContext context) => manafest_page.ManaFestPage(),
          );
        },
      ),
    ], debugLogDiagnostics: true);
  }

  Future<void> _initializeNotifications() async {
    if (_pushNotificationLibraryLoaded) {
      return;
    }

    try {
      await push_notifications.loadLibrary();
      _pushNotificationLibraryLoaded = true;
      push_notifications.listenForForegroundPushNotifications(
        _showForegroundNotification,
      );
      final Map<String, bool> status =
          await push_notifications.initializePushNotifications();
      if (!mounted) {
        return;
      }
      _applyNotificationStatus(status);
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _notificationsSupported = false;
        _isCheckingNotificationSupport = false;
      });
    }
  }

  Future<void> _requestPermissionFromUserAction() async {
    if (_isRequestingNotificationPermission) {
      return;
    }
    setState(() {
      _isRequestingNotificationPermission = true;
    });

    try {
      await push_notifications.loadLibrary();
      _pushNotificationLibraryLoaded = true;
      final Map<String, bool> status =
          await push_notifications.requestPushNotificationPermission();
      if (!mounted) {
        return;
      }
      _applyNotificationStatus(status);
    } finally {
      if (mounted) {
        setState(() {
          _isRequestingNotificationPermission = false;
        });
      }
    }
  }

  void _applyNotificationStatus(Map<String, bool> status) {
    setState(() {
      _notificationsSupported = status['supported'] ?? false;
      _hasNotificationPermission = status['hasPermission'] ?? false;
      _isNotificationDenied = status['denied'] ?? false;
      _isCheckingNotificationSupport = false;
      if (_hasNotificationPermission) {
        _notificationPromptDismissed = true;
      }
    });
  }

  void _showForegroundNotification(String? title, String? body) {
    if (!mounted) {
      return;
    }
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return DynamicDialog(title: title, body: body);
      },
    );
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
                            _isNotificationDenied
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
                            _isNotificationDenied
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
