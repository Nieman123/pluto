import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'src/app_build_info.dart';
import 'src/background/pluto_background.dart';
import 'src/email_verification.dart';
import 'src/google_auth.dart';
import 'src/legal_links.dart';
import 'src/nav_bar/nav_bar.dart';
import 'src/profile_identity_card.dart';
import 'src/theme/pluto_ui.dart';
import 'user_profile_repository.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({Key? key}) : super(key: key);

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final UserProfileRepository _profileRepository = UserProfileRepository();

  bool _isSigningOut = false;

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

  Future<void> _signOut() async {
    if (_isSigningOut) return;
    final GoRouter router = GoRouter.of(context);
    setState(() => _isSigningOut = true);
    try {
      await signOutOfPluto();
      router.go('/sign-on');
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not sign out. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSigningOut = false);
    }
  }

  Widget _buildSignedOutState() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: Card(
          color: PlutoColors.surface,
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
                  'Your profile tracks attendance Pluto Points, rewards, and redemption history.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () => context.go('/sign-on'),
                  child: const Text('Go To Sign On'),
                ),
                LegalLinks(
                    includeDeletion: true,
                    onDeleteAccount: () => context.go('/delete-account')),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildProfileSummary(
          {required User user, required UserProfile profile}) =>
      Column(children: [
        ProfileIdentityCard(
            profile: profile,
            photoUrl: user.photoURL,
            onEdit: () => context.go('/profile/edit')),
        EmailVerificationPanel(key: ValueKey(user.uid), user: user),
      ]);

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
      color: PlutoColors.surface,
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
                  label: 'Pluto Points Balance',
                  value: '${profile.pointsBalance}',
                ),
                _MetricChip(
                  label: 'Lifetime Pluto Points',
                  value: '${profile.lifetimePoints}',
                ),
                _MetricChip(
                  label: 'Events Attended',
                  value: '${profile.eventsAttended}',
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                ElevatedButton(
                  onPressed: () => context.go('/scan-qr'),
                  child: const Text('Scan Event QR'),
                ),
                OutlinedButton(
                  onPressed: () => context.go('/shop'),
                  child: const Text('Open Rewards Shop'),
                ),
              ],
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
                  : '${profile.pointsToNextTier} Pluto Points to next tier ($nextTier)',
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
                'Attend events and earn Pluto Points to unlock badges.',
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

  Widget _buildPointsHistoryCard(User user) {
    return Card(
      color: PlutoColors.surface,
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
                  'Pluto Points History',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Attendance Pluto Points, redemptions, and adjustments appear here.',
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
                      'No Pluto Points activity yet.',
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
                    color: const Color(0xFF2B2038),
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
              PlutoEntrance(
                  child: _buildProfileSummary(user: user, profile: profile)),
              const SizedBox(height: 14),
              PlutoEntrance(child: _buildTierAndPointsCard(profile)),
              const SizedBox(height: 14),
              PlutoEntrance(child: _buildPointsHistoryCard(user)),
              const SizedBox(height: 14),
              LegalLinks(
                  includeDeletion: true,
                  onDeleteAccount: () => context.go('/delete-account')),
              const AppBuildInfo(),
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
                      _buildProfileSummary(user: user, profile: profile),
                      const SizedBox(height: 14),
                      _buildTierAndPointsCard(profile),
                      const SizedBox(height: 14),
                      LegalLinks(
                          includeDeletion: true,
                          onDeleteAccount: () => context.go('/delete-account')),
                      const AppBuildInfo(),
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

  Widget _buildStandaloneScaffold(Widget body) {
    return Scaffold(
      appBar: const NavBar(isDarkModeBtnVisible: true),
      body: Stack(
        children: <Widget>[
          const PlutoBackground(),
          body,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.userChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
        if (authSnapshot.connectionState == ConnectionState.waiting &&
            !authSnapshot.hasData) {
          return _buildStandaloneScaffold(
            const Center(child: CircularProgressIndicator()),
          );
        }

        final User? user = authSnapshot.data;
        if (user == null) {
          return _buildStandaloneScaffold(_buildSignedOutState());
        }

        return Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: <Widget>[
                  const Expanded(
                    child: Text(
                      'My Profile',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton.icon(
                    onPressed: _isSigningOut ? null : _signOut,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                    ),
                    icon: const Icon(Icons.logout),
                    label: Text(_isSigningOut ? 'Signing out...' : 'Sign Out'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: FutureBuilder<void>(
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
                              ConnectionState.waiting &&
                          profileSnapshot.data?.uid != user.uid) {
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
                        return const Center(child: CircularProgressIndicator());
                      }

                      return Stack(
                        children: <Widget>[
                          Positioned.fill(
                            child: _buildProfileContent(
                              user: user,
                              profile: profile,
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
            ),
          ],
        );
      },
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
