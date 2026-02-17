import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class UserProfile {
  UserProfile({
    required this.uid,
    required this.displayName,
    required this.homeCity,
    required this.favoriteGenre,
    required this.bio,
    required this.profileImageDataUrl,
    required this.pointsBalance,
    required this.lifetimePoints,
    required this.eventsAttended,
    required this.createdAt,
    required this.updatedAt,
  });

  factory UserProfile.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot, {
    required String fallbackDisplayName,
  }) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return UserProfile(
      uid: snapshot.id,
      displayName:
          (data['displayName'] as String? ?? fallbackDisplayName).trim(),
      homeCity: (data['homeCity'] as String? ?? '').trim(),
      favoriteGenre: (data['favoriteGenre'] as String? ?? '').trim(),
      bio: (data['bio'] as String? ?? '').trim(),
      profileImageDataUrl:
          (data['profileImageDataUrl'] as String? ?? '').trim(),
      pointsBalance: _parseInt(data['pointsBalance']),
      lifetimePoints: _parseInt(data['lifetimePoints']),
      eventsAttended: _parseInt(data['eventsAttended']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String uid;
  final String displayName;
  final String homeCity;
  final String favoriteGenre;
  final String bio;
  final String profileImageDataUrl;
  final int pointsBalance;
  final int lifetimePoints;
  final int eventsAttended;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Uint8List? get profileImageBytes => decodeDataUrl(profileImageDataUrl);

  String get tierName {
    if (lifetimePoints >= 1000) {
      return 'Legend';
    }
    if (lifetimePoints >= 500) {
      return 'Gold';
    }
    if (lifetimePoints >= 200) {
      return 'Silver';
    }
    return 'Bronze';
  }

  int? get nextTierThreshold {
    if (lifetimePoints < 200) {
      return 200;
    }
    if (lifetimePoints < 500) {
      return 500;
    }
    if (lifetimePoints < 1000) {
      return 1000;
    }
    return null;
  }

  int get pointsToNextTier {
    final int? next = nextTierThreshold;
    if (next == null) {
      return 0;
    }
    return next - lifetimePoints;
  }

  double get tierProgress {
    final int? next = nextTierThreshold;
    if (next == null) {
      return 1;
    }

    final int floor;
    if (lifetimePoints >= 500) {
      floor = 500;
    } else if (lifetimePoints >= 200) {
      floor = 200;
    } else {
      floor = 0;
    }

    final int span = next - floor;
    if (span <= 0) {
      return 1;
    }
    final double progress = (lifetimePoints - floor) / span;
    return progress.clamp(0, 1);
  }
}

class RewardItem {
  RewardItem({
    required this.id,
    required this.name,
    required this.description,
    required this.pointsCost,
    required this.isActive,
    required this.inventory,
    required this.imageDataUrl,
    required this.category,
  });

  factory RewardItem.fromSnapshot(
      DocumentSnapshot<Map<String, dynamic>> snapshot) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return RewardItem(
      id: snapshot.id,
      name: (data['name'] as String? ?? 'Reward').trim(),
      description: (data['description'] as String? ?? '').trim(),
      pointsCost: _parseInt(data['pointsCost']),
      isActive: data['isActive'] as bool? ?? true,
      inventory: _parseNullableInt(data['inventory']),
      imageDataUrl: (data['imageDataUrl'] as String? ?? '').trim(),
      category: (data['category'] as String? ?? '').trim(),
    );
  }

  final String id;
  final String name;
  final String description;
  final int pointsCost;
  final bool isActive;
  final int? inventory;
  final String imageDataUrl;
  final String category;

  Uint8List? get imageBytes => decodeDataUrl(imageDataUrl);
}

class PointsTransaction {
  PointsTransaction({
    required this.id,
    required this.type,
    required this.reason,
    required this.pointsDelta,
    required this.createdAt,
    required this.referenceId,
  });

  factory PointsTransaction.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return PointsTransaction(
      id: snapshot.id,
      type: (data['type'] as String? ?? 'activity').trim(),
      reason: (data['reason'] as String? ?? 'Account activity').trim(),
      pointsDelta: _parseInt(data['pointsDelta']),
      createdAt: _parseTimestamp(data['createdAt']),
      referenceId: (data['referenceId'] as String? ?? '').trim(),
    );
  }

  final String id;
  final String type;
  final String reason;
  final int pointsDelta;
  final DateTime? createdAt;
  final String referenceId;
}

class EventQrCode {
  EventQrCode({
    required this.id,
    required this.eventName,
    required this.code,
    required this.pointsAwarded,
    required this.isActive,
    required this.notes,
    required this.totalClaims,
    required this.createdAt,
    required this.updatedAt,
  });

  factory EventQrCode.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return EventQrCode(
      id: snapshot.id,
      eventName: (data['eventName'] as String? ?? '').trim(),
      code: (data['code'] as String? ?? '').trim().toUpperCase(),
      pointsAwarded: _parseInt(data['pointsAwarded']),
      isActive: data['isActive'] as bool? ?? true,
      notes: (data['notes'] as String? ?? '').trim(),
      totalClaims: _parseInt(data['totalClaims']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  final String id;
  final String eventName;
  final String code;
  final int pointsAwarded;
  final bool isActive;
  final String notes;
  final int totalClaims;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class EventQrClaimResult {
  EventQrClaimResult({
    required this.eventQrCodeId,
    required this.eventName,
    required this.pointsAwarded,
    required this.newPointsBalance,
  });

  final String eventQrCodeId;
  final String eventName;
  final int pointsAwarded;
  final int newPointsBalance;
}

class EventQrClaimRecord {
  EventQrClaimRecord({
    required this.id,
    required this.eventQrCodeId,
    required this.eventName,
    required this.code,
    required this.uid,
    required this.claimedByDisplayName,
    required this.claimedByEmail,
    required this.pointsAwarded,
    required this.createdAt,
  });

  factory EventQrClaimRecord.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final Map<String, dynamic> data = snapshot.data() ?? <String, dynamic>{};
    return EventQrClaimRecord(
      id: snapshot.id,
      eventQrCodeId: (data['eventQrCodeId'] as String? ??
              snapshot.reference.parent.parent?.id ??
              '')
          .trim(),
      eventName: (data['eventName'] as String? ?? '').trim(),
      code: (data['code'] as String? ?? '').trim().toUpperCase(),
      uid: (data['uid'] as String? ?? '').trim(),
      claimedByDisplayName:
          (data['claimedByDisplayName'] as String? ?? '').trim(),
      claimedByEmail: (data['claimedByEmail'] as String? ?? '').trim(),
      pointsAwarded: _parseInt(data['pointsAwarded']),
      createdAt: _parseTimestamp(data['createdAt']),
    );
  }

  final String id;
  final String eventQrCodeId;
  final String eventName;
  final String code;
  final String uid;
  final String claimedByDisplayName;
  final String claimedByEmail;
  final int pointsAwarded;
  final DateTime? createdAt;
}

class UserProfileRepository {
  UserProfileRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  static const int _eventQrClaimCooldownSeconds = 30;
  static const int _eventQrDailyClaimLimit = 10;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _profiles =>
      _firestore.collection('userProfiles');

  CollectionReference<Map<String, dynamic>> get _rewardItems =>
      _firestore.collection('rewardItems');

  CollectionReference<Map<String, dynamic>> get _eventQrCodes =>
      _firestore.collection('eventQrCodes');

  Stream<UserProfile?> watchProfile({
    required String uid,
    required String fallbackDisplayName,
  }) {
    return _profiles.doc(uid).snapshots().map(
      (DocumentSnapshot<Map<String, dynamic>> snapshot) {
        if (!snapshot.exists) {
          return null;
        }
        return UserProfile.fromSnapshot(
          snapshot,
          fallbackDisplayName: fallbackDisplayName,
        );
      },
    );
  }

  Stream<List<RewardItem>> watchActiveRewardItems() {
    return _rewardItems.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<RewardItem> items = snapshot.docs
            .map(RewardItem.fromSnapshot)
            .where((RewardItem item) => item.isActive && item.pointsCost > 0)
            .toList();
        items.sort((RewardItem a, RewardItem b) {
          final int byCost = a.pointsCost.compareTo(b.pointsCost);
          if (byCost != 0) {
            return byCost;
          }
          return a.name.toLowerCase().compareTo(b.name.toLowerCase());
        });
        return items;
      },
    );
  }

  Stream<List<EventQrCode>> watchEventQrCodes({bool onlyActive = false}) {
    return _eventQrCodes.snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<EventQrCode> codes =
            snapshot.docs.map(EventQrCode.fromSnapshot).toList();

        final List<EventQrCode> filteredCodes = onlyActive
            ? codes.where((EventQrCode code) => code.isActive).toList()
            : codes;

        filteredCodes.sort((EventQrCode a, EventQrCode b) {
          if (a.isActive != b.isActive) {
            return a.isActive ? -1 : 1;
          }

          final DateTime aDate = a.updatedAt ??
              a.createdAt ??
              DateTime.fromMillisecondsSinceEpoch(0);
          final DateTime bDate = b.updatedAt ??
              b.createdAt ??
              DateTime.fromMillisecondsSinceEpoch(0);
          final int byDate = bDate.compareTo(aDate);
          if (byDate != 0) {
            return byDate;
          }

          return a.eventName.toLowerCase().compareTo(b.eventName.toLowerCase());
        });
        return filteredCodes;
      },
    );
  }

  Stream<List<PointsTransaction>> watchRecentTransactions({
    required String uid,
    int limit = 20,
  }) {
    return _profiles
        .doc(uid)
        .collection('pointsTransactions')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((QuerySnapshot<Map<String, dynamic>> snapshot) {
      return snapshot.docs.map(PointsTransaction.fromSnapshot).toList();
    });
  }

  Stream<List<EventQrClaimRecord>> watchRecentEventQrClaims({int limit = 200}) {
    return _firestore
        .collectionGroup('claims')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((QuerySnapshot<Map<String, dynamic>> snapshot) {
      return snapshot.docs
          .map(EventQrClaimRecord.fromSnapshot)
          .where((EventQrClaimRecord claim) =>
              claim.eventQrCodeId.isNotEmpty && claim.uid.isNotEmpty)
          .toList();
    });
  }

  Future<void> ensureProfileForUser(User user) async {
    final DocumentReference<Map<String, dynamic>> profileRef =
        _profiles.doc(user.uid);
    final DocumentSnapshot<Map<String, dynamic>> snapshot =
        await profileRef.get();
    final String fallbackName = _fallbackDisplayNameForUser(user);

    if (!snapshot.exists) {
      await profileRef.set(<String, dynamic>{
        'displayName': fallbackName,
        'homeCity': '',
        'favoriteGenre': '',
        'bio': '',
        'profileImageDataUrl': '',
        'pointsBalance': 0,
        'lifetimePoints': 0,
        'eventsAttended': 0,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return;
    }

    await profileRef.set(
      <String, dynamic>{
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> updateProfile({
    required String uid,
    required String displayName,
    required String homeCity,
    required String favoriteGenre,
    required String bio,
    required String profileImageDataUrl,
  }) async {
    await _profiles.doc(uid).set(
      <String, dynamic>{
        'displayName': displayName.trim(),
        'homeCity': homeCity.trim(),
        'favoriteGenre': favoriteGenre.trim(),
        'bio': bio.trim(),
        'profileImageDataUrl': profileImageDataUrl.trim(),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> redeemReward({
    required String uid,
    required RewardItem rewardItem,
  }) async {
    final DocumentReference<Map<String, dynamic>> profileRef =
        _profiles.doc(uid);
    final DocumentReference<Map<String, dynamic>> rewardRef =
        _rewardItems.doc(rewardItem.id);
    final CollectionReference<Map<String, dynamic>> transactionCollection =
        profileRef.collection('pointsTransactions');
    final CollectionReference<Map<String, dynamic>> redemptionCollection =
        profileRef.collection('redemptionRequests');

    await _firestore.runTransaction((Transaction transaction) async {
      final DocumentSnapshot<Map<String, dynamic>> profileSnapshot =
          await transaction.get(profileRef);
      if (!profileSnapshot.exists) {
        throw FirebaseException(
          plugin: 'cloud_firestore',
          code: 'profile-missing',
          message: 'User profile was not found.',
        );
      }

      final DocumentSnapshot<Map<String, dynamic>> rewardSnapshot =
          await transaction.get(rewardRef);
      if (!rewardSnapshot.exists) {
        throw FirebaseException(
          plugin: 'cloud_firestore',
          code: 'reward-missing',
          message: 'Reward item no longer exists.',
        );
      }

      final Map<String, dynamic> rewardData =
          rewardSnapshot.data() ?? <String, dynamic>{};
      final String rewardName =
          (rewardData['name'] as String? ?? rewardItem.name).trim();
      final bool isActive = rewardData['isActive'] as bool? ?? true;
      final int pointsCost = _parseInt(rewardData['pointsCost']);
      final int? inventory = _parseNullableInt(rewardData['inventory']);

      if (!isActive || pointsCost <= 0) {
        throw FirebaseException(
          plugin: 'cloud_firestore',
          code: 'reward-unavailable',
          message: 'This reward is not available right now.',
        );
      }

      if (inventory != null && inventory <= 0) {
        throw FirebaseException(
          plugin: 'cloud_firestore',
          code: 'out-of-stock',
          message: 'This reward is out of stock.',
        );
      }

      final Map<String, dynamic> profileData =
          profileSnapshot.data() ?? <String, dynamic>{};
      final int currentPoints = _parseInt(profileData['pointsBalance']);
      if (currentPoints < pointsCost) {
        throw FirebaseException(
          plugin: 'cloud_firestore',
          code: 'insufficient-points',
          message: 'Not enough Pluto Points for this reward.',
        );
      }

      transaction.set(
        profileRef,
        <String, dynamic>{
          'pointsBalance': currentPoints - pointsCost,
          'updatedAt': FieldValue.serverTimestamp(),
          'lastRedemptionAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      if (inventory != null) {
        transaction.set(
          rewardRef,
          <String, dynamic>{
            'inventory': inventory - 1,
            'updatedAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );
      }

      transaction.set(
        transactionCollection.doc(),
        <String, dynamic>{
          'type': 'redeem',
          'reason': 'Redeemed $rewardName',
          'pointsDelta': -pointsCost,
          'rewardItemId': rewardRef.id,
          'createdAt': FieldValue.serverTimestamp(),
        },
      );

      transaction.set(
        redemptionCollection.doc(),
        <String, dynamic>{
          'rewardItemId': rewardRef.id,
          'rewardName': rewardName,
          'pointsCost': pointsCost,
          'status': 'requested',
          'createdAt': FieldValue.serverTimestamp(),
        },
      );
    });
  }

  Future<EventQrClaimResult> claimEventQrCode({
    required User user,
    required String scannedCode,
  }) async {
    final String normalizedCode = scannedCode.trim().toUpperCase();
    if (normalizedCode.isEmpty) {
      throw FirebaseException(
        plugin: 'cloud_firestore',
        code: 'invalid-code',
        message: 'QR code value is empty.',
      );
    }

    await ensureProfileForUser(user);

    final QuerySnapshot<Map<String, dynamic>> matchingCodes =
        await _eventQrCodes
            .where('code', isEqualTo: normalizedCode)
            .limit(1)
            .get();
    if (matchingCodes.docs.isEmpty) {
      throw FirebaseException(
        plugin: 'cloud_firestore',
        code: 'qr-not-found',
        message: 'This QR code was not found.',
      );
    }

    final DocumentReference<Map<String, dynamic>> qrRef =
        matchingCodes.docs.first.reference;
    final DocumentReference<Map<String, dynamic>> profileRef =
        _profiles.doc(user.uid);
    final DocumentReference<Map<String, dynamic>> rateLimitRef =
        profileRef.collection('claimRateLimits').doc('eventQr');
    final CollectionReference<Map<String, dynamic>> transactionCollection =
        profileRef.collection('pointsTransactions');
    final DateTime nowUtc = DateTime.now().toUtc();
    final String claimDayKey = _utcDayKey(nowUtc);

    return _firestore.runTransaction(
      (Transaction transaction) async {
        final DocumentSnapshot<Map<String, dynamic>> qrSnapshot =
            await transaction.get(qrRef);
        if (!qrSnapshot.exists) {
          throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'qr-not-found',
            message: 'This QR code was not found.',
          );
        }

        final Map<String, dynamic> qrData =
            qrSnapshot.data() ?? <String, dynamic>{};
        final String eventName =
            (qrData['eventName'] as String? ?? 'Event Check-In').trim();
        final bool isActive = qrData['isActive'] as bool? ?? true;
        final int pointsAwarded = _parseInt(qrData['pointsAwarded']);
        final DateTime? expiresAt = _parseTimestamp(qrData['expiresAt']);

        if (!isActive) {
          throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'qr-inactive',
            message: 'This event QR code is not active.',
          );
        }

        if (pointsAwarded <= 0) {
          throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'invalid-points',
            message:
                'This event QR code has invalid Pluto Points configuration.',
          );
        }

        if (expiresAt != null && DateTime.now().isAfter(expiresAt)) {
          throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'qr-expired',
            message: 'This event QR code has expired.',
          );
        }

        final DocumentReference<Map<String, dynamic>> claimRef =
            qrRef.collection('claims').doc(user.uid);
        final DocumentSnapshot<Map<String, dynamic>> claimSnapshot =
            await transaction.get(claimRef);
        if (claimSnapshot.exists) {
          throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'already-claimed',
            message: 'You already claimed Pluto Points for this event.',
          );
        }

        final DocumentSnapshot<Map<String, dynamic>> profileSnapshot =
            await transaction.get(profileRef);
        final DocumentSnapshot<Map<String, dynamic>> rateLimitSnapshot =
            await transaction.get(rateLimitRef);
        final Map<String, dynamic> profileData =
            profileSnapshot.data() ?? <String, dynamic>{};
        final Map<String, dynamic> rateLimitData =
            rateLimitSnapshot.data() ?? <String, dynamic>{};

        final String storedDayKey =
            (rateLimitData['dayKey'] as String? ?? '').trim();
        final int claimsToday = storedDayKey == claimDayKey
            ? _parseInt(rateLimitData['claimsToday'])
            : 0;
        if (claimsToday >= _eventQrDailyClaimLimit) {
          throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'daily-claim-limit',
            message:
                'You reached the daily event QR claim limit. Please try again tomorrow.',
          );
        }

        final DateTime? lastClaimAt =
            _parseTimestamp(rateLimitData['lastClaimAt']);
        if (lastClaimAt != null) {
          final int secondsSinceLastClaim =
              nowUtc.difference(lastClaimAt.toUtc()).inSeconds;
          if (secondsSinceLastClaim < _eventQrClaimCooldownSeconds) {
            final int waitSeconds =
                _eventQrClaimCooldownSeconds - secondsSinceLastClaim;
            throw FirebaseException(
              plugin: 'cloud_firestore',
              code: 'claim-cooldown',
              message:
                  'Please wait $waitSeconds seconds before claiming another event QR code.',
            );
          }
        }

        final int currentBalance = _parseInt(profileData['pointsBalance']);
        final int currentLifetimePoints =
            _parseInt(profileData['lifetimePoints']);
        final int currentEventsAttended =
            _parseInt(profileData['eventsAttended']);
        final int newBalance = currentBalance + pointsAwarded;
        final int newLifetimePoints = currentLifetimePoints + pointsAwarded;
        final int newEventsAttended = currentEventsAttended + 1;

        final String fallbackName = _fallbackDisplayNameForUser(user);
        final String normalizedEmail = (user.email ?? '').trim();
        final Map<String, dynamic> profilePayload = <String, dynamic>{
          'pointsBalance': newBalance,
          'lifetimePoints': newLifetimePoints,
          'eventsAttended': newEventsAttended,
          'updatedAt': FieldValue.serverTimestamp(),
          'lastAttendanceAt': FieldValue.serverTimestamp(),
        };

        if (!profileSnapshot.exists) {
          profilePayload.addAll(<String, dynamic>{
            'displayName': fallbackName,
            'homeCity': '',
            'favoriteGenre': '',
            'bio': '',
            'profileImageDataUrl': '',
            'createdAt': FieldValue.serverTimestamp(),
          });
        }

        transaction.set(
          profileRef,
          profilePayload,
          SetOptions(merge: true),
        );

        transaction.set(
          claimRef,
          <String, dynamic>{
            'uid': user.uid,
            'eventQrCodeId': qrRef.id,
            'eventName': eventName,
            'pointsAwarded': pointsAwarded,
            'code': normalizedCode,
            'claimedByDisplayName': fallbackName,
            'claimedByEmail': normalizedEmail,
            'createdAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );

        final Map<String, dynamic> rateLimitPayload = <String, dynamic>{
          'dayKey': claimDayKey,
          'claimsToday': claimsToday + 1,
          'lastClaimAt': FieldValue.serverTimestamp(),
          'cooldownSeconds': _eventQrClaimCooldownSeconds,
          'dailyClaimLimit': _eventQrDailyClaimLimit,
          'updatedAt': FieldValue.serverTimestamp(),
        };
        if (!rateLimitSnapshot.exists) {
          rateLimitPayload['createdAt'] = FieldValue.serverTimestamp();
        }
        transaction.set(
          rateLimitRef,
          rateLimitPayload,
          SetOptions(merge: true),
        );

        transaction.set(
          qrRef,
          <String, dynamic>{
            'totalClaims': _parseInt(qrData['totalClaims']) + 1,
            'updatedAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );

        transaction.set(
          transactionCollection.doc(),
          <String, dynamic>{
            'type': 'attendance',
            'reason': 'Event check-in: $eventName',
            'pointsDelta': pointsAwarded,
            'referenceId': qrRef.id,
            'createdAt': FieldValue.serverTimestamp(),
          },
        );

        return EventQrClaimResult(
          eventQrCodeId: qrRef.id,
          eventName: eventName,
          pointsAwarded: pointsAwarded,
          newPointsBalance: newBalance,
        );
      },
    );
  }

  String _fallbackDisplayNameForUser(User user) {
    final String displayName = (user.displayName ?? '').trim();
    if (displayName.isNotEmpty) {
      return displayName;
    }

    final String email = (user.email ?? '').trim();
    if (email.isEmpty || !email.contains('@')) {
      return 'Pluto Member';
    }

    final String localPart = email.split('@').first.trim();
    if (localPart.isEmpty) {
      return 'Pluto Member';
    }

    return localPart;
  }
}

Uint8List? decodeDataUrl(String dataUrl) {
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

String encodeDataUrl({
  required Uint8List bytes,
  required String mimeType,
}) {
  return 'data:$mimeType;base64,${base64Encode(bytes)}';
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

int? _parseNullableInt(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String) {
    return int.tryParse(value);
  }
  return null;
}

DateTime? _parseTimestamp(dynamic value) {
  if (value is Timestamp) {
    return value.toDate();
  }
  return null;
}

String _utcDayKey(DateTime value) {
  final DateTime utc = value.toUtc();
  return '${utc.year}-${_twoDigits(utc.month)}-${_twoDigits(utc.day)}';
}

String _twoDigits(int value) {
  if (value >= 10) {
    return '$value';
  }
  return '0$value';
}
