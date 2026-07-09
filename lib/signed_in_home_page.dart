import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'current_events_repository.dart';
import 'src/signed_in/signed_in_app_shell.dart';
import 'user_profile_repository.dart';

class SignedInHomePage extends StatelessWidget {
  SignedInHomePage({
    Key? key,
    required this.user,
  }) : super(key: key);

  final User user;
  final CurrentEventsRepository _eventsRepository = CurrentEventsRepository();
  final UserProfileRepository _profileRepository = UserProfileRepository();

  String _displayNameForUser(User user) {
    final String explicitName = (user.displayName ?? '').trim();
    if (explicitName.isNotEmpty) {
      return explicitName;
    }

    final String email = (user.email ?? '').trim();
    if (!email.contains('@')) {
      return 'Member';
    }
    final String localPart = email.split('@').first.trim();
    if (localPart.isEmpty) {
      return 'Member';
    }
    return localPart;
  }

  Future<void> _openLink(String url) async {
    final String normalizedUrl = url.trim();
    if (normalizedUrl.isEmpty) {
      return;
    }
    await launchUrlString(normalizedUrl, webOnlyWindowName: '_blank');
  }

  bool _isDarkTheme(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark;
  }

  Color _buttonBackground(BuildContext context) {
    return _isDarkTheme(context)
        ? const Color(0xFFF3EFF7)
        : const Color(0xFF121212);
  }

  Color _buttonForeground(BuildContext context) {
    return _isDarkTheme(context) ? const Color(0xFF6D55B4) : Colors.white;
  }

  ThemeData _pageTheme(BuildContext context) {
    final ThemeData baseTheme = Theme.of(context);
    final bool isDark = _isDarkTheme(context);

    return baseTheme.copyWith(
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _buttonBackground(context),
          foregroundColor: _buttonForeground(context),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: isDark ? Colors.white : const Color(0xFF121212),
          side: BorderSide(
            color: isDark
                ? Colors.white24
                : const Color(0xFF121212).withValues(alpha: 0.28),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  Widget _buildHeaderCard(BuildContext context) {
    final String displayName = _displayNameForUser(user);

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: <Widget>[
            Center(
              child: SizedBox(
                width: 144,
                height: 144,
                child: Image.asset(
                  'assets/experience/pluto-logo-small.webp',
                  fit: BoxFit.contain,
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Welcome back, $displayName',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 30,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Signed in as ${user.email ?? user.uid}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            _buildPointsOverview(context),
          ],
        ),
      ),
    );
  }

  Widget _buildPointsOverview(BuildContext context) {
    return FutureBuilder<void>(
      future: _profileRepository.ensureProfileForUser(user),
      builder: (BuildContext context, AsyncSnapshot<void> ensureSnapshot) {
        if (ensureSnapshot.hasError) {
          return const _DashboardStatusPanel(
            icon: Icons.error_outline,
            message: 'Could not initialize your Pluto Points.',
          );
        }

        if (ensureSnapshot.connectionState == ConnectionState.waiting) {
          return const _DashboardStatusPanel(
            icon: Icons.hourglass_empty,
            message: 'Loading Pluto Points...',
          );
        }

        return StreamBuilder<UserProfile?>(
          stream: _profileRepository.watchProfile(
            uid: user.uid,
            fallbackDisplayName: _displayNameForUser(user),
          ),
          builder:
              (BuildContext context, AsyncSnapshot<UserProfile?> snapshot) {
            if (snapshot.hasError) {
              return const _DashboardStatusPanel(
                icon: Icons.error_outline,
                message: 'Could not load your Pluto Points.',
              );
            }

            final UserProfile? profile = snapshot.data;
            if (snapshot.connectionState == ConnectionState.waiting ||
                profile == null) {
              return const _DashboardStatusPanel(
                icon: Icons.hourglass_empty,
                message: 'Loading Pluto Points...',
              );
            }

            return _DashboardPointsPanel(profile: profile);
          },
        );
      },
    );
  }

  Widget _buildEventRow(
    BuildContext context, {
    required CurrentEvent event,
  }) {
    final Uint8List? flyerBytes = event.flyerBytes;

    return Card(
      color: Colors.black.withValues(alpha: 0.35),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 12,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: flyerBytes == null
                  ? Container(
                      width: 96,
                      height: 96,
                      color: Colors.white10,
                      alignment: Alignment.center,
                      child: const Icon(
                        Icons.image_not_supported,
                        color: Colors.white54,
                      ),
                    )
                  : Image.memory(
                      flyerBytes,
                      width: 96,
                      height: 96,
                      fit: BoxFit.cover,
                    ),
            ),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                children: <Widget>[
                  Text(
                    event.title.isEmpty ? 'Upcoming Event' : event.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (event.details.trim().isNotEmpty) ...<Widget>[
                    const SizedBox(height: 4),
                    Text(
                      event.details,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      if (event.ticketUrl.trim().isNotEmpty)
                        ElevatedButton(
                          onPressed: () => _openLink(event.ticketUrl),
                          child: const Text('Tickets'),
                        ),
                      OutlinedButton(
                        onPressed: () => context.go('/scan-qr'),
                        child: const Text('Scan At Venue'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUpcomingEventsCard(BuildContext context) {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<CurrentEvent>>(
          stream: _eventsRepository.watchEvents(onlyActive: true),
          builder: (BuildContext context,
              AsyncSnapshot<List<CurrentEvent>> snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const SizedBox(
                height: 180,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (snapshot.hasError) {
              return Center(
                child: Text(
                  'Could not load events: ${snapshot.error}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
              );
            }

            final List<CurrentEvent> events = snapshot.data ?? <CurrentEvent>[];
            if (events.isEmpty) {
              return const Column(
                children: <Widget>[
                  Text(
                    'Upcoming Events',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'No active events right now. Check back soon.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              );
            }

            return Column(
              children: <Widget>[
                const Text(
                  'Upcoming Events',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                ...events
                    .map((CurrentEvent event) =>
                        _buildEventRow(context, event: event))
                    .toList(),
              ],
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: _pageTheme(context),
      child: SignedInAppShell(
        selectedTab: SignedInAppTab.dashboard,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            _buildHeaderCard(context),
            const SizedBox(height: 14),
            _buildUpcomingEventsCard(context),
          ],
        ),
      ),
    );
  }
}

class _DashboardPointsPanel extends StatelessWidget {
  const _DashboardPointsPanel({
    required this.profile,
  });

  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final int? nextTier = profile.nextTierThreshold;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white10,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        children: <Widget>[
          const Text(
            'Pluto Points',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${profile.pointsBalance}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 52,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 10,
            children: <Widget>[
              _DashboardMetric(
                label: 'Tier',
                value: profile.tierName,
              ),
              _DashboardMetric(
                label: 'Lifetime',
                value: '${profile.lifetimePoints}',
              ),
              _DashboardMetric(
                label: 'Events',
                value: '${profile.eventsAttended}',
              ),
            ],
          ),
          const SizedBox(height: 16),
          LinearProgressIndicator(
            value: profile.tierProgress,
            minHeight: 8,
            backgroundColor: Colors.white24,
            color: Colors.purpleAccent,
          ),
          const SizedBox(height: 8),
          Text(
            nextTier == null
                ? 'Top tier unlocked.'
                : '${profile.pointsToNextTier} Pluto Points to $nextTier lifetime points.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70),
          ),
        ],
      ),
    );
  }
}

class _DashboardMetric extends StatelessWidget {
  const _DashboardMetric({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 132,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.32),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: <Widget>[
          Text(
            value,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70),
          ),
        ],
      ),
    );
  }
}

class _DashboardStatusPanel extends StatelessWidget {
  const _DashboardStatusPanel({
    required this.icon,
    required this.message,
  });

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white10,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Icon(icon, color: Colors.white70),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
          ),
        ],
      ),
    );
  }
}
