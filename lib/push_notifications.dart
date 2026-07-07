import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

const String _webVapidKey =
    'BBwgiNd7-lSc0iqFjrIprkGQDgiV8Z67WprIVKqc3-hVFpanH9xOAnrHQKZ45h4JaMIp9nljQONhdqzBvpuJINE';

Future<Map<String, bool>> initializePushNotifications() async {
  final FirebaseMessaging messaging = FirebaseMessaging.instance;
  final bool supported = await messaging.isSupported();
  if (!supported) {
    return _statusMap(supported: false);
  }

  final NotificationSettings settings =
      await messaging.getNotificationSettings();
  await _refreshMessagingTokenIfAllowed(settings);
  return _statusMap(supported: true, settings: settings);
}

Future<Map<String, bool>> requestPushNotificationPermission() async {
  final FirebaseMessaging messaging = FirebaseMessaging.instance;
  final bool supported = await messaging.isSupported();
  if (!supported) {
    return _statusMap(supported: false);
  }

  final NotificationSettings settings = await messaging.requestPermission();
  await _refreshMessagingTokenIfAllowed(settings);
  return _statusMap(supported: true, settings: settings);
}

void listenForForegroundPushNotifications(
  void Function(String? title, String? body) onMessage,
) {
  FirebaseMessaging.onMessage.listen((RemoteMessage message) {
    final RemoteNotification? notification = message.notification;
    if (notification == null) {
      return;
    }
    onMessage(notification.title, notification.body);
  });
}

Future<void> _refreshMessagingTokenIfAllowed(
  NotificationSettings settings,
) async {
  if (!_hasPermission(settings.authorizationStatus)) {
    return;
  }

  await FirebaseMessaging.instance.getToken(
    vapidKey: kIsWeb ? _webVapidKey : null,
  );
}

Map<String, bool> _statusMap({
  required bool supported,
  NotificationSettings? settings,
}) {
  final AuthorizationStatus? authorizationStatus =
      settings?.authorizationStatus;
  return <String, bool>{
    'supported': supported,
    'hasPermission':
        authorizationStatus != null && _hasPermission(authorizationStatus),
    'denied': authorizationStatus == AuthorizationStatus.denied,
  };
}

bool _hasPermission(AuthorizationStatus status) {
  return status == AuthorizationStatus.authorized ||
      status == AuthorizationStatus.provisional;
}
