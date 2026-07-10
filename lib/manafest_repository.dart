import 'package:cloud_firestore/cloud_firestore.dart';

const String manaFestMainStage = 'Main Stage';
const String manaFestRenegadeStage = 'Renegade Stage';
const List<String> manaFestStageValues = <String>[
  manaFestMainStage,
  manaFestRenegadeStage,
];

String normalizeManaFestStage(String value) {
  final String trimmed = value.trim();
  if (trimmed == manaFestRenegadeStage) {
    return manaFestRenegadeStage;
  }
  return manaFestMainStage;
}

class ManaFestSettings {
  const ManaFestSettings({
    required this.isLineupPublished,
    required this.isMapPublished,
    required this.updatedAt,
  });

  factory ManaFestSettings.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return ManaFestSettings(
      isLineupPublished: data['isLineupPublished'] as bool? ?? false,
      isMapPublished: data['isMapPublished'] as bool? ?? false,
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  static const ManaFestSettings defaults = ManaFestSettings(
    isLineupPublished: false,
    isMapPublished: false,
    updatedAt: null,
  );

  final bool isLineupPublished;
  final bool isMapPublished;
  final DateTime? updatedAt;
}

class ManaFestScheduleItem {
  const ManaFestScheduleItem({
    required this.id,
    required this.title,
    required this.artistName,
    required this.stage,
    required this.dayLabel,
    required this.startTimeLabel,
    required this.endTimeLabel,
    required this.description,
    required this.isActive,
    required this.isPublished,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ManaFestScheduleItem.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return ManaFestScheduleItem(
      id: snapshot.id,
      title: (data['title'] as String? ?? '').trim(),
      artistName: (data['artistName'] as String? ?? '').trim(),
      stage: normalizeManaFestStage(data['stage'] as String? ?? ''),
      dayLabel: (data['dayLabel'] as String? ?? '').trim(),
      startTimeLabel: (data['startTimeLabel'] as String? ?? '').trim(),
      endTimeLabel: (data['endTimeLabel'] as String? ?? '').trim(),
      description: (data['description'] as String? ?? '').trim(),
      isActive: data['isActive'] as bool? ?? true,
      isPublished: data['isPublished'] as bool? ?? true,
      sortOrder: _parseInt(data['sortOrder']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String artistName;
  final String stage;
  final String dayLabel;
  final String startTimeLabel;
  final String endTimeLabel;
  final String description;
  final bool isActive;
  final bool isPublished;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get displayTitle {
    if (title.isNotEmpty) {
      return title;
    }
    if (artistName.isNotEmpty) {
      return artistName;
    }
    return 'Untitled Set';
  }

  String get timeRangeLabel {
    if (startTimeLabel.isEmpty && endTimeLabel.isEmpty) {
      return 'Time TBA';
    }
    if (endTimeLabel.isEmpty) {
      return startTimeLabel;
    }
    return '$startTimeLabel - $endTimeLabel';
  }
}

class ManaFestGuideSection {
  const ManaFestGuideSection({
    required this.id,
    required this.title,
    required this.body,
    required this.category,
    required this.isActive,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ManaFestGuideSection.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return ManaFestGuideSection(
      id: snapshot.id,
      title: (data['title'] as String? ?? '').trim(),
      body: (data['body'] as String? ?? '').trim(),
      category: (data['category'] as String? ?? '').trim(),
      isActive: data['isActive'] as bool? ?? true,
      sortOrder: _parseInt(data['sortOrder']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String body;
  final String category;
  final bool isActive;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class ManaFestUpdate {
  const ManaFestUpdate({
    required this.id,
    required this.title,
    required this.body,
    required this.isUrgent,
    required this.isActive,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ManaFestUpdate.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return ManaFestUpdate(
      id: snapshot.id,
      title: (data['title'] as String? ?? '').trim(),
      body: (data['body'] as String? ?? '').trim(),
      isUrgent: data['isUrgent'] as bool? ?? false,
      isActive: data['isActive'] as bool? ?? true,
      sortOrder: _parseInt(data['sortOrder']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String body;
  final bool isUrgent;
  final bool isActive;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class ManaFestArtist {
  const ManaFestArtist({
    required this.id,
    required this.name,
    required this.bio,
    required this.genres,
    required this.imageUrl,
    required this.isActive,
    required this.isPublished,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ManaFestArtist.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return ManaFestArtist(
      id: snapshot.id,
      name: (data['name'] as String? ?? '').trim(),
      bio: (data['bio'] as String? ?? '').trim(),
      genres: (data['genres'] as String? ?? '').trim(),
      imageUrl: (data['imageUrl'] as String? ?? '').trim(),
      isActive: data['isActive'] as bool? ?? true,
      isPublished: data['isPublished'] as bool? ?? false,
      sortOrder: _parseInt(data['sortOrder']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String name;
  final String bio;
  final String genres;
  final String imageUrl;
  final bool isActive;
  final bool isPublished;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class ManaFestMapPin {
  const ManaFestMapPin({
    required this.id,
    required this.title,
    required this.description,
    required this.pinType,
    required this.locationNote,
    required this.isActive,
    required this.isPublished,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ManaFestMapPin.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return ManaFestMapPin(
      id: snapshot.id,
      title: (data['title'] as String? ?? '').trim(),
      description: (data['description'] as String? ?? '').trim(),
      pinType: (data['pinType'] as String? ?? '').trim(),
      locationNote: (data['locationNote'] as String? ?? '').trim(),
      isActive: data['isActive'] as bool? ?? true,
      isPublished: data['isPublished'] as bool? ?? false,
      sortOrder: _parseInt(data['sortOrder']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String description;
  final String pinType;
  final String locationNote;
  final bool isActive;
  final bool isPublished;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class ManaFestRepository {
  ManaFestRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  DocumentReference<Map<String, dynamic>> get _settingsDoc =>
      _firestore.collection('manaFestSettings').doc('app');

  CollectionReference<Map<String, dynamic>> get _scheduleItems =>
      _firestore.collection('manaFestScheduleItems');

  CollectionReference<Map<String, dynamic>> get _guideSections =>
      _firestore.collection('manaFestGuideSections');

  CollectionReference<Map<String, dynamic>> get _updates =>
      _firestore.collection('manaFestUpdates');

  CollectionReference<Map<String, dynamic>> get _artists =>
      _firestore.collection('manaFestArtists');

  CollectionReference<Map<String, dynamic>> get _mapPins =>
      _firestore.collection('manaFestMapPins');

  Stream<ManaFestSettings> watchSettings() {
    return _settingsDoc.snapshots().map(
      (DocumentSnapshot<Map<String, dynamic>> snapshot) {
        if (!snapshot.exists) {
          return ManaFestSettings.defaults;
        }
        return ManaFestSettings.fromSnapshot(snapshot);
      },
    );
  }

  Future<void> saveSettings({
    required bool isLineupPublished,
    required bool isMapPublished,
  }) async {
    await _settingsDoc.set(
      <String, dynamic>{
        'isLineupPublished': isLineupPublished,
        'isMapPublished': isMapPublished,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Stream<List<ManaFestScheduleItem>> watchScheduleItems({
    required bool attendeeOnly,
  }) {
    return _scheduleItems.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<ManaFestScheduleItem> items =
            snapshot.docs.map(ManaFestScheduleItem.fromSnapshot).toList();
        final List<ManaFestScheduleItem> filtered = attendeeOnly
            ? items
                .where((ManaFestScheduleItem item) =>
                    item.isActive && item.isPublished)
                .toList()
            : items;
        filtered.sort(_sortScheduleItems);
        return filtered;
      },
    );
  }

  Stream<List<ManaFestGuideSection>> watchGuideSections({
    required bool attendeeOnly,
  }) {
    return _guideSections.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<ManaFestGuideSection> items =
            snapshot.docs.map(ManaFestGuideSection.fromSnapshot).toList();
        final List<ManaFestGuideSection> filtered = attendeeOnly
            ? items.where((ManaFestGuideSection item) => item.isActive).toList()
            : items;
        filtered.sort(_sortGuideSections);
        return filtered;
      },
    );
  }

  Stream<List<ManaFestUpdate>> watchUpdates({required bool attendeeOnly}) {
    return _updates.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<ManaFestUpdate> items =
            snapshot.docs.map(ManaFestUpdate.fromSnapshot).toList();
        final List<ManaFestUpdate> filtered = attendeeOnly
            ? items.where((ManaFestUpdate item) => item.isActive).toList()
            : items;
        filtered.sort(_sortUpdates);
        return filtered;
      },
    );
  }

  Stream<List<ManaFestArtist>> watchArtists({required bool attendeeOnly}) {
    return _artists.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<ManaFestArtist> items =
            snapshot.docs.map(ManaFestArtist.fromSnapshot).toList();
        final List<ManaFestArtist> filtered = attendeeOnly
            ? items
                .where(
                    (ManaFestArtist item) => item.isActive && item.isPublished)
                .toList()
            : items;
        filtered.sort(_sortArtists);
        return filtered;
      },
    );
  }

  Stream<List<ManaFestMapPin>> watchMapPins({required bool attendeeOnly}) {
    return _mapPins.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<ManaFestMapPin> items =
            snapshot.docs.map(ManaFestMapPin.fromSnapshot).toList();
        final List<ManaFestMapPin> filtered = attendeeOnly
            ? items
                .where(
                    (ManaFestMapPin item) => item.isActive && item.isPublished)
                .toList()
            : items;
        filtered.sort(_sortMapPins);
        return filtered;
      },
    );
  }

  Future<String> saveScheduleItem({
    required String? id,
    required String title,
    required String artistName,
    required String stage,
    required String dayLabel,
    required String startTimeLabel,
    required String endTimeLabel,
    required String description,
    required bool isActive,
    required bool isPublished,
    required int sortOrder,
  }) {
    return _saveDocument(
      collection: _scheduleItems,
      id: id,
      payload: <String, dynamic>{
        'title': title.trim(),
        'artistName': artistName.trim(),
        'stage': normalizeManaFestStage(stage),
        'dayLabel': dayLabel.trim(),
        'startTimeLabel': startTimeLabel.trim(),
        'endTimeLabel': endTimeLabel.trim(),
        'description': description.trim(),
        'isActive': isActive,
        'isPublished': isPublished,
        'sortOrder': sortOrder,
      },
    );
  }

  Future<String> saveGuideSection({
    required String? id,
    required String title,
    required String body,
    required String category,
    required bool isActive,
    required int sortOrder,
  }) {
    return _saveDocument(
      collection: _guideSections,
      id: id,
      payload: <String, dynamic>{
        'title': title.trim(),
        'body': body.trim(),
        'category': category.trim(),
        'isActive': isActive,
        'sortOrder': sortOrder,
      },
    );
  }

  Future<String> saveUpdate({
    required String? id,
    required String title,
    required String body,
    required bool isUrgent,
    required bool isActive,
    required int sortOrder,
  }) {
    return _saveDocument(
      collection: _updates,
      id: id,
      payload: <String, dynamic>{
        'title': title.trim(),
        'body': body.trim(),
        'isUrgent': isUrgent,
        'isActive': isActive,
        'sortOrder': sortOrder,
      },
    );
  }

  Future<String> saveArtist({
    required String? id,
    required String name,
    required String bio,
    required String genres,
    required String imageUrl,
    required bool isActive,
    required bool isPublished,
    required int sortOrder,
  }) {
    return _saveDocument(
      collection: _artists,
      id: id,
      payload: <String, dynamic>{
        'name': name.trim(),
        'bio': bio.trim(),
        'genres': genres.trim(),
        'imageUrl': imageUrl.trim(),
        'isActive': isActive,
        'isPublished': isPublished,
        'sortOrder': sortOrder,
      },
    );
  }

  Future<String> saveMapPin({
    required String? id,
    required String title,
    required String description,
    required String pinType,
    required String locationNote,
    required bool isActive,
    required bool isPublished,
    required int sortOrder,
  }) {
    return _saveDocument(
      collection: _mapPins,
      id: id,
      payload: <String, dynamic>{
        'title': title.trim(),
        'description': description.trim(),
        'pinType': pinType.trim(),
        'locationNote': locationNote.trim(),
        'isActive': isActive,
        'isPublished': isPublished,
        'sortOrder': sortOrder,
      },
    );
  }

  Future<void> deleteScheduleItem(String id) => _scheduleItems.doc(id).delete();

  Future<void> deleteGuideSection(String id) => _guideSections.doc(id).delete();

  Future<void> deleteUpdate(String id) => _updates.doc(id).delete();

  Future<void> deleteArtist(String id) => _artists.doc(id).delete();

  Future<void> deleteMapPin(String id) => _mapPins.doc(id).delete();

  Future<String> _saveDocument({
    required CollectionReference<Map<String, dynamic>> collection,
    required String? id,
    required Map<String, dynamic> payload,
  }) async {
    final DocumentReference<Map<String, dynamic>> document =
        id == null || id.isEmpty ? collection.doc() : collection.doc(id);
    final DocumentSnapshot<Map<String, dynamic>> snapshot =
        await document.get();

    payload['updatedAt'] = FieldValue.serverTimestamp();
    if (!snapshot.exists) {
      payload['createdAt'] = FieldValue.serverTimestamp();
    }

    await document.set(payload, SetOptions(merge: true));
    return document.id;
  }

  static int _sortScheduleItems(
    ManaFestScheduleItem a,
    ManaFestScheduleItem b,
  ) {
    final int bySort = a.sortOrder.compareTo(b.sortOrder);
    if (bySort != 0) {
      return bySort;
    }
    final int byDay = a.dayLabel.compareTo(b.dayLabel);
    if (byDay != 0) {
      return byDay;
    }
    final int byTime = a.startTimeLabel.compareTo(b.startTimeLabel);
    if (byTime != 0) {
      return byTime;
    }
    return a.displayTitle.toLowerCase().compareTo(b.displayTitle.toLowerCase());
  }

  static int _sortGuideSections(
    ManaFestGuideSection a,
    ManaFestGuideSection b,
  ) {
    final int bySort = a.sortOrder.compareTo(b.sortOrder);
    if (bySort != 0) {
      return bySort;
    }
    return a.title.toLowerCase().compareTo(b.title.toLowerCase());
  }

  static int _sortUpdates(ManaFestUpdate a, ManaFestUpdate b) {
    if (a.isUrgent != b.isUrgent) {
      return a.isUrgent ? -1 : 1;
    }
    final int bySort = a.sortOrder.compareTo(b.sortOrder);
    if (bySort != 0) {
      return bySort;
    }
    final DateTime aDate =
        a.updatedAt ?? a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    final DateTime bDate =
        b.updatedAt ?? b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    return bDate.compareTo(aDate);
  }

  static int _sortArtists(ManaFestArtist a, ManaFestArtist b) {
    final int bySort = a.sortOrder.compareTo(b.sortOrder);
    if (bySort != 0) {
      return bySort;
    }
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }

  static int _sortMapPins(ManaFestMapPin a, ManaFestMapPin b) {
    final int bySort = a.sortOrder.compareTo(b.sortOrder);
    if (bySort != 0) {
      return bySort;
    }
    return a.title.toLowerCase().compareTo(b.title.toLowerCase());
  }
}

int _parseInt(dynamic value) {
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

DateTime? _parseTimestamp(dynamic value) {
  if (value is Timestamp) {
    return value.toDate();
  }
  return null;
}
