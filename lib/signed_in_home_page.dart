import 'dart:async';
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'current_events_repository.dart';
import 'user_profile_repository.dart';

class _DashboardColors {
  const _DashboardColors._();

  static const Color ink = Color(0xFFF7F1FA);
  static const Color muted = Color(0xFFC9BECE);
  static const Color surface = Color(0xEB151019);
  static const Color surfaceStrong = Color(0xF21B1420);
  static const Color purple = Color(0xFFD9A7FF);
  static const Color orange = Color(0xFFFFB24D);
  static const Color green = Color(0xFFA8E8C3);
  static const Color rose = Color(0xFFFFA6BA);
  static const Color cyan = Color(0xFF8FDDE6);
}

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
    return localPart.isEmpty ? 'Member' : localPart;
  }

  Future<void> _openLink(String url) async {
    final String normalizedUrl = url.trim();
    if (normalizedUrl.isEmpty) {
      return;
    }
    await launchUrlString(normalizedUrl, webOnlyWindowName: '_blank');
  }

  ThemeData _pageTheme(BuildContext context) {
    final ThemeData baseTheme = Theme.of(context);
    return baseTheme.copyWith(
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _DashboardColors.purple,
          foregroundColor: const Color(0xFF211527),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: _DashboardColors.ink,
          side: BorderSide(
            color: _DashboardColors.purple.withValues(alpha: 0.32),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: _DashboardColors.orange,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildGreetingHeader(BuildContext context) {
    final String displayName = _displayNameForUser(user);
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final bool isCompact = constraints.maxWidth < 560;
        final double logoSize = isCompact ? 64 : 76;
        return Row(
          children: <Widget>[
            SizedBox(
              width: logoSize,
              height: logoSize,
              child: Image.asset(
                'assets/experience/pluto-logo-small.webp',
                fit: BoxFit.contain,
              ),
            ),
            SizedBox(width: isCompact ? 12 : 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text(
                    'MEMBER DASHBOARD',
                    style: TextStyle(
                      color: _DashboardColors.orange,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    'Welcome back, $displayName',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: _DashboardColors.ink,
                      fontSize: isCompact ? 25 : 30,
                      fontWeight: FontWeight.w800,
                      height: 1.12,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    user.email ?? 'Your Pluto home base',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _DashboardColors.muted,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
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
          return const _DashboardPanelSkeleton();
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
              return const _DashboardPanelSkeleton();
            }

            return _DashboardPointsPanel(
              profile: profile,
              onBrowseRewards: () => context.go('/shop'),
            );
          },
        );
      },
    );
  }

  Widget _buildOverview(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final Widget countdown = _ManaFestCountdownPanel(
          onOpenHub: () => context.go('/manafest'),
        );
        final Widget points = _buildPointsOverview(context);

        if (constraints.maxWidth < 860) {
          return Column(
            children: <Widget>[
              countdown,
              const SizedBox(height: 14),
              points,
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(flex: 3, child: countdown),
            const SizedBox(width: 16),
            Expanded(flex: 2, child: points),
          ],
        );
      },
    );
  }

  Widget _buildEventFlyer(CurrentEvent event, double size) {
    final Uint8List? flyerBytes = event.flyerBytes;
    if (flyerBytes != null) {
      return Image.memory(
        flyerBytes,
        width: size,
        height: size,
        fit: BoxFit.cover,
      );
    }

    if (event.isManaFest) {
      return Image.asset(
        'assets/events/Mana-Fest-2026-Flyer-half.webp',
        width: size,
        height: size,
        fit: BoxFit.cover,
      );
    }

    return Container(
      width: size,
      height: size,
      color: _DashboardColors.ink.withValues(alpha: 0.06),
      alignment: Alignment.center,
      child: const Icon(
        Icons.image_not_supported_outlined,
        color: _DashboardColors.muted,
      ),
    );
  }

  Widget _buildEventRow(
    BuildContext context, {
    required CurrentEvent event,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _DashboardColors.purple.withValues(alpha: 0.16),
        ),
      ),
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          final bool isCompact = constraints.maxWidth < 560;
          final double flyerSize = isCompact ? 88 : 106;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: _buildEventFlyer(event, flyerSize),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      event.title.isEmpty ? 'Upcoming Event' : event.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _DashboardColors.ink,
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        height: 1.2,
                      ),
                    ),
                    if (event.details.trim().isNotEmpty) ...<Widget>[
                      const SizedBox(height: 6),
                      Text(
                        event.details,
                        maxLines: isCompact ? 3 : 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: _DashboardColors.muted,
                          fontSize: 14,
                          height: 1.4,
                        ),
                      ),
                    ],
                    const SizedBox(height: 11),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        if (event.ticketUrl.trim().isNotEmpty)
                          ElevatedButton.icon(
                            onPressed: () => _openLink(event.ticketUrl),
                            icon: const Icon(
                              Icons.confirmation_number_outlined,
                              size: 18,
                            ),
                            label: const Text('Tickets'),
                          ),
                        if (event.isManaFest)
                          OutlinedButton.icon(
                            onPressed: () => context.go('/manafest'),
                            icon: const Icon(Icons.festival_outlined, size: 18),
                            label: const Text('Festival Hub'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildUpcomingEventsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Text(
          'ON THE CALENDAR',
          style: TextStyle(
            color: _DashboardColors.cyan,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 5),
        const Text(
          'More from Pluto',
          style: TextStyle(
            color: _DashboardColors.ink,
            fontSize: 25,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Other active events, drops, and gatherings beyond ManaFest.',
          style: TextStyle(
            color: _DashboardColors.muted,
            fontSize: 14,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 14),
        StreamBuilder<List<CurrentEvent>>(
          stream: _eventsRepository.watchEvents(onlyActive: true),
          builder: (BuildContext context,
              AsyncSnapshot<List<CurrentEvent>> snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const _DashboardEventSkeleton();
            }

            if (snapshot.hasError) {
              return const _DashboardStatusPanel(
                icon: Icons.event_busy_outlined,
                message: 'Could not load upcoming events.',
                minHeight: 130,
              );
            }

            final List<CurrentEvent> otherEvents =
                (snapshot.data ?? <CurrentEvent>[])
                    .where((CurrentEvent event) => !event.isManaFest)
                    .take(3)
                    .toList();

            if (otherEvents.isEmpty) {
              return const _DashboardEmptyState(
                icon: Icons.nights_stay_outlined,
                title: 'The next drop is being planned',
                body:
                    'ManaFest is the main event for now. New Pluto gatherings will appear here when they go live.',
              );
            }

            return Column(
              children: otherEvents
                  .map(
                    (CurrentEvent event) =>
                        _buildEventRow(context, event: event),
                  )
                  .toList(),
            );
          },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: _pageTheme(context),
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          final bool isCompact = constraints.maxWidth < 600;
          return ListView(
            padding: EdgeInsets.fromLTRB(
              isCompact ? 16 : 24,
              isCompact ? 16 : 24,
              isCompact ? 16 : 24,
              28,
            ),
            children: <Widget>[
              _buildGreetingHeader(context),
              SizedBox(height: isCompact ? 20 : 26),
              _buildOverview(context),
              const SizedBox(height: 16),
              _DashboardPrepBand(
                onOpenGuide: () => context.go('/manafest'),
                onScanQr: () => context.go('/scan-qr'),
              ),
              const SizedBox(height: 28),
              _buildUpcomingEventsSection(context),
            ],
          );
        },
      ),
    );
  }
}

class _ManaFestCountdownPanel extends StatefulWidget {
  const _ManaFestCountdownPanel({required this.onOpenHub});

  final VoidCallback onOpenHub;

  @override
  State<_ManaFestCountdownPanel> createState() =>
      _ManaFestCountdownPanelState();
}

class _ManaFestCountdownPanelState extends State<_ManaFestCountdownPanel> {
  static final DateTime _eventStart = DateTime(2026, 9, 18);
  static final DateTime _eventEnd = DateTime(2026, 9, 21);

  late DateTime _now;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) {
        setState(() => _now = DateTime.now());
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Widget _buildCountdown() {
    final bool isLive = !_now.isBefore(_eventStart) && _now.isBefore(_eventEnd);
    final bool hasEnded = !_now.isBefore(_eventEnd);

    if (isLive) {
      return const _CountdownMessage(
        icon: Icons.graphic_eq,
        title: 'ManaFest is happening now',
        body: 'Open the festival hub for the latest schedule and updates.',
        color: _DashboardColors.green,
      );
    }

    if (hasEnded) {
      return const _CountdownMessage(
        icon: Icons.favorite_outline,
        title: 'Until next time',
        body: 'Thanks for showing up and making ManaFest what it was.',
        color: _DashboardColors.rose,
      );
    }

    final Duration remaining = _eventStart.difference(_now);
    final int days = remaining.inDays;
    final int hours = remaining.inHours.remainder(24);
    final int minutes = remaining.inMinutes.remainder(60);

    return Semantics(
      liveRegion: true,
      label: '$days days, $hours hours, and $minutes minutes until ManaFest',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text(
            'FESTIVAL WEEKEND STARTS IN',
            style: TextStyle(
              color: _DashboardColors.muted,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 9),
          Row(
            children: <Widget>[
              Expanded(child: _CountdownUnit(value: days, label: 'Days')),
              const _CountdownDivider(),
              Expanded(child: _CountdownUnit(value: hours, label: 'Hours')),
              const _CountdownDivider(),
              Expanded(
                child: _CountdownUnit(value: minutes, label: 'Minutes'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return Padding(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Row(
            children: <Widget>[
              Icon(
                Icons.festival_outlined,
                color: _DashboardColors.orange,
                size: 18,
              ),
              SizedBox(width: 7),
              Text(
                'NEXT UP',
                style: TextStyle(
                  color: _DashboardColors.orange,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          const Text(
            'ManaFest 2026',
            style: TextStyle(
              color: _DashboardColors.ink,
              fontSize: 29,
              fontWeight: FontWeight.w800,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 10),
          const _DashboardMeta(
            icon: Icons.calendar_today_outlined,
            label: 'September 18-20, 2026',
          ),
          const SizedBox(height: 7),
          const _DashboardMeta(
            icon: Icons.location_on_outlined,
            label: 'Three Creeks Campground, Anderson, SC',
          ),
          const SizedBox(height: 18),
          _buildCountdown(),
          const SizedBox(height: 18),
          ElevatedButton.icon(
            onPressed: widget.onOpenHub,
            icon: const Icon(Icons.arrow_forward, size: 18),
            label: const Text('Open Festival Hub'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _DashboardColors.surfaceStrong,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _DashboardColors.orange.withValues(alpha: 0.25),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          if (constraints.maxWidth < 540) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                SizedBox(
                  height: 154,
                  child: Image.asset(
                    'assets/events/Mana-Fest-2026-Flyer-half.webp',
                    fit: BoxFit.cover,
                    alignment: const Alignment(0, -0.48),
                  ),
                ),
                _buildContent(),
              ],
            );
          }

          return SizedBox(
            height: 332,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Expanded(child: _buildContent()),
                SizedBox(
                  width: 205,
                  child: Image.asset(
                    'assets/events/Mana-Fest-2026-Flyer-half.webp',
                    fit: BoxFit.cover,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CountdownUnit extends StatelessWidget {
  const _CountdownUnit({required this.value, required this.label});

  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          value.toString().padLeft(2, '0'),
          style: const TextStyle(
            color: _DashboardColors.ink,
            fontSize: 28,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 1),
        Text(
          label,
          style: const TextStyle(
            color: _DashboardColors.muted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _CountdownDivider extends StatelessWidget {
  const _CountdownDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 42,
      margin: const EdgeInsets.symmetric(horizontal: 12),
      color: _DashboardColors.ink.withValues(alpha: 0.12),
    );
  }
}

class _CountdownMessage extends StatelessWidget {
  const _CountdownMessage({
    required this.icon,
    required this.title,
    required this.body,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String body;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icon, color: color, size: 22),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: const TextStyle(
                  color: _DashboardColors.ink,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                body,
                style: const TextStyle(
                  color: _DashboardColors.muted,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DashboardMeta extends StatelessWidget {
  const _DashboardMeta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, color: _DashboardColors.muted, size: 17),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: _DashboardColors.muted,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _DashboardPointsPanel extends StatelessWidget {
  const _DashboardPointsPanel({
    required this.profile,
    required this.onBrowseRewards,
  });

  final UserProfile profile;
  final VoidCallback onBrowseRewards;

  String get _nextTierName {
    switch (profile.nextTierThreshold) {
      case 200:
        return 'Silver';
      case 500:
        return 'Gold';
      case 1000:
        return 'Legend';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool isTopTier = profile.nextTierThreshold == null;
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 310),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _DashboardColors.purple.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: _DashboardColors.purple.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.auto_awesome_outlined,
                  color: _DashboardColors.purple,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Pluto Points',
                  style: TextStyle(
                    color: _DashboardColors.ink,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _DashboardColors.green.withValues(alpha: 0.11),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: _DashboardColors.green.withValues(alpha: 0.24),
                  ),
                ),
                child: Text(
                  profile.tierName,
                  style: const TextStyle(
                    color: _DashboardColors.green,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            '${profile.pointsBalance} available',
            style: const TextStyle(
              color: _DashboardColors.ink,
              fontSize: 30,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${profile.lifetimePoints} lifetime points earned',
            style: const TextStyle(
              color: _DashboardColors.muted,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 17),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: profile.tierProgress,
              minHeight: 7,
              backgroundColor: _DashboardColors.ink.withValues(alpha: 0.12),
              color: _DashboardColors.purple,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            isTopTier
                ? 'Top tier unlocked.'
                : '${profile.pointsToNextTier} lifetime points to $_nextTierName.',
            style: const TextStyle(
              color: _DashboardColors.muted,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 17),
          Row(
            children: <Widget>[
              Expanded(
                child: _DashboardInlineStat(
                  icon: Icons.local_activity_outlined,
                  value: '${profile.eventsAttended}',
                  label: 'Events attended',
                  color: _DashboardColors.orange,
                ),
              ),
              Container(
                width: 1,
                height: 38,
                color: _DashboardColors.ink.withValues(alpha: 0.12),
              ),
              Expanded(
                child: _DashboardInlineStat(
                  icon: Icons.workspace_premium_outlined,
                  value: profile.tierName,
                  label: 'Current tier',
                  color: _DashboardColors.green,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onBrowseRewards,
              icon: const Icon(Icons.card_giftcard_outlined, size: 18),
              label: const Text('Browse Rewards'),
            ),
          ),
        ],
      ),
    );
  }
}

class _DashboardInlineStat extends StatelessWidget {
  const _DashboardInlineStat({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 8),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: _DashboardColors.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: _DashboardColors.muted,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DashboardPrepBand extends StatelessWidget {
  const _DashboardPrepBand({
    required this.onOpenGuide,
    required this.onScanQr,
  });

  final VoidCallback onOpenGuide;
  final VoidCallback onScanQr;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _DashboardColors.cyan.withValues(alpha: 0.16),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text(
            'GET FESTIVAL READY',
            style: TextStyle(
              color: _DashboardColors.cyan,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 5),
          const Text(
            'A little prep goes a long way',
            style: TextStyle(
              color: _DashboardColors.ink,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 15),
          LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final Widget guide = _DashboardPrepAction(
                icon: Icons.menu_book,
                color: _DashboardColors.orange,
                title: 'Read the field guide',
                body:
                    'Directions, camping essentials, and community principles.',
                actionLabel: 'Open Guide',
                onPressed: onOpenGuide,
              );
              final Widget scan = _DashboardPrepAction(
                icon: Icons.qr_code_scanner,
                color: _DashboardColors.green,
                title: 'Check in and earn',
                body:
                    'Scan festival QR codes at the venue to collect Pluto Points.',
                actionLabel: 'Scan QR',
                onPressed: onScanQr,
              );

              if (constraints.maxWidth < 700) {
                return Column(
                  children: <Widget>[
                    guide,
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Divider(color: Color(0x1FF7F1FA), height: 1),
                    ),
                    scan,
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(child: guide),
                  Container(
                    width: 1,
                    height: 118,
                    margin: const EdgeInsets.symmetric(horizontal: 20),
                    color: _DashboardColors.ink.withValues(alpha: 0.12),
                  ),
                  Expanded(child: scan),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _DashboardPrepAction extends StatelessWidget {
  const _DashboardPrepAction({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    required this.actionLabel,
    required this.onPressed,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final String actionLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color, size: 22),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: const TextStyle(
                  color: _DashboardColors.ink,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                body,
                style: const TextStyle(
                  color: _DashboardColors.muted,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: onPressed,
                icon: const Icon(Icons.arrow_forward, size: 16),
                label: Text(actionLabel),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DashboardStatusPanel extends StatelessWidget {
  const _DashboardStatusPanel({
    required this.icon,
    required this.message,
    this.minHeight = 310,
  });

  final IconData icon;
  final String message;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(minHeight: minHeight),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _DashboardColors.rose.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Icon(icon, color: _DashboardColors.rose, size: 28),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _DashboardColors.muted,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _DashboardPanelSkeleton extends StatelessWidget {
  const _DashboardPanelSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 310),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0x1FD9A7FF)),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _SkeletonBlock(width: 150, height: 22),
          SizedBox(height: 28),
          _SkeletonBlock(width: 190, height: 36),
          SizedBox(height: 12),
          _SkeletonBlock(width: double.infinity, height: 12),
          SizedBox(height: 34),
          _SkeletonBlock(width: double.infinity, height: 54),
          SizedBox(height: 38),
          _SkeletonBlock(width: double.infinity, height: 46),
        ],
      ),
    );
  }
}

class _DashboardEventSkeleton extends StatelessWidget {
  const _DashboardEventSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 132,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0x1FD9A7FF)),
      ),
      child: const Row(
        children: <Widget>[
          _SkeletonBlock(width: 106, height: 106),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _SkeletonBlock(width: 180, height: 20),
                SizedBox(height: 12),
                _SkeletonBlock(width: double.infinity, height: 13),
                SizedBox(height: 8),
                _SkeletonBlock(width: 220, height: 13),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SkeletonBlock extends StatelessWidget {
  const _SkeletonBlock({required this.width, required this.height});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: _DashboardColors.ink.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
      ),
    );
  }
}

class _DashboardEmptyState extends StatelessWidget {
  const _DashboardEmptyState({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _DashboardColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _DashboardColors.cyan.withValues(alpha: 0.16),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: _DashboardColors.cyan, size: 25),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: const TextStyle(
                    color: _DashboardColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  body,
                  style: const TextStyle(
                    color: _DashboardColors.muted,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
