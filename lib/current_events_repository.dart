import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:http/http.dart' as http;
import 'src/native_environment.dart';

class CurrentEvent {
  CurrentEvent({
    required this.id,
    required this.title,
    required this.details,
    required this.ticketUrl,
    required this.flyerDataUrl,
    this.flyerImageUrl = '',
    this.flyerStoragePath = '',
    this.registrationMode = 'tickets',
    this.demo = false,
    this.startAt,
    this.endAt,
    required this.isActive,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CurrentEvent.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    return CurrentEvent.fromData(
        snapshot.id, snapshot.data() ?? <String, dynamic>{});
  }

  factory CurrentEvent.fromData(String id, Map<String, dynamic> data) {
    return CurrentEvent(
      id: id,
      title: (data['title'] as String? ?? '').trim(),
      details: (data['details'] as String? ?? '').trim(),
      ticketUrl: (data['ticketUrl'] as String? ?? '').trim(),
      flyerDataUrl: (data['flyerDataUrl'] as String? ?? '').trim(),
      flyerImageUrl: (data['flyerImageUrl'] as String? ?? '').trim(),
      flyerStoragePath: (data['flyerStoragePath'] as String? ?? '').trim(),
      registrationMode: data['registrationMode'] as String? ?? 'tickets',
      demo: data['demo'] == true,
      startAt: _parseTimestamp(data['startAt']),
      endAt: _parseTimestamp(data['endAt']),
      isActive: data['isActive'] as bool? ?? true,
      sortOrder: _parseInt(data['sortOrder']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String details;
  final String ticketUrl;
  final String flyerDataUrl;
  final String flyerImageUrl;
  final String flyerStoragePath;
  final String registrationMode;
  final bool demo;
  final DateTime? startAt;
  final DateTime? endAt;
  final bool isActive;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Uint8List? get flyerBytes => decodeFlyerDataUrl(flyerDataUrl);

  bool get isFree => registrationMode == 'free';
  bool isCurrentAt(DateTime now) =>
      isActive && (endAt == null || endAt!.isAfter(now));
  bool get isRsvp =>
      registrationMode == 'rsvp' || registrationMode == 'rsvp-approval';
  String get actionLabel => isFree
      ? 'View event'
      : isRsvp
          ? 'RSVP'
          : 'Tickets';

  static int _parseInt(dynamic value) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value) ?? 0;
    }
    return 0;
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }
    if (value is String) return DateTime.tryParse(value);
    return null;
  }
}

extension CurrentEventX on CurrentEvent {
  bool get isLegacyManaFest => isManaFest && !id.startsWith('native-');

  bool get isManaFest {
    final String normalizedTitle =
        title.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    return normalizedTitle.startsWith('manafest');
  }
}

Uint8List? decodeFlyerDataUrl(String dataUrl) {
  if (dataUrl.isEmpty) {
    return null;
  }

  final int commaIndex = dataUrl.indexOf(',');
  final String encoded =
      commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;

  try {
    return base64Decode(encoded);
  } catch (_) {
    return null;
  }
}

class CurrentEventsRepository {
  CurrentEventsRepository(
      {FirebaseFirestore? firestore,
      http.Client? client,
      Uri? baseUri,
      DateTime Function()? now,
      Future<String?> Function()? tokenProvider,
      this.refreshInterval = const Duration(minutes: 1)})
      : _providedFirestore = firestore,
        _get = client?.get ?? http.get,
        _baseUri = baseUri,
        _tokenProvider = tokenProvider,
        _now = now ?? DateTime.now;

  final Future<String?> Function()? _tokenProvider;

  final FirebaseFirestore? _providedFirestore;
  FirebaseFirestore get _firestore =>
      _providedFirestore ?? FirebaseFirestore.instance;
  final Future<http.Response> Function(Uri, {Map<String, String>? headers})
      _get;
  final Uri? _baseUri;
  final DateTime Function() _now;
  final Duration refreshInterval;

  Future<List<CurrentEvent>> loadActiveEvents() async {
    final token = await _tokenProvider?.call();
    final response = await _get(
            (_baseUri ?? ticketingBaseUri())
                .resolve('/tickets/api/public/events'),
            headers: token == null ? null : {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 20));
    if (response.statusCode != 200)
      throw StateError('Upcoming events could not be loaded.');
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final events = (data['events'] as List)
        .map((raw) {
          final value = Map<String, dynamic>.from(raw as Map);
          return CurrentEvent.fromData(value['id'] as String, value);
        })
        .where((event) => event.isCurrentAt(_now()))
        .toList();
    events.sort(_sortEvents);
    return events;
  }

  Stream<List<CurrentEvent>> _watchActiveEvents() {
    return Stream<List<CurrentEvent>>.multi((controller) {
      var active = true, loading = false;
      Future<void> refresh() async {
        if (!active || loading) return;
        loading = true;
        try {
          final events = await loadActiveEvents();
          if (active) controller.add(events);
        } catch (error, stack) {
          if (active) controller.addError(error, stack);
        } finally {
          loading = false;
        }
      }

      final timer = Timer.periodic(refreshInterval, (_) => refresh());
      controller.onCancel = () {
        active = false;
        timer.cancel();
      };
      unawaited(refresh());
    });
  }

  CollectionReference<Map<String, dynamic>> get _currentEventsCollection =>
      _firestore.collection('currentEvents');

  Stream<List<CurrentEvent>> watchEvents({required bool onlyActive}) {
    if (onlyActive) return _watchActiveEvents();
    return _currentEventsCollection
        .snapshots()
        .map((QuerySnapshot<Map<String, dynamic>> snapshot) {
      final List<CurrentEvent> allEvents =
          snapshot.docs.map(CurrentEvent.fromSnapshot).toList();
      allEvents.sort(_sortEvents);
      return allEvents;
    });
  }

  Future<bool> isAdminUser(String uid) async {
    final DocumentSnapshot<Map<String, dynamic>> snapshot =
        await _firestore.collection('adminUsers').doc(uid).get();
    return snapshot.exists;
  }

  static int _sortEvents(CurrentEvent a, CurrentEvent b) {
    final int bySortOrder = a.sortOrder.compareTo(b.sortOrder);
    if (bySortOrder != 0) {
      return bySortOrder;
    }
    if (a.startAt != null && b.startAt == null) return -1;
    if (a.startAt == null && b.startAt != null) return 1;
    if (a.startAt != null && b.startAt != null)
      return a.startAt!.compareTo(b.startAt!);

    final DateTime aDate =
        a.updatedAt ?? a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    final DateTime bDate =
        b.updatedAt ?? b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    return bDate.compareTo(aDate);
  }
}
