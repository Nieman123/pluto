import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'src/background/pluto_background.dart';
import 'src/nav_bar/nav_bar.dart';
import 'src/signed_in/signed_in_app_shell.dart';

class ManaFestPage extends StatelessWidget {
  const ManaFestPage({Key? key}) : super(key: key);

  static const String route = '/manafest';
  static const String _ticketUrl = 'https://posh.vip/e/manafest-2026';
  static const String _lineupFlyerUrl =
      '/manafest/manafest-2026-lineup-v1.webp';
  static const String _mapsUrl =
      'https://www.google.com/maps/search/?api=1&query=Three+Creeks+Campground+Anderson+South+Carolina';
  static const String _volunteerUrl = 'https://forms.gle/Cyh34mQduSKDUzpdA';
  static const String _vendorFormUrl = 'https://forms.gle/zUdyMvJRgkdNXvdM7';

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

  Widget _buildSection({
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

  Widget _buildHeroCard(BuildContext context) {
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
                    OutlinedButton.icon(
                      onPressed: () => _openLink(_mapsUrl),
                      icon: const Icon(Icons.map),
                      label: const Text('Open Directions'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openLink(_volunteerUrl),
                      icon: const Icon(Icons.map),
                      label: const Text('Volunteer Application'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openLink(_vendorFormUrl),
                      icon: const Icon(Icons.map),
                      label: const Text('Vendor Application'),
                    ),
                    TextButton(
                      onPressed: () => context.go('/'),
                      child: const Text('Back to Home'),
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
                SizedBox(
                  width: 320,
                  child: flyer,
                ),
                const SizedBox(width: 20),
                Expanded(child: content),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildLineupSection() {
    return _buildSection(
      title: 'Lineup',
      children: <Widget>[
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: AspectRatio(
                aspectRatio: 4 / 5,
                child: Image.network(
                  _lineupFlyerUrl,
                  fit: BoxFit.cover,
                  semanticLabel: 'ManaFest 2026 lineup flyer',
                  loadingBuilder: (
                    BuildContext context,
                    Widget child,
                    ImageChunkEvent? loadingProgress,
                  ) {
                    if (loadingProgress == null) {
                      return child;
                    }
                    return const ColoredBox(
                      color: Colors.black26,
                      child: Center(child: CircularProgressIndicator()),
                    );
                  },
                  errorBuilder: (
                    BuildContext context,
                    Object error,
                    StackTrace? stackTrace,
                  ) {
                    return const ColoredBox(
                      color: Colors.black26,
                      child: Center(
                        child: Icon(
                          Icons.broken_image,
                          color: Colors.white54,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Center(
          child: TextButton.icon(
            onPressed: () => _openLink(_lineupFlyerUrl),
            icon: const Icon(Icons.open_in_new),
            label: const Text('Open Full Flyer'),
          ),
        ),
      ],
    );
  }

  Widget _buildPageContent(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1080),
          child: Column(
            children: <Widget>[
              _buildHeroCard(context),
              const SizedBox(height: 12),
              _buildLineupSection(),
              const SizedBox(height: 12),
              _buildSection(
                title: 'Event Info',
                children: <Widget>[
                  const Text(
                    'For two nights in September, we’re taking over the woods at Three Creeks Campground in Anderson, SC.\n\n'
                    'Raw energy, heavy bass, and your favorite regional DJs dropping heaters on 40,000 watts of sound.\n\n'
                    'Bring your crew, set up camp, and lock in for a full weekend of underground sound in a setting that hits different.',
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
                    'Regional DJs, heavy bass, and 40,000 watts of sound are at the center of the weekend.',
                  ),
                  _buildBullet(
                    'Use the sections below for directions, camping details, and festival rules before you head in.',
                  ),
                ],
              ),
              _buildSection(
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
              _buildSection(
                title: 'Camping',
                children: <Widget>[
                  _buildBullet(
                    'Camp only in designated areas.',
                  ),
                  _buildBullet(
                    'Car camping pass is a separate pass. (one per vehicle)',
                  ),
                  _buildBullet(
                    'Pack for changing weather, including rain.',
                  ),
                  _buildBullet(
                    'Bring reusable water containers, personal lighting, and basic campsite gear.',
                  ),
                ],
              ),
              _buildSection(
                title: 'Festival Rules',
                children: <Widget>[
                  _buildBullet(
                    'Respect staff instructions, neighboring campsites, and all venue boundaries.',
                  ),
                  _buildBullet(
                    'Keep camps and shared spaces clean. Pack out what you pack in.',
                  ),
                  _buildBullet(
                    'Use approved fire-safe cooking and lighting setups only where permitted.',
                  ),
                ],
              ),
              const SizedBox(height: 8),
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
          _buildPageContent(context),
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
        if (snapshot.data == null) {
          return _buildStandaloneScaffold(context);
        }

        return SignedInAppShell(
          selectedTab: SignedInAppTab.manafest,
          maxContentWidth: 1080,
          child: _buildPageContent(context),
        );
      },
    );
  }
}
