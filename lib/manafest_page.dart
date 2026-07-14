import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'manafest_content.dart';
import 'manafest_repository.dart';
import 'src/background/pluto_background.dart';
import 'src/nav_bar/nav_bar.dart';

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

  static const Color _guideInk = Color(0xFFF7F1FA);
  static const Color _guideMuted = Color(0xFFC9BECE);
  static const Color _guideSurface = Color(0xEB151019);
  static const Color _guideSurfaceStrong = Color(0xF21B1420);
  static const Color _guidePurple = Color(0xFFD9A7FF);
  static const Color _guideOrange = Color(0xFFFFB24D);
  static const Color _guideGreen = Color(0xFFA8E8C3);
  static const Color _guideRose = Color(0xFFFFA6BA);
  static const IconData _principlesIcon = Icons.handshake_outlined;

  final ManaFestRepository _manaFestRepository = ManaFestRepository();
  late final Future<ManaFestExperience> _festivalExperience;

  @override
  void initState() {
    super.initState();
    _festivalExperience = ManaFestExperience.load();
  }

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
    final Color accent = _guideAccentForTitle(title);
    final Widget sectionIcon = Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(
        _guideIconForTitle(title),
        color: accent,
        size: 24,
      ),
    );
    final Widget sectionContent = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          title,
          style: const TextStyle(
            fontSize: 25,
            fontWeight: FontWeight.w800,
            color: _guideInk,
          ),
        ),
        const SizedBox(height: 12),
        ...children,
      ],
    );

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: _guideSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: accent.withValues(alpha: 0.2)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            if (constraints.maxWidth < 430) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  sectionIcon,
                  const SizedBox(height: 14),
                  sectionContent,
                ],
              );
            }

            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                sectionIcon,
                const SizedBox(width: 16),
                Expanded(child: sectionContent),
              ],
            );
          },
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
            padding: EdgeInsets.only(top: 7),
            child: Icon(Icons.circle, size: 6, color: _guideOrange),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 16,
                color: _guideMuted,
                height: 1.48,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFestivalExperiencePanel() {
    return FutureBuilder<ManaFestExperience>(
      future: _festivalExperience,
      builder:
          (BuildContext context, AsyncSnapshot<ManaFestExperience> snapshot) {
        if (snapshot.hasError) {
          return _buildFestivalExperienceStatus(
            'Festival highlights are temporarily unavailable.',
          );
        }

        final ManaFestExperience? experience = snapshot.data;
        if (experience == null) {
          return _buildFestivalExperienceStatus('Loading festival highlights…');
        }

        return Container(
          decoration: BoxDecoration(
            color: _guideSurfaceStrong,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: _guideOrange.withValues(alpha: 0.24),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                LayoutBuilder(
                  builder: (BuildContext context, BoxConstraints constraints) {
                    final Widget heading = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          experience.eyebrow,
                          style: const TextStyle(
                            color: _guideOrange,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          experience.title,
                          style: const TextStyle(
                            color: _guideInk,
                            fontSize: 25,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          experience.intro,
                          style: const TextStyle(
                            color: _guideMuted,
                            fontSize: 15,
                            height: 1.45,
                          ),
                        ),
                      ],
                    );
                    final Widget notice = _buildFestivalAgeNotice(
                      experience.notice,
                    );

                    if (constraints.maxWidth < 560) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          heading,
                          const SizedBox(height: 16),
                          notice,
                        ],
                      );
                    }

                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Expanded(child: heading),
                        const SizedBox(width: 24),
                        notice,
                      ],
                    );
                  },
                ),
                const SizedBox(height: 26),
                LayoutBuilder(
                  builder: (BuildContext context, BoxConstraints constraints) {
                    if (constraints.maxWidth < 760) {
                      return Column(
                        children: <Widget>[
                          for (int index = 0;
                              index < experience.groups.length;
                              index++) ...<Widget>[
                            if (index > 0) const SizedBox(height: 24),
                            _buildFestivalExperienceGroup(
                              experience.groups[index],
                            ),
                          ],
                        ],
                      );
                    }

                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        for (int index = 0;
                            index < experience.groups.length;
                            index++) ...<Widget>[
                          if (index > 0) const SizedBox(width: 28),
                          Expanded(
                            child: _buildFestivalExperienceGroup(
                              experience.groups[index],
                            ),
                          ),
                        ],
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildFestivalExperienceStatus(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: _guideSurfaceStrong,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _guideOrange.withValues(alpha: 0.24),
        ),
      ),
      child: Text(
        message,
        style: const TextStyle(color: _guideMuted, fontSize: 15),
      ),
    );
  }

  Widget _buildFestivalAgeNotice(String notice) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: _guideOrange.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: _guideOrange.withValues(alpha: 0.48),
        ),
      ),
      child: Text(
        notice.toUpperCase(),
        style: const TextStyle(
          color: _guideOrange,
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.7,
        ),
      ),
    );
  }

  Widget _buildFestivalExperienceGroup(ManaFestExperienceGroup group) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(top: 16),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: _guideInk.withValues(alpha: 0.14),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            group.title,
            style: const TextStyle(
              color: _guideInk,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 15),
          for (final ManaFestExperienceItem item in group.items)
            _buildFestivalExperienceItem(item),
        ],
      ),
    );
  }

  Widget _buildFestivalExperienceItem(ManaFestExperienceItem item) {
    const TextStyle textStyle = TextStyle(
      color: _guideMuted,
      fontSize: 15,
      height: 1.4,
    );
    final Widget itemText = item.hasLink
        ? Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              Text('${item.text} ', style: textStyle),
              Semantics(
                link: true,
                label: 'Open ${item.linkText} on Instagram',
                child: InkWell(
                  onTap: () => _openLink(item.url),
                  borderRadius: BorderRadius.circular(4),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      item.linkText,
                      style: textStyle.copyWith(
                        color: const Color(0xFF8FDDE6),
                        decoration: TextDecoration.underline,
                        decorationColor: const Color(0xFF8FDDE6),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          )
        : Text(item.text, style: textStyle);

    return Padding(
      padding: const EdgeInsets.only(bottom: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Padding(
            padding: EdgeInsets.only(top: 5),
            child: Icon(Icons.auto_awesome, size: 13, color: _guidePurple),
          ),
          const SizedBox(width: 9),
          Expanded(child: itemText),
        ],
      ),
    );
  }

  bool _isDirectionsSection(String title) {
    return title.trim().toLowerCase() == 'directions';
  }

  IconData _guideIconForTitle(String title, {IconData? fallback}) {
    final String normalizedTitle = title.trim().toLowerCase();
    if (normalizedTitle.contains('principle')) {
      return _principlesIcon;
    }
    if (normalizedTitle.contains('direction') ||
        normalizedTitle.contains('arrival') ||
        normalizedTitle.contains('parking')) {
      return Icons.explore_outlined;
    }
    if (normalizedTitle.contains('camp')) {
      return Icons.cabin_outlined;
    }
    if (normalizedTitle.contains('rule') ||
        normalizedTitle.contains('safety')) {
      return Icons.verified_user_outlined;
    }
    if (normalizedTitle.contains('event') || normalizedTitle.contains('info')) {
      return Icons.local_activity_outlined;
    }
    return fallback ?? Icons.auto_stories_outlined;
  }

  Color _guideAccentForTitle(String title) {
    final String normalizedTitle = title.trim().toLowerCase();
    if (normalizedTitle.contains('direction') ||
        normalizedTitle.contains('arrival') ||
        normalizedTitle.contains('parking')) {
      return _guideOrange;
    }
    if (normalizedTitle.contains('camp')) {
      return _guideGreen;
    }
    if (normalizedTitle.contains('rule') ||
        normalizedTitle.contains('safety')) {
      return _guideRose;
    }
    return _guidePurple;
  }

  Widget _buildGoogleMapsButton() {
    return Padding(
      padding: const EdgeInsets.only(top: 18),
      child: ElevatedButton.icon(
        onPressed: () => _openLink(_mapsUrl),
        style: ElevatedButton.styleFrom(
          backgroundColor: _guideOrange,
          foregroundColor: const Color(0xFF21160B),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        icon: const Icon(Icons.navigation_rounded),
        label: const Text('Open in Google Maps'),
      ),
    );
  }

  Widget _buildPublicPrinciplesSection() {
    return _buildPrinciplesGuidePanel();
  }

  Widget _buildPublicGuideHeading() {
    return const Padding(
      padding: EdgeInsets.fromLTRB(4, 18, 4, 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: EdgeInsets.only(top: 4),
            child: Icon(
              Icons.auto_stories_outlined,
              color: _guideOrange,
              size: 30,
            ),
          ),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'THE FIELD GUIDE',
                  style: TextStyle(
                    color: _guideOrange,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'Know before you go',
                  style: TextStyle(
                    color: _guideInk,
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 7),
                Text(
                  'The essentials for arriving, camping, and taking care of each other all weekend.',
                  style: TextStyle(
                    color: _guideMuted,
                    fontSize: 16,
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
              _buildPublicGuideHeading(),
              _buildPublicSection(
                title: 'Event Info',
                children: <Widget>[
                  const Text(
                    'For two nights in September, we are taking over the woods at Three Creeks Campground in Anderson, SC.\n\n'
                    'Raw energy, heavy bass, and regional DJs are at the center of the weekend.\n\n'
                    'Bring your crew, set up camp, and lock in for a full weekend of underground sound.',
                    style: TextStyle(
                      color: _guideMuted,
                      fontSize: 16,
                      height: 1.48,
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
                  _buildGoogleMapsButton(),
                ],
              ),
              _buildFestivalExperiencePanel(),
              const SizedBox(height: 14),
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
              _buildPublicPrinciplesSection(),
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
          Container(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 2),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: _guideSurface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: _guidePurple.withValues(alpha: 0.18),
              ),
            ),
            child: const TabBar(
              indicatorSize: TabBarIndicatorSize.tab,
              dividerColor: Colors.transparent,
              labelColor: _guideInk,
              unselectedLabelColor: _guideMuted,
              labelStyle: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
              unselectedLabelStyle: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
              indicator: BoxDecoration(
                color: Color(0x33D9A7FF),
                borderRadius: BorderRadius.all(Radius.circular(6)),
              ),
              tabs: <Widget>[
                Tab(
                  height: 52,
                  child: _ManaFestTabLabel(
                    icon: Icons.menu_book,
                    label: 'Guide',
                  ),
                ),
                Tab(
                  height: 52,
                  child: _ManaFestTabLabel(
                    icon: Icons.campaign,
                    label: 'Updates',
                  ),
                ),
                Tab(
                  height: 52,
                  child: _ManaFestTabLabel(
                    icon: Icons.queue_music,
                    label: 'Lineup',
                  ),
                ),
                Tab(
                  height: 52,
                  child: _ManaFestTabLabel(
                    icon: Icons.calendar_today,
                    label: 'Schedule',
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: <Widget>[
                _buildGuideTab(),
                _buildUpdatesTab(),
                _buildLineupTab(),
                _buildScheduleTab(),
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
      child: Container(
        decoration: BoxDecoration(
          color: _guideSurfaceStrong,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: _guidePurple.withValues(alpha: 0.22),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              ClipRRect(
                borderRadius: BorderRadius.circular(7),
                child: Image.asset(
                  'assets/events/Mana-Fest-2026-Flyer-half.webp',
                  width: 74,
                  height: 88,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      'ATTENDEE HUB',
                      style: TextStyle(
                        color: _guideOrange,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'ManaFest 2026',
                      style: TextStyle(
                        color: _guideInk,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'Welcome back, ${_fallbackDisplayNameForUser(user)}.',
                      style: const TextStyle(
                        color: _guideMuted,
                        fontSize: 14,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Wrap(
                      spacing: 16,
                      runSpacing: 7,
                      children: <Widget>[
                        _GuideMeta(
                          icon: Icons.nights_stay_outlined,
                          label: '2 nights',
                        ),
                        _GuideMeta(
                          icon: Icons.location_on_outlined,
                          label: 'Anderson, SC',
                        ),
                      ],
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

  Widget _buildLineupTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.asset(
              'assets/events/manafest-2026-lineup-v1.webp',
              width: double.infinity,
              fit: BoxFit.contain,
              semanticLabel: 'ManaFest 2026 lineup flyer',
            ),
          ),
        ),
      ),
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

        return LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            final double contentWidth = constraints.maxWidth - 32;
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
              children: <Widget>[
                _buildGuideIntro(),
                const SizedBox(height: 16),
                _buildFestivalExperiencePanel(),
                const SizedBox(height: 16),
                _buildGuideCardLayout(guideCards, contentWidth),
                const SizedBox(height: 20),
                _buildPrinciplesGuidePanel(),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildGuideIntro() {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final bool isCompact = constraints.maxWidth < 560;
        return Container(
          height: isCompact ? 236 : 202,
          decoration: BoxDecoration(
            color: _guideSurfaceStrong,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: _guidePurple.withValues(alpha: 0.24),
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: <Widget>[
              Positioned(
                top: 0,
                right: 0,
                bottom: 0,
                width: isCompact ? constraints.maxWidth : 330,
                child: Opacity(
                  opacity: isCompact ? 0.14 : 0.34,
                  child: Image.asset(
                    'assets/events/Mana-Fest-2026-Flyer-half.webp',
                    fit: BoxFit.cover,
                  ),
                ),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: <Color>[
                        _guideSurfaceStrong,
                        _guideSurfaceStrong.withValues(alpha: 0.92),
                        _guideSurfaceStrong.withValues(
                          alpha: isCompact ? 0.74 : 0.22,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.all(isCompact ? 20 : 24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 610),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'MANAFEST FIELD GUIDE',
                        style: TextStyle(
                          color: _guideOrange,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        'Everything you need for the weekend.',
                        style: TextStyle(
                          color: _guideInk,
                          fontSize: isCompact ? 26 : 30,
                          fontWeight: FontWeight.w800,
                          height: 1.12,
                        ),
                      ),
                      const SizedBox(height: 9),
                      const Text(
                        'Arrival details, camping essentials, and the shared agreements that keep the festival moving.',
                        style: TextStyle(
                          color: _guideMuted,
                          fontSize: 15,
                          height: 1.42,
                        ),
                      ),
                      const Spacer(),
                      const Wrap(
                        spacing: 18,
                        runSpacing: 8,
                        children: <Widget>[
                          _GuideMeta(
                            icon: Icons.nights_stay_outlined,
                            label: '2 nights',
                          ),
                          _GuideMeta(
                            icon: Icons.location_on_outlined,
                            label: 'Anderson, SC',
                          ),
                        ],
                      ),
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

  Widget _buildGuideCardLayout(List<Widget> cards, double contentWidth) {
    if (contentWidth >= 760) {
      final double cardWidth = (contentWidth - 14) / 2;
      return Wrap(
        spacing: 14,
        runSpacing: 14,
        children: cards
            .map((Widget card) => SizedBox(width: cardWidth, child: card))
            .toList(),
      );
    }

    return Column(
      children: <Widget>[
        for (int index = 0; index < cards.length; index++) ...<Widget>[
          if (index > 0) const SizedBox(height: 12),
          cards[index],
        ],
      ],
    );
  }

  Widget _buildGuideSection(ManaFestGuideSection section) {
    return _buildGuideContentCard(
      title: section.title,
      body: section.body,
      category: section.category,
      icon: _guideIconForTitle(section.title),
    );
  }

  Widget _buildGuideContentCard({
    required String title,
    required String body,
    required IconData icon,
    String category = '',
  }) {
    final Color accent = _guideAccentForTitle(title);
    return Container(
      decoration: BoxDecoration(
        color: _guideSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: accent.withValues(alpha: 0.2)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: accent, size: 23),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        category.trim().isEmpty
                            ? 'ESSENTIALS'
                            : category.trim().toUpperCase(),
                        style: TextStyle(
                          color: accent,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        title,
                        style: const TextStyle(
                          color: _guideInk,
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              body,
              style: const TextStyle(
                color: _guideMuted,
                fontSize: 15,
                height: 1.5,
              ),
            ),
            if (_isDirectionsSection(title)) _buildGoogleMapsButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildDefaultGuideSection(_DefaultGuideSection section) {
    return _buildGuideContentCard(
      title: section.title,
      body: section.body,
      icon: section.icon,
    );
  }

  Widget _buildPrinciplesGuidePanel() {
    return Container(
      decoration: BoxDecoration(
        color: _guideSurfaceStrong,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _guidePurple.withValues(alpha: 0.24),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: _guidePurple.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    _principlesIcon,
                    color: _guidePurple,
                    size: 25,
                  ),
                ),
                const SizedBox(width: 15),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        'MANAFEST PRINCIPLES',
                        style: TextStyle(
                          color: _guidePurple,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        'How we show up',
                        style: TextStyle(
                          color: _guideInk,
                          fontSize: 25,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Five shared agreements for taking care of the land and each other.',
                        style: TextStyle(
                          color: _guideMuted,
                          fontSize: 15,
                          height: 1.42,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Divider(color: Color(0x2ED9A7FF), height: 1),
            ),
            for (int index = 0; index < _festivalPrinciples.length; index++)
              _buildGuidePrinciple(index, _festivalPrinciples[index]),
          ],
        ),
      ),
    );
  }

  Widget _buildGuidePrinciple(int index, _FestivalPrinciple principle) {
    const List<Color> accents = <Color>[
      _guideOrange,
      _guideGreen,
      _guideRose,
      _guidePurple,
      Color(0xFF8FDDE6),
    ];
    final Color accent = accents[index % accents.length];
    final bool isLast = index == _festivalPrinciples.length - 1;

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 18),
      child: Column(
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: accent.withValues(alpha: 0.25)),
                ),
                child: Text(
                  '${index + 1}'.padLeft(2, '0'),
                  style: TextStyle(
                    color: accent,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      principle.title,
                      style: const TextStyle(
                        color: _guideInk,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        height: 1.28,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      principle.body,
                      style: const TextStyle(
                        color: _guideMuted,
                        fontSize: 15,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (!isLast)
            const Padding(
              padding: EdgeInsets.only(top: 18),
              child: Divider(color: Color(0x1FF7F1FA), height: 1),
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

class _FestivalPrinciple {
  const _FestivalPrinciple({
    required this.title,
    required this.body,
  });

  final String title;
  final String body;
}

class _ManaFestTabLabel extends StatelessWidget {
  const _ManaFestTabLabel({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 20),
          const SizedBox(width: 6),
          Text(label),
        ],
      ),
    );
  }
}

class _GuideMeta extends StatelessWidget {
  const _GuideMeta({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 17, color: const Color(0xFFFFB24D)),
        const SizedBox(width: 7),
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFFF7F1FA),
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

const List<_DefaultGuideSection> _defaultGuideSections = <_DefaultGuideSection>[
  _DefaultGuideSection(
    icon: Icons.info_outline,
    title: 'Event Info',
    body:
        'For two nights in September, we are taking over the woods at Three Creeks Campground in Anderson, SC.\n\nRaw energy, heavy bass, and regional DJs are at the center of the weekend.\n\nBring your crew, set up camp, and lock in for a full weekend of underground sound.',
  ),
  _DefaultGuideSection(
    icon: Icons.navigation_outlined,
    title: 'Directions',
    body:
        'Navigate to Three Creeks Campground in Anderson, South Carolina. Use Google Maps for the most reliable routing and traffic updates. After turning into the campground area, follow event staff signs for parking and check-in.',
  ),
  _DefaultGuideSection(
    icon: Icons.cabin_outlined,
    title: 'Camping',
    body:
        'Camp only in designated areas. Car camping pass is a separate pass. One pass is required per vehicle. Pack for changing weather, including rain. Bring reusable water containers, personal lighting, and basic campsite gear.',
  ),
  _DefaultGuideSection(
    icon: Icons.rule,
    title: 'Festival Rules',
    body:
        'Respect staff instructions, neighboring campsites, and venue boundaries. Keep camps and shared spaces clean. Pack out what you pack in. Use approved fire-safe cooking and lighting setups only where permitted.',
  ),
];

const List<_FestivalPrinciple> _festivalPrinciples = <_FestivalPrinciple>[
  _FestivalPrinciple(
    title: 'Be the vibe you want to see in the world.',
    body:
        'Successful manifestation requires participation! Dress up, dress down, just dress yourself, as yourself. Bring it all out, except for the phones, put those away as much as you can.',
  ),
  _FestivalPrinciple(
    title: 'Leave no trace.',
    body:
        'Please help us keep this beautiful place clean, so events can continue to happen here. Clean up after yourselves, and support each other by cleaning up an extra piece. It only takes a small amount of awareness and effort from everyone, to leave the land the way we found it.',
  ),
  _FestivalPrinciple(
    title: 'If you see something, say something.',
    body:
        'If you see someone acting strangely, by themselves, or toward another, find one of our volunteers, or find any of the festival staff.',
  ),
  _FestivalPrinciple(
    title:
        'Consent: A foundational potion ingredient for any successful festival brew.',
    body:
        "A lot of us are strangers to each other, or friends of friends. Please be cordial and respectful of each other's space and autonomy. We want everyone to feel safe.\n\nKind words, and asking before touching, is essential for everyone to have a good time.",
  ),
  _FestivalPrinciple(
    title: 'Be self-reliant!',
    body:
        'Bring everything you need to party. The only things for purchase at the festival are from the food and art vendors.',
  ),
];
