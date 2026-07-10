import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'manafest_repository.dart';
import 'src/background/pluto_background.dart';
import 'src/nav_bar/nav_bar.dart';
import 'user_profile_repository.dart';

class ManaFestPage extends StatefulWidget {
  const ManaFestPage({Key? key}) : super(key: key);

  static const String route = '/manafest';

  @override
  State<ManaFestPage> createState() => _ManaFestPageState();
}

class _ManaFestPageState extends State<ManaFestPage> {
  static const String _ticketUrl = 'https://posh.vip/e/manafest-2026';
  static const String _mapsUrl =
      'https://www.google.com/maps/search/?api=1&query=Three+Creeks+Campground+Anderson+South+Carolina';
  static const String _volunteerUrl = 'https://forms.gle/Cyh34mQduSKDUzpdA';
  static const String _vendorFormUrl = 'https://forms.gle/zUdyMvJRgkdNXvdM7';

  final ManaFestRepository _manaFestRepository = ManaFestRepository();
  final UserProfileRepository _profileRepository = UserProfileRepository();

  String? _ensureProfileUid;
  Future<void>? _ensureProfileFuture;

  Future<void> _openLink(String url) async {
    final String normalizedUrl = url.trim();
    if (normalizedUrl.isEmpty) {
      return;
    }

    final Uri? parsedUrl = Uri.tryParse(normalizedUrl);
    final String targetUrl = parsedUrl?.hasScheme ?? false
        ? normalizedUrl
        : Uri.base.resolve(normalizedUrl).toString();

    await launchUrlString(targetUrl, webOnlyWindowName: '_blank');
  }

  Future<void> _ensureProfileExists(User user) {
    if (_ensureProfileUid == user.uid && _ensureProfileFuture != null) {
      return _ensureProfileFuture!;
    }

    _ensureProfileUid = user.uid;
    _ensureProfileFuture = _profileRepository.ensureProfileForUser(user);
    return _ensureProfileFuture!;
  }

  String _fallbackDisplayNameForUser(User user) {
    final String displayName = (user.displayName ?? '').trim();
    if (displayName.isNotEmpty) {
      return displayName;
    }

    final String email = (user.email ?? '').trim();
    if (!email.contains('@')) {
      return 'Pluto Member';
    }
    final String localPart = email.split('@').first.trim();
    return localPart.isEmpty ? 'Pluto Member' : localPart;
  }

  Widget _buildPublicSection({
    required String title,
    required List<Widget> children,
  }) {
    return Card(
      color: Colors.black.withValues(alpha: 0.4),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              title,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildBullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(Icons.circle, size: 8, color: Colors.white70),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 16,
                color: Colors.white70,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPublicHeroCard(BuildContext context) {
    return Card(
      color: Colors.black.withValues(alpha: 0.48),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            final bool isNarrow = constraints.maxWidth < 920;
            final Widget flyer = ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset(
                'assets/events/Mana-Fest-2026-Flyer-half.webp',
                fit: BoxFit.cover,
              ),
            );

            final Widget content = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'ManaFest 2026',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 38,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Two nights of underground sound, camping, and regional DJs at Three Creeks Campground in Anderson, SC.',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 18,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Venue: Three Creeks Campground, Anderson, South Carolina',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: <Widget>[
                    ElevatedButton.icon(
                      onPressed: () => _openLink(_ticketUrl),
                      icon: const Icon(Icons.airplane_ticket),
                      label: const Text('Get Tickets'),
                    ),
                    ElevatedButton.icon(
                      onPressed: () => context.go('/sign-up'),
                      icon: const Icon(Icons.person_add_alt_1),
                      label: const Text('Create Account'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openLink(_mapsUrl),
                      icon: const Icon(Icons.navigation),
                      label: const Text('Open Directions'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openLink(_volunteerUrl),
                      icon: const Icon(Icons.volunteer_activism),
                      label: const Text('Volunteer Application'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openLink(_vendorFormUrl),
                      icon: const Icon(Icons.storefront),
                      label: const Text('Vendor Application'),
                    ),
                  ],
                ),
              ],
            );

            if (isNarrow) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  flyer,
                  const SizedBox(height: 14),
                  content,
                ],
              );
            }

            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SizedBox(width: 320, child: flyer),
                const SizedBox(width: 20),
                Expanded(child: content),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildPublicPageContent(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1080),
          child: Column(
            children: <Widget>[
              _buildPublicHeroCard(context),
              const SizedBox(height: 12),
              _buildPublicSection(
                title: 'Event Info',
                children: <Widget>[
                  const Text(
                    'For two nights in September, we are taking over the woods at Three Creeks Campground in Anderson, SC.\n\n'
                    'Raw energy, heavy bass, and regional DJs are at the center of the weekend.\n\n'
                    'Bring your crew, set up camp, and lock in for a full weekend of underground sound.',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 16,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 10),
                  _buildBullet(
                    'Two nights of camping, music, and late-night energy at Three Creeks Campground in Anderson, SC.',
                  ),
                  _buildBullet(
                    'Main Stage and Renegade Stage programming will be managed inside the app.',
                  ),
                  _buildBullet(
                    'Create an account before the event to use the attendee tools and Pluto Points.',
                  ),
                ],
              ),
              _buildPublicSection(
                title: 'Directions',
                children: <Widget>[
                  _buildBullet(
                    'Navigate to: Three Creeks Campground, Anderson, South Carolina.',
                  ),
                  _buildBullet(
                    'Use Google Maps for the most reliable routing and traffic updates.',
                  ),
                  _buildBullet(
                    'After turning into the campground area, follow event staff signs for parking and check-in.',
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () => _openLink(_mapsUrl),
                    icon: const Icon(Icons.navigation),
                    label: const Text('Open Directions in Maps'),
                  ),
                ],
              ),
              _buildPublicSection(
                title: 'Camping',
                children: <Widget>[
                  _buildBullet('Camp only in designated areas.'),
                  _buildBullet(
                    'Car camping pass is a separate pass. One pass is required per vehicle.',
                  ),
                  _buildBullet(
                    'Pack for changing weather, including rain.',
                  ),
                  _buildBullet(
                    'Bring reusable water containers, personal lighting, and basic campsite gear.',
                  ),
                ],
              ),
              _buildPublicSection(
                title: 'Festival Rules',
                children: <Widget>[
                  _buildBullet(
                    'Respect staff instructions, neighboring campsites, and venue boundaries.',
                  ),
                  _buildBullet(
                    'Keep camps and shared spaces clean. Pack out what you pack in.',
                  ),
                  _buildBullet(
                    'Use approved fire-safe cooking and lighting setups only where permitted.',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStandaloneScaffold(BuildContext context) {
    return Scaffold(
      appBar: const NavBar(isDarkModeBtnVisible: true),
      body: Stack(
        children: <Widget>[
          const PlutoBackground(),
          _buildPublicPageContent(context),
        ],
      ),
    );
  }

  Widget _buildSignedInHub(User user) {
    return DefaultTabController(
      length: 4,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _buildAttendeeHeader(user),
          const TabBar(
            isScrollable: true,
            tabs: <Widget>[
              Tab(icon: Icon(Icons.schedule), text: 'Schedule'),
              Tab(icon: Icon(Icons.article_outlined), text: 'Guide'),
              Tab(icon: Icon(Icons.campaign_outlined), text: 'Updates'),
              Tab(icon: Icon(Icons.card_giftcard), text: 'Rewards'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: <Widget>[
                _buildScheduleTab(),
                _buildGuideTab(),
                _buildUpdatesTab(),
                _buildRewardsTab(user),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendeeHeader(User user) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
      child: Card(
        color: Colors.black.withValues(alpha: 0.42),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: <Widget>[
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset(
                  'assets/events/Mana-Fest-2026-Flyer-half.webp',
                  width: 76,
                  height: 76,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      'ManaFest 2026',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 25,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Welcome, ${_fallbackDisplayNameForUser(user)}. Use this tab for schedule, guide info, updates, and check-ins.',
                      style: const TextStyle(
                        color: Colors.white70,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _panel({
    required Widget child,
  }) {
    return Card(
      color: Colors.black.withValues(alpha: 0.42),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    );
  }

  Widget _buildTabList({
    required List<Widget> children,
  }) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      children: children,
    );
  }

  Widget _buildScheduleTab() {
    return StreamBuilder<List<ManaFestScheduleItem>>(
      stream: _manaFestRepository.watchScheduleItems(attendeeOnly: true),
      builder: (BuildContext context,
          AsyncSnapshot<List<ManaFestScheduleItem>> snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return _buildTabList(
            children: <Widget>[
              _panel(
                child: Text(
                  'Unable to load schedule: ${snapshot.error}',
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            ],
          );
        }

        final List<ManaFestScheduleItem> items =
            snapshot.data ?? <ManaFestScheduleItem>[];
        if (items.isEmpty) {
          return _buildTabList(
            children: <Widget>[
              _emptyPanel(
                icon: Icons.schedule,
                title: 'Schedule coming soon',
                body:
                    'Set times will appear here once the ManaFest schedule is published.',
              ),
            ],
          );
        }

        final Map<String, List<ManaFestScheduleItem>> groupedItems =
            <String, List<ManaFestScheduleItem>>{};
        for (final ManaFestScheduleItem item in items) {
          final String day = item.dayLabel.isEmpty ? 'Day TBA' : item.dayLabel;
          groupedItems
              .putIfAbsent(day, () => <ManaFestScheduleItem>[])
              .add(item);
        }

        return _buildTabList(
          children: groupedItems.entries.map(
            (MapEntry<String, List<ManaFestScheduleItem>> entry) {
              return _panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      entry.key,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...entry.value.map(_buildScheduleItem),
                  ],
                ),
              );
            },
          ).toList(),
        );
      },
    );
  }

  Widget _buildScheduleItem(ManaFestScheduleItem item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.32),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  item.displayTitle,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              _stageChip(item.stage),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            item.timeRangeLabel,
            style: const TextStyle(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (item.artistName.isNotEmpty && item.artistName != item.title)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                item.artistName,
                style: const TextStyle(color: Colors.white70),
              ),
            ),
          if (item.description.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                item.description,
                style: const TextStyle(color: Colors.white70, height: 1.35),
              ),
            ),
        ],
      ),
    );
  }

  Widget _stageChip(String stage) {
    final bool isRenegade = stage == manaFestRenegadeStage;
    final Color backgroundColor =
        isRenegade ? const Color(0xFF27351C) : const Color(0xFF2D2140);
    final Color foregroundColor =
        isRenegade ? const Color(0xFFDAF7BD) : const Color(0xFFE5D4FF);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: foregroundColor.withValues(alpha: 0.3)),
      ),
      child: Text(
        stage,
        style: TextStyle(
          color: foregroundColor,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _buildGuideTab() {
    return StreamBuilder<List<ManaFestGuideSection>>(
      stream: _manaFestRepository.watchGuideSections(attendeeOnly: true),
      builder: (BuildContext context,
          AsyncSnapshot<List<ManaFestGuideSection>> snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return _buildTabList(
            children: <Widget>[
              _panel(
                child: Text(
                  'Unable to load guide: ${snapshot.error}',
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            ],
          );
        }

        final List<ManaFestGuideSection> sections =
            snapshot.data ?? <ManaFestGuideSection>[];
        final List<Widget> guideCards = sections.isEmpty
            ? _defaultGuideSections.map(_buildDefaultGuideSection).toList()
            : sections.map(_buildGuideSection).toList();

        return _buildTabList(children: guideCards);
      },
    );
  }

  Widget _buildGuideSection(ManaFestGuideSection section) {
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (section.category.isNotEmpty)
            Text(
              section.category.toUpperCase(),
              style: const TextStyle(
                color: Colors.white54,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.7,
              ),
            ),
          if (section.category.isNotEmpty) const SizedBox(height: 6),
          Text(
            section.title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 23,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            section.body,
            style: const TextStyle(color: Colors.white70, height: 1.45),
          ),
        ],
      ),
    );
  }

  Widget _buildDefaultGuideSection(_DefaultGuideSection section) {
    return _panel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(section.icon, color: Colors.white70),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  section.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  section.body,
                  style: const TextStyle(
                    color: Colors.white70,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUpdatesTab() {
    return StreamBuilder<List<ManaFestUpdate>>(
      stream: _manaFestRepository.watchUpdates(attendeeOnly: true),
      builder:
          (BuildContext context, AsyncSnapshot<List<ManaFestUpdate>> snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return _buildTabList(
            children: <Widget>[
              _panel(
                child: Text(
                  'Unable to load updates: ${snapshot.error}',
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            ],
          );
        }

        final List<ManaFestUpdate> updates =
            snapshot.data ?? <ManaFestUpdate>[];
        if (updates.isEmpty) {
          return _buildTabList(
            children: <Widget>[
              _emptyPanel(
                icon: Icons.campaign_outlined,
                title: 'No active updates',
                body:
                    'Festival updates and urgent announcements will appear here during the event.',
              ),
            ],
          );
        }

        return _buildTabList(
          children: updates.map(_buildUpdateCard).toList(),
        );
      },
    );
  }

  Widget _buildUpdateCard(ManaFestUpdate update) {
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              if (update.isUrgent)
                Container(
                  margin: const EdgeInsets.only(right: 10),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4A151F),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0xFFDA6B80)),
                  ),
                  child: const Text(
                    'Urgent',
                    style: TextStyle(
                      color: Color(0xFFFFD6DF),
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              Expanded(
                child: Text(
                  update.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          if (update.body.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              update.body,
              style: const TextStyle(color: Colors.white70, height: 1.45),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildRewardsTab(User user) {
    return FutureBuilder<void>(
      future: _ensureProfileExists(user),
      builder: (BuildContext context, AsyncSnapshot<void> ensureSnapshot) {
        if (ensureSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (ensureSnapshot.hasError) {
          return _buildTabList(
            children: <Widget>[
              _panel(
                child: Text(
                  'Unable to prepare rewards wallet: ${ensureSnapshot.error}',
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            ],
          );
        }

        return StreamBuilder<UserProfile?>(
          stream: _profileRepository.watchProfile(
            uid: user.uid,
            fallbackDisplayName: _fallbackDisplayNameForUser(user),
          ),
          builder: (BuildContext context,
              AsyncSnapshot<UserProfile?> profileSnapshot) {
            final UserProfile? profile = profileSnapshot.data;
            return _buildTabList(
              children: <Widget>[
                _panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'ManaFest Rewards',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Scan event QR codes, earn Pluto Points, and redeem rewards from the shop.',
                        style: TextStyle(color: Colors.white70, height: 1.4),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: <Widget>[
                          _metricChip(
                            label: 'Pluto Points',
                            value: profile == null
                                ? '...'
                                : profile.pointsBalance.toString(),
                          ),
                          _metricChip(
                            label: 'Tier',
                            value: profile?.tierName ?? '...',
                          ),
                          _metricChip(
                            label: 'Events',
                            value: profile == null
                                ? '...'
                                : profile.eventsAttended.toString(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: <Widget>[
                          ElevatedButton.icon(
                            onPressed: () => context.go('/scan-qr'),
                            icon: const Icon(Icons.qr_code_scanner),
                            label: const Text('Scan QR Code'),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => context.go('/shop'),
                            icon: const Icon(Icons.card_giftcard),
                            label: const Text('Open Rewards Shop'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _metricChip({
    required String label,
    required String value,
  }) {
    return Container(
      width: 156,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            style: const TextStyle(
              color: Colors.white60,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 5),
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

  Widget _emptyPanel({
    required IconData icon,
    required String title,
    required String body,
  }) {
    return _panel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: Colors.white70, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  body,
                  style: const TextStyle(color: Colors.white70, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (BuildContext context, AsyncSnapshot<User?> snapshot) {
        final User? user = snapshot.data;
        if (user == null) {
          return _buildStandaloneScaffold(context);
        }

        return _buildSignedInHub(user);
      },
    );
  }
}

class _DefaultGuideSection {
  const _DefaultGuideSection({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;
}

const List<_DefaultGuideSection> _defaultGuideSections = <_DefaultGuideSection>[
  _DefaultGuideSection(
    icon: Icons.confirmation_number_outlined,
    title: 'Arrival and Check-In',
    body:
        'Have your ticket ready, follow staff signage when you enter, and keep your account available for QR check-ins.',
  ),
  _DefaultGuideSection(
    icon: Icons.campaign_outlined,
    title: 'Updates',
    body:
        'Important schedule, weather, and site updates will appear in the Updates tab during the event.',
  ),
  _DefaultGuideSection(
    icon: Icons.local_fire_department_outlined,
    title: 'Camping and Safety',
    body:
        'Camp in designated areas, keep shared spaces clean, pack lighting, and follow staff direction for fire-safe setups.',
  ),
  _DefaultGuideSection(
    icon: Icons.festival_outlined,
    title: 'Stages',
    body:
        'ManaFest has a Main Stage and a Renegade Stage. Renegade Stage location details stay hidden until the team reveals them.',
  ),
];
