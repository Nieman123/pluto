import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

import 'user_profile_repository.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({Key? key}) : super(key: key);

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final UserProfileRepository _profileRepository = UserProfileRepository();

  final TextEditingController _displayNameController = TextEditingController();
  final TextEditingController _homeCityController = TextEditingController();
  final TextEditingController _favoriteGenreController =
      TextEditingController();
  final TextEditingController _bioController = TextEditingController();

  String _profileImageDataUrl = '';
  bool _isSavingProfile = false;
  String? _redeemingRewardId;
  String _statusMessage = '';

  String? _profileHydratedForUid;
  String? _ensureProfileUid;
  Future<void>? _ensureProfileFuture;

  @override
  void dispose() {
    _displayNameController.dispose();
    _homeCityController.dispose();
    _favoriteGenreController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: const TextStyle(color: Colors.white70),
      border: const OutlineInputBorder(),
      enabledBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Colors.white54),
      ),
      focusedBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Colors.white),
      ),
    );
  }

  String _fallbackDisplayNameForUser(User user) {
    final String userDisplayName = (user.displayName ?? '').trim();
    if (userDisplayName.isNotEmpty) {
      return userDisplayName;
    }

    final String email = (user.email ?? '').trim();
    if (!email.contains('@')) {
      return 'Pluto Member';
    }
    final String localPart = email.split('@').first.trim();
    if (localPart.isEmpty) {
      return 'Pluto Member';
    }
    return localPart;
  }

  Future<void> _ensureProfileExists(User user) {
    if (_ensureProfileUid == user.uid && _ensureProfileFuture != null) {
      return _ensureProfileFuture!;
    }

    _ensureProfileUid = user.uid;
    _profileHydratedForUid = null;
    _ensureProfileFuture = _profileRepository.ensureProfileForUser(user);
    return _ensureProfileFuture!;
  }

  void _hydrateFormFromProfileIfNeeded({
    required User user,
    required UserProfile profile,
  }) {
    if (_profileHydratedForUid == user.uid) {
      return;
    }

    _displayNameController.text = profile.displayName;
    _homeCityController.text = profile.homeCity;
    _favoriteGenreController.text = profile.favoriteGenre;
    _bioController.text = profile.bio;
    _profileImageDataUrl = profile.profileImageDataUrl;
    _profileHydratedForUid = user.uid;
  }

  Future<void> _pickProfileImage() async {
    final FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: <String>['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) {
      return;
    }

    final PlatformFile file = result.files.first;
    final Uint8List? fileBytes = file.bytes;
    if (fileBytes == null) {
      setState(() {
        _statusMessage = 'Could not read selected file bytes.';
      });
      return;
    }

    if (fileBytes.lengthInBytes > 700000) {
      setState(() {
        _statusMessage =
            'Image too large for Firestore profile storage. Please pick a smaller file.';
      });
      return;
    }

    final String mimeType = _mimeTypeForExtension(file.extension ?? '');
    setState(() {
      _profileImageDataUrl =
          encodeDataUrl(bytes: fileBytes, mimeType: mimeType);
      _statusMessage = 'Profile picture selected.';
    });
  }

  Future<void> _saveProfile(User user) async {
    if (_isSavingProfile) {
      return;
    }

    setState(() {
      _isSavingProfile = true;
      _statusMessage = '';
    });

    try {
      await _profileRepository.updateProfile(
        uid: user.uid,
        displayName: _displayNameController.text,
        homeCity: _homeCityController.text,
        favoriteGenre: _favoriteGenreController.text,
        bio: _bioController.text,
        profileImageDataUrl: _profileImageDataUrl,
      );

      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Profile saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save profile: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingProfile = false;
        });
      }
    }
  }

  Future<void> _redeemReward({
    required User user,
    required RewardItem rewardItem,
  }) async {
    if (_redeemingRewardId != null) {
      return;
    }

    setState(() {
      _redeemingRewardId = rewardItem.id;
      _statusMessage = '';
    });

    try {
      await _profileRepository.redeemReward(
        uid: user.uid,
        rewardItem: rewardItem,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage =
            'Reward request submitted: ${rewardItem.name} (${rewardItem.pointsCost} points).';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Redeem failed: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _redeemingRewardId = null;
        });
      }
    }
  }

  Widget _buildSignedOutState() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: Card(
          color: Colors.black.withValues(alpha: 0.45),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Sign in to view your profile',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Your profile tracks attendance points, rewards, and redemption history.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () => context.go('/sign-on'),
                  child: const Text('Go To Sign On'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildProfileEditorCard({
    required User user,
    required UserProfile profile,
  }) {
    final Uint8List? profileBytes = decodeDataUrl(_profileImageDataUrl);

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'My Profile',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 18,
              runSpacing: 12,
              children: <Widget>[
                CircleAvatar(
                  radius: 54,
                  backgroundColor: Colors.white12,
                  backgroundImage:
                      profileBytes != null ? MemoryImage(profileBytes) : null,
                  child: profileBytes == null
                      ? const Icon(
                          Icons.person,
                          color: Colors.white70,
                          size: 48,
                        )
                      : null,
                ),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: <Widget>[
                    ElevatedButton(
                      onPressed: _pickProfileImage,
                      child: const Text('Upload Picture'),
                    ),
                    OutlinedButton(
                      onPressed: () {
                        setState(() {
                          _profileImageDataUrl = '';
                          _statusMessage = 'Profile picture removed.';
                        });
                      },
                      child: const Text('Remove Picture'),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _displayNameController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Display Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _homeCityController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Home City'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _favoriteGenreController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Favorite Genre'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _bioController,
              maxLines: 3,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Bio'),
            ),
            const SizedBox(height: 12),
            SelectableText(
              'Signed in as: ${user.email ?? 'No email'}',
              style: const TextStyle(color: Colors.white70),
            ),
            SelectableText(
              'UID: ${profile.uid}',
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              onPressed: _isSavingProfile ? null : () => _saveProfile(user),
              child: Text(_isSavingProfile ? 'Saving...' : 'Save Profile'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTierAndPointsCard(UserProfile profile) {
    final int? nextTier = profile.nextTierThreshold;
    final Color tierColor;
    switch (profile.tierName) {
      case 'Legend':
        tierColor = Colors.purpleAccent;
        break;
      case 'Gold':
        tierColor = Colors.amber;
        break;
      case 'Silver':
        tierColor = Colors.blueGrey.shade200;
        break;
      default:
        tierColor = Colors.orange.shade300;
    }

    final List<String> badges = <String>[
      if (profile.eventsAttended >= 1) 'First Orbit',
      if (profile.eventsAttended >= 5) 'Frequent Flyer',
      if (profile.eventsAttended >= 12) 'Core Community',
      if (profile.lifetimePoints >= 500) 'Gold Collector',
      if (profile.lifetimePoints >= 1000) 'Legend Status',
    ];

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'Rewards Progress',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 18,
              runSpacing: 10,
              children: <Widget>[
                _MetricChip(
                  label: 'Points Balance',
                  value: '${profile.pointsBalance}',
                ),
                _MetricChip(
                  label: 'Lifetime Points',
                  value: '${profile.lifetimePoints}',
                ),
                _MetricChip(
                  label: 'Events Attended',
                  value: '${profile.eventsAttended}',
                ),
              ],
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => context.go('/scan-qr'),
              child: const Text('Scan Event QR'),
            ),
            const SizedBox(height: 14),
            Text(
              'Tier: ${profile.tierName}',
              style: TextStyle(
                color: tierColor,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: profile.tierProgress,
              minHeight: 9,
              backgroundColor: Colors.white24,
              color: tierColor,
            ),
            const SizedBox(height: 8),
            Text(
              nextTier == null
                  ? 'Top tier unlocked.'
                  : '${profile.pointsToNextTier} points to next tier ($nextTier)',
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            const Text(
              'Badges',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            if (badges.isEmpty)
              const Text(
                'Attend events and earn points to unlock badges.',
                style: TextStyle(color: Colors.white70),
              ),
            if (badges.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: badges
                    .map(
                      (String badge) => Chip(
                        backgroundColor: Colors.white12,
                        label: Text(
                          badge,
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    )
                    .toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRewardShopCard({
    required User user,
    required UserProfile profile,
  }) {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<RewardItem>>(
          stream: _profileRepository.watchActiveRewardItems(),
          builder:
              (BuildContext context, AsyncSnapshot<List<RewardItem>> snapshot) {
            final List<RewardItem> rewards = snapshot.data ?? <RewardItem>[];

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Item Shop',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Redeem points for tickets, merch, or special experiences.',
                  style: TextStyle(color: Colors.white70),
                ),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const Padding(
                    padding: EdgeInsets.only(top: 16),
                    child: CircularProgressIndicator(),
                  ),
                if (snapshot.hasError)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      'Unable to load rewards: ${snapshot.error}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ),
                if (!snapshot.hasError &&
                    snapshot.connectionState != ConnectionState.waiting &&
                    rewards.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                      'No reward items yet. Add docs in rewardItems collection with fields: name, description, pointsCost, isActive.',
                      style: TextStyle(color: Colors.white70),
                    ),
                  ),
                ...rewards.map((RewardItem reward) {
                  final bool canAfford =
                      profile.pointsBalance >= reward.pointsCost;
                  final bool isRedeeming = _redeemingRewardId == reward.id;

                  return Card(
                    color: Colors.black.withValues(alpha: 0.35),
                    margin: const EdgeInsets.only(top: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Wrap(
                            spacing: 12,
                            runSpacing: 10,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: <Widget>[
                              if (reward.imageBytes != null)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.memory(
                                    reward.imageBytes!,
                                    width: 110,
                                    height: 110,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              SizedBox(
                                width: 420,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    Text(
                                      reward.name,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 19,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    if (reward.category.isNotEmpty)
                                      Text(
                                        reward.category,
                                        style: const TextStyle(
                                            color: Colors.white60),
                                      ),
                                    if (reward.description.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(
                                          reward.description,
                                          style: const TextStyle(
                                            color: Colors.white70,
                                          ),
                                        ),
                                      ),
                                    const SizedBox(height: 6),
                                    Text(
                                      'Cost: ${reward.pointsCost} pts'
                                      '${reward.inventory == null ? '' : ' | Inventory: ${reward.inventory}'}',
                                      style: const TextStyle(
                                          color: Colors.white70),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ElevatedButton(
                            onPressed: (!canAfford || isRedeeming)
                                ? null
                                : () {
                                    _redeemReward(
                                      user: user,
                                      rewardItem: reward,
                                    );
                                  },
                            child: Text(
                              isRedeeming
                                  ? 'Redeeming...'
                                  : canAfford
                                      ? 'Redeem'
                                      : 'Not Enough Points',
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildPointsHistoryCard(User user) {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<PointsTransaction>>(
          stream: _profileRepository.watchRecentTransactions(uid: user.uid),
          builder: (BuildContext context,
              AsyncSnapshot<List<PointsTransaction>> snapshot) {
            final List<PointsTransaction> transactions =
                snapshot.data ?? <PointsTransaction>[];

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Points History',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Attendance points, redemptions, and adjustments appear here.',
                  style: TextStyle(color: Colors.white70),
                ),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const Padding(
                    padding: EdgeInsets.only(top: 14),
                    child: CircularProgressIndicator(),
                  ),
                if (snapshot.hasError)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      'Could not load history: ${snapshot.error}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ),
                if (!snapshot.hasError &&
                    snapshot.connectionState != ConnectionState.waiting &&
                    transactions.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                      'No points activity yet.',
                      style: TextStyle(color: Colors.white70),
                    ),
                  ),
                ...transactions.map((PointsTransaction transaction) {
                  final bool isGain = transaction.pointsDelta >= 0;
                  final Color valueColor =
                      isGain ? Colors.greenAccent : Colors.orangeAccent;
                  final String dateLabel = transaction.createdAt == null
                      ? 'Pending timestamp'
                      : DateFormat('yyyy-MM-dd HH:mm')
                          .format(transaction.createdAt!.toLocal());

                  return Card(
                    color: Colors.black.withValues(alpha: 0.35),
                    margin: const EdgeInsets.only(top: 10),
                    child: ListTile(
                      title: Text(
                        transaction.reason,
                        style: const TextStyle(color: Colors.white),
                      ),
                      subtitle: Text(
                        dateLabel,
                        style: const TextStyle(color: Colors.white70),
                      ),
                      trailing: Text(
                        '${isGain ? '+' : ''}${transaction.pointsDelta}',
                        style: TextStyle(
                          color: valueColor,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildProfileContent({
    required User user,
    required UserProfile profile,
  }) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        if (constraints.maxWidth < 1100) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              _buildProfileEditorCard(user: user, profile: profile),
              const SizedBox(height: 14),
              _buildTierAndPointsCard(profile),
              const SizedBox(height: 14),
              _buildRewardShopCard(user: user, profile: profile),
              const SizedBox(height: 14),
              _buildPointsHistoryCard(user),
            ],
          );
        }

        return Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                flex: 5,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      _buildProfileEditorCard(user: user, profile: profile),
                      const SizedBox(height: 14),
                      _buildTierAndPointsCard(profile),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                flex: 7,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      _buildRewardShopCard(user: user, profile: profile),
                      const SizedBox(height: 14),
                      _buildPointsHistoryCard(user),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _mimeTypeForExtension(String extension) {
    switch (extension.toLowerCase()) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Profile'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/'),
            child: const Text('Home'),
          ),
          TextButton(
            onPressed: () => context.go('/sign-on'),
            child: const Text('Sign On'),
          ),
          TextButton(
            onPressed: () => context.go('/scan-qr'),
            child: const Text('Scan QR'),
          ),
        ],
      ),
      body: Stack(
        children: <Widget>[
          const PlasmaRenderer(
            color: Color.fromARGB(68, 85, 0, 165),
            blur: 0.5,
            blendMode: BlendMode.plus,
            particleType: ParticleType.atlas,
            variation1: 1,
          ),
          StreamBuilder<User?>(
            stream: FirebaseAuth.instance.authStateChanges(),
            builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
              if (authSnapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              final User? user = authSnapshot.data;
              if (user == null) {
                return _buildSignedOutState();
              }

              return FutureBuilder<void>(
                future: _ensureProfileExists(user),
                builder:
                    (BuildContext context, AsyncSnapshot<void> ensureSnapshot) {
                  if (ensureSnapshot.connectionState ==
                      ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (ensureSnapshot.hasError) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          'Could not initialize profile: ${ensureSnapshot.error}',
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    );
                  }

                  return StreamBuilder<UserProfile?>(
                    stream: _profileRepository.watchProfile(
                      uid: user.uid,
                      fallbackDisplayName: _fallbackDisplayNameForUser(user),
                    ),
                    builder: (BuildContext context,
                        AsyncSnapshot<UserProfile?> profileSnapshot) {
                      if (profileSnapshot.connectionState ==
                          ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (profileSnapshot.hasError) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              'Could not load profile: ${profileSnapshot.error}',
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                        );
                      }

                      final UserProfile? profile = profileSnapshot.data;
                      if (profile == null) {
                        return const Center(
                          child: CircularProgressIndicator(),
                        );
                      }

                      _hydrateFormFromProfileIfNeeded(
                          user: user, profile: profile);
                      return _buildProfileContent(user: user, profile: profile);
                    },
                  );
                },
              );
            },
          ),
          if (_statusMessage.isNotEmpty)
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                margin: const EdgeInsets.all(18),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _statusMessage,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white10,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            style: const TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
