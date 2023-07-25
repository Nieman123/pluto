import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:form_builder_validators/localization/l10n.dart';

import 'app.dart';
import 'app2.dart';
import 'firebase_options.dart';
import 'src/configure_web.dart';
import 'src/json_service.dart';
import 'src/theme/config.dart';
import 'src/theme/custom_theme.dart';

Future<void> main() async {
  configureApp();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
  final currentToken = await FirebaseMessaging.instance.getToken(
      vapidKey:
          'BBwgiNd7-lSc0iqFjrIprkGQDgiV8Z67WprIVKqc3-hVFpanH9xOAnrHQKZ45h4JaMIp9nljQONhdqzBvpuJINE');
}

class MyApp extends StatefulWidget {
  const MyApp({Key? key}) : super(key: key);
  @override
  _MyAppState createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    currentTheme.addListener(() {
      setState(() {});
    });
    jsonService.init();
    jsonService.addListener(() {
      setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    return JSONService.hasLoaded == true
        ? MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: CustomTheme.darkTheme,
            darkTheme: CustomTheme.darkTheme,
            themeMode: currentTheme.currentTheme,
            localizationsDelegates: const [
              FormBuilderLocalizations.delegate,
            ],
            home: const App(),
            initialRoute: App.route,
            routes: {
              App2.route: (context) => App2(),
            },
          )
        : const Center(child: CircularProgressIndicator());
  }
}
