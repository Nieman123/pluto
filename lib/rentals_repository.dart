import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/services.dart';

int? rentalPriceCents(String input) {
  final String value = input.trim();
  if (!RegExp(r'^\d{1,6}(\.\d{1,2})?$').hasMatch(value)) return null;
  final List<String> parts = value.split('.');
  return int.parse(parts[0]) * 100 +
      (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
}

class RentalItem {
  const RentalItem({required this.id, required this.data});
  factory RentalItem.fromSnapshot(
          DocumentSnapshot<Map<String, dynamic>> snapshot) =>
      RentalItem(id: snapshot.id, data: snapshot.data() ?? <String, dynamic>{});
  final String id;
  final Map<String, dynamic> data;
  String get title => data['title'] as String? ?? '';
  String get description => data['description'] as String? ?? '';
  String get category => data['category'] as String? ?? 'Other';
  String get productUrl => data['productUrl'] as String? ?? '';
  String get imageUrl => data['imageUrl'] as String? ?? '';
  String get imageStoragePath => data['imageStoragePath'] as String? ?? '';
  String get priceMode => data['priceMode'] as String? ?? 'quote';
  String get priceUnit => data['priceUnit'] as String? ?? '';
  int? get priceCents => data['priceCents'] as int?;
  int get quantity => data['quantity'] as int? ?? 1;
  int get sortOrder => data['sortOrder'] as int? ?? 0;
  bool get isActive => data['isActive'] == true;
  String get priceLabel => priceMode == 'price' && priceCents != null
      ? '\$${(priceCents! / 100).toStringAsFixed(2)}${priceUnit.isEmpty ? '' : ' $priceUnit'}'
      : 'Contact For Quote';
}

class RentalsRepository {
  RentalsRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;
  final FirebaseFirestore _firestore;
  CollectionReference<Map<String, dynamic>> get _items =>
      _firestore.collection('rentalItems');
  String newItemId() => _items.doc().id;

  Stream<List<RentalItem>> watchItems() => _items.snapshots().map((snapshot) {
        final List<RentalItem> items =
            snapshot.docs.map(RentalItem.fromSnapshot).toList();
        items.sort((a, b) => a.sortOrder.compareTo(b.sortOrder) != 0
            ? a.sortOrder.compareTo(b.sortOrder)
            : a.title.compareTo(b.title));
        return items;
      });

  Future<void> saveItem(String id, Map<String, dynamic> data) async {
    final DocumentReference<Map<String, dynamic>> document = _items.doc(id);
    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(document);
      transaction.set(
          document,
          <String, dynamic>{
            ...data,
            'updatedAt': FieldValue.serverTimestamp(),
            if (!snapshot.exists) 'createdAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true));
    });
  }

  Future<void> deleteItem(String id) => _items.doc(id).delete();

  // Admin-only, atomic, one-time import; deleted listings stay deleted afterwards.
  Future<void> seedInitialInventory() async {
    final List<dynamic> initial = jsonDecode(await rootBundle
        .loadString('assets/rentals/initial-inventory.json')) as List<dynamic>;
    final marker =
        _firestore.collection('rentalSettings').doc('initialInventory');
    await _firestore.runTransaction((transaction) async {
      if ((await transaction.get(marker)).exists) return;
      final documents =
          <DocumentReference<Map<String, dynamic>>, Map<String, dynamic>>{};
      for (final entry in initial) {
        final data = Map<String, dynamic>.from(entry as Map);
        final document = _items.doc(data.remove('id') as String);
        if (!(await transaction.get(document)).exists)
          documents[document] = data;
      }
      for (final entry in documents.entries) {
        transaction.set(entry.key, <String, dynamic>{
          ...entry.value,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp()
        });
      }
      transaction.set(
          marker, <String, dynamic>{'seededAt': FieldValue.serverTimestamp()});
    });
  }
}
