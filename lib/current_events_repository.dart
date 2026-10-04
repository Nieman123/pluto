import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';

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
    required this.isActive,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CurrentEvent.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};

    return CurrentEvent(
      id: snapshot.id,
      title: (data['title'] as String? ?? '').trim(),
      details: (data['details'] as String? ?? '').trim(),
      ticketUrl: (data['ticketUrl'] as String? ?? '').trim(),
      flyerDataUrl: (data['flyerDataUrl'] as String? ?? '').trim(),
      flyerImageUrl: (data['flyerImageUrl'] as String? ?? '').trim(),
      flyerStoragePath: (data['flyerStoragePath'] as String? ?? '').trim(),
      registrationMode: data['registrationMode'] as String? ?? 'tickets',
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
  final bool isActive;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Uint8List? get flyerBytes => decodeFlyerDataUrl(flyerDataUrl);

  bool get isFree => registrationMode == 'free';
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
    return null;
  }
}

extension CurrentEventX on CurrentEvent {
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
  CurrentEventsRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _currentEventsCollection =>
      _firestore.collection('currentEvents');

  Stream<List<CurrentEvent>> watchEvents({required bool onlyActive}) {
    return _currentEventsCollection
        .snapshots()
        .map((QuerySnapshot<Map<String, dynamic>> snapshot) {
      final List<CurrentEvent> allEvents =
          snapshot.docs.map(CurrentEvent.fromSnapshot).toList();
      final List<CurrentEvent> filteredEvents = onlyActive
          ? allEvents.where((CurrentEvent event) => event.isActive).toList()
          : allEvents;

      filteredEvents.sort(_sortEvents);
      return filteredEvents;
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

    final DateTime aDate =
        a.updatedAt ?? a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    final DateTime bDate =
        b.updatedAt ?? b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    return bDate.compareTo(aDate);
  }
}
