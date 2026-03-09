import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'user_profile_repository.dart';

class LinksPageItem {
  const LinksPageItem({
    required this.id,
    required this.title,
    required this.url,
    required this.sectionHeading,
    required this.sectionOrder,
    required this.sortOrder,
    required this.isActive,
    required this.isImageCircular,
    required this.imageDataUrl,
    required this.imageUrl,
    required this.assetImagePath,
    required this.iconCodePoint,
    required this.isDefaultItem,
    required this.existsInFirestore,
    this.createdAt,
    this.updatedAt,
  });

  factory LinksPageItem.fromMap(
    String id,
    Map<String, dynamic> data, {
    required bool isDefaultItem,
    required bool existsInFirestore,
  }) {
    return LinksPageItem(
      id: id,
      title: (data['title'] as String? ?? '').trim(),
      url: (data['url'] as String? ?? '').trim(),
      sectionHeading: (data['sectionHeading'] as String? ?? '').trim(),
      sectionOrder: _parseInt(data['sectionOrder']),
      sortOrder: _parseInt(data['sortOrder']),
      isActive: data['isActive'] as bool? ?? true,
      isImageCircular: data['isImageCircular'] as bool? ?? false,
      imageDataUrl: (data['imageDataUrl'] as String? ?? '').trim(),
      imageUrl: (data['imageUrl'] as String? ?? '').trim(),
      assetImagePath: (data['assetImagePath'] as String? ?? '').trim(),
      iconCodePoint:
          _parseInt(data['iconCodePoint'], fallback: Icons.link.codePoint),
      isDefaultItem: isDefaultItem,
      existsInFirestore: existsInFirestore,
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String url;
  final String sectionHeading;
  final int sectionOrder;
  final int sortOrder;
  final bool isActive;
  final bool isImageCircular;
  final String imageDataUrl;
  final String imageUrl;
  final String assetImagePath;
  final int iconCodePoint;
  final bool isDefaultItem;
  final bool existsInFirestore;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Uint8List? get imageBytes => decodeDataUrl(imageDataUrl);

  ImageProvider? get imageProvider {
    final Uint8List? bytes = imageBytes;
    if (bytes != null) {
      return MemoryImage(bytes);
    }
    if (imageUrl.isNotEmpty) {
      return NetworkImage(imageUrl);
    }
    if (assetImagePath.isNotEmpty) {
      return AssetImage(assetImagePath);
    }
    return null;
  }

  IconData get iconData => IconData(iconCodePoint, fontFamily: 'MaterialIcons');

  Map<String, dynamic> toDocumentData() {
    return <String, dynamic>{
      'title': title,
      'url': url,
      'sectionHeading': sectionHeading,
      'sectionOrder': sectionOrder,
      'sortOrder': sortOrder,
      'isActive': isActive,
      'isImageCircular': isImageCircular,
      'imageDataUrl': imageDataUrl,
      'imageUrl': imageUrl,
      'assetImagePath': assetImagePath,
      'iconCodePoint': iconCodePoint,
    };
  }

  static int _parseInt(dynamic value, {int fallback = 0}) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value) ?? fallback;
    }
    return fallback;
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }
    return null;
  }
}

class LinksRepository {
  LinksRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  static final List<LinksPageItem> defaultItems = <LinksPageItem>[
    LinksPageItem(
      id: 'campout-passes',
      title: 'PLUTO CAMPOUT INFO / PASSES',
      url: 'https://pluto.events/campout',
      sectionHeading: '',
      sectionOrder: 0,
      sortOrder: 0,
      isActive: true,
      isImageCircular: true,
      imageDataUrl: '',
      imageUrl: '',
      assetImagePath: 'assets/pluto-campout-compressed.png',
      iconCodePoint: Icons.airplane_ticket.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
    LinksPageItem(
      id: 'campout-vendor-application',
      title: 'PLUTO CAMPOUT VENDOR APPLICATION',
      url: 'https://forms.gle/qMzyfN93o9zbgedY8',
      sectionHeading: '',
      sectionOrder: 0,
      sortOrder: 1,
      isActive: true,
      isImageCircular: true,
      imageDataUrl: '',
      imageUrl: '',
      assetImagePath: '',
      iconCodePoint: Icons.edit_document.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
    LinksPageItem(
      id: 'instagram',
      title: 'INSTAGRAM',
      url: 'https://instagram.com/pluto.events.avl/',
      sectionHeading: '',
      sectionOrder: 0,
      sortOrder: 2,
      isActive: true,
      isImageCircular: false,
      imageDataUrl: '',
      imageUrl: '',
      assetImagePath: 'assets/home/constant/instagram.png',
      iconCodePoint: Icons.music_note.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
    LinksPageItem(
      id: 'facebook',
      title: 'FACEBOOK',
      url: 'https://www.facebook.com/people/Pluto-Events/100095100467395/',
      sectionHeading: '',
      sectionOrder: 0,
      sortOrder: 3,
      isActive: true,
      isImageCircular: false,
      imageDataUrl: '',
      imageUrl: '',
      assetImagePath: 'assets/home/constant/facebook.png',
      iconCodePoint: Icons.face.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
    LinksPageItem(
      id: 'tiktok',
      title: 'TIKTOK',
      url: 'https://www.tiktok.com/@pluto.events',
      sectionHeading: '',
      sectionOrder: 0,
      sortOrder: 4,
      isActive: true,
      isImageCircular: false,
      imageDataUrl: '',
      imageUrl: '',
      assetImagePath: 'assets/home/constant/tiktok.png',
      iconCodePoint: Icons.face.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
    LinksPageItem(
      id: 'just-nieman-instagram',
      title: 'JUST NIEMAN',
      url: 'https://www.instagram.com/justnieman/',
      sectionHeading: 'PLUTO MEMEBERS ON INSTA',
      sectionOrder: 1,
      sortOrder: 0,
      isActive: true,
      isImageCircular: false,
      imageDataUrl: '',
      imageUrl: 'https://i.imgur.com/5I4TqyV.jpg',
      assetImagePath: '',
      iconCodePoint: Icons.face.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
    LinksPageItem(
      id: 'divine-thud-instagram',
      title: 'DIVINE THUD',
      url: 'https://www.instagram.com/divine_thud_/',
      sectionHeading: 'PLUTO MEMEBERS ON INSTA',
      sectionOrder: 1,
      sortOrder: 1,
      isActive: true,
      isImageCircular: false,
      imageDataUrl: '',
      imageUrl: 'https://i.imgur.com/FiHtYq3.jpeg',
      assetImagePath: '',
      iconCodePoint: Icons.face.codePoint,
      isDefaultItem: true,
      existsInFirestore: false,
    ),
  ];

  static final Map<String, LinksPageItem> _defaultItemsById =
      <String, LinksPageItem>{
    for (final LinksPageItem item in defaultItems) item.id: item,
  };

  CollectionReference<Map<String, dynamic>> get _linksPageItems =>
      _firestore.collection('linksPageItems');

  Stream<List<LinksPageItem>> watchItems({required bool onlyActive}) {
    return _linksPageItems.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final Map<String, LinksPageItem> itemsById = <String, LinksPageItem>{
          for (final LinksPageItem item in defaultItems) item.id: item,
        };

        for (final QueryDocumentSnapshot<Map<String, dynamic>> doc
            in snapshot.docs) {
          final LinksPageItem? defaultItem = _defaultItemsById[doc.id];
          final Map<String, dynamic> mergedData = <String, dynamic>{
            if (defaultItem != null) ...defaultItem.toDocumentData(),
            ...doc.data(),
          };
          itemsById[doc.id] = LinksPageItem.fromMap(
            doc.id,
            mergedData,
            isDefaultItem: defaultItem != null,
            existsInFirestore: true,
          );
        }

        final List<LinksPageItem> items = itemsById.values
            .where((LinksPageItem item) => !onlyActive || item.isActive)
            .toList()
          ..sort(_sortItems);
        return items;
      },
    );
  }

  Future<String> saveItem({
    required String? id,
    required String title,
    required String url,
    required String sectionHeading,
    required int sectionOrder,
    required int sortOrder,
    required bool isActive,
    required bool isImageCircular,
    required String imageDataUrl,
    required String imageUrl,
    required String assetImagePath,
    required int iconCodePoint,
  }) async {
    final DocumentReference<Map<String, dynamic>> document =
        (id == null || id.isEmpty)
            ? _linksPageItems.doc()
            : _linksPageItems.doc(id);
    final DocumentSnapshot<Map<String, dynamic>> snapshot =
        await document.get();

    final Map<String, dynamic> payload = <String, dynamic>{
      'title': title.trim(),
      'url': url.trim(),
      'sectionHeading': sectionHeading.trim(),
      'sectionOrder': sectionOrder,
      'sortOrder': sortOrder,
      'isActive': isActive,
      'isImageCircular': isImageCircular,
      'imageDataUrl': imageDataUrl.trim(),
      'imageUrl': imageUrl.trim(),
      'assetImagePath': assetImagePath.trim(),
      'iconCodePoint': iconCodePoint,
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (!snapshot.exists) {
      payload['createdAt'] = FieldValue.serverTimestamp();
    }

    await document.set(payload, SetOptions(merge: true));
    return document.id;
  }

  Future<void> deleteItem(String id) async {
    await _linksPageItems.doc(id).delete();
  }

  static int _sortItems(LinksPageItem a, LinksPageItem b) {
    final int bySectionOrder = a.sectionOrder.compareTo(b.sectionOrder);
    if (bySectionOrder != 0) {
      return bySectionOrder;
    }

    final int bySectionHeading = a.sectionHeading
        .toLowerCase()
        .compareTo(b.sectionHeading.toLowerCase());
    if (bySectionHeading != 0) {
      return bySectionHeading;
    }

    final int bySortOrder = a.sortOrder.compareTo(b.sortOrder);
    if (bySortOrder != 0) {
      return bySortOrder;
    }

    return a.title.toLowerCase().compareTo(b.title.toLowerCase());
  }
}
