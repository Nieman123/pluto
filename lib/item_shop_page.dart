import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

import 'user_profile_repository.dart';

class ItemShopPage extends StatefulWidget {
  const ItemShopPage({Key? key}) : super(key: key);

  @override
  State<ItemShopPage> createState() => _ItemShopPageState();
}

class _ItemShopPageState extends State<ItemShopPage> {
  final UserProfileRepository _profileRepository = UserProfileRepository();

  String? _redeemingRewardId;
  String _statusMessage = '';
  String? _ensureProfileUid;
  Future<void>? _ensureProfileFuture;

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
    _ensureProfileFuture = _profileRepository.ensureProfileForUser(user);
    return _ensureProfileFuture!;
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
            'Reward request submitted: ${rewardItem.name} (${rewardItem.pointsCost} Pluto Points).';
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

  void _showCannotAffordMessage({
    required RewardItem rewardItem,
    required int pointsBalance,
  }) {
    final int pointsNeeded = rewardItem.pointsCost - pointsBalance;
    final String message = pointsNeeded > 0
        ? 'Not enough Pluto Points for ${rewardItem.name}. You need $pointsNeeded more.'
        : 'Not enough Pluto Points for ${rewardItem.name}.';

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
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
                  'Sign in to open the Rewards Shop',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Redeem your Pluto Points for tickets, merch, and experiences.',
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

  Widget _buildPointsSummaryCard(UserProfile profile) {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'Your Rewards Wallet',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                _MetricChip(
                  label: 'Pluto Points Balance',
                  value: '${profile.pointsBalance}',
                ),
                _MetricChip(
                  label: 'Lifetime Pluto Points',
                  value: '${profile.lifetimePoints}',
                ),
                _MetricChip(
                  label: 'Tier',
                  value: profile.tierName,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShopCard({
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
                  'Rewards Shop',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Redeem Pluto Points for tickets, merch, or special experiences.',
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
                      'No reward items yet.',
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
                                      'Cost: ${reward.pointsCost} Pluto Points'
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
                            style: canAfford
                                ? null
                                : ElevatedButton.styleFrom(
                                    backgroundColor: Colors.white24,
                                    foregroundColor: Colors.white60,
                                    elevation: 0,
                                  ),
                            onPressed: isRedeeming
                                ? null
                                : () {
                                    if (!canAfford) {
                                      _showCannotAffordMessage(
                                        rewardItem: reward,
                                        pointsBalance: profile.pointsBalance,
                                      );
                                      return;
                                    }
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
                                      : 'Not Enough Pluto Points',
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

  Widget _buildShopContent({
    required User user,
    required UserProfile profile,
  }) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        if (constraints.maxWidth < 1100) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              _buildPointsSummaryCard(profile),
              const SizedBox(height: 14),
              _buildShopCard(user: user, profile: profile),
            ],
          );
        }

        return Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                flex: 4,
                child: SingleChildScrollView(
                  child: _buildPointsSummaryCard(profile),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                flex: 8,
                child: SingleChildScrollView(
                  child: _buildShopCard(user: user, profile: profile),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rewards Shop'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/'),
            child: const Text('Home'),
          ),
          TextButton(
            onPressed: () => context.go('/profile'),
            child: const Text('Profile'),
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

                      return _buildShopContent(user: user, profile: profile);
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
