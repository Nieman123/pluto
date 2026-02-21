import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';
import 'package:url_launcher/url_launcher_string.dart';

class ManaFestPage extends StatelessWidget {
  const ManaFestPage({Key? key}) : super(key: key);

  static const String route = '/manafest';
  static const String _ticketUrl = 'https://posh.vip/e/manafest-2026';
  static const String _mapsUrl =
      'https://www.google.com/maps/search/?api=1&query=Three+Creeks+Campground+Anderson+South+Carolina';

  Future<void> _openLink(String url) async {
    final String normalizedUrl = url.trim();
    if (normalizedUrl.isEmpty) {
      return;
    }
    await launchUrlString(normalizedUrl, webOnlyWindowName: '_blank');
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

  Widget _buildSetTimeRow({
    required String slot,
    required String details,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 180,
            child: Text(
              slot,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          Expanded(
            child: Text(
              details,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 16,
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
                'assets/events/Mana-Fest-2026-Flyer-half.png',
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
                  'Attendee guide for event info, set times, directions, camping, and festival rules.',
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF121212),
        foregroundColor: Colors.white,
        title: const Text('ManaFest Attendee Info'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Home'),
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
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1080),
                child: Column(
                  children: <Widget>[
                    _buildHeroCard(context),
                    const SizedBox(height: 12),
                    _buildSection(
                      title: 'Event Info',
                      children: <Widget>[
                        const Text(
                          'ManaFest 2026 takes place at Three Creeks Campground in Anderson, South Carolina. '
                          'Use this page as your single source for attendee information before and during the event.',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 16,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 10),
                        _buildBullet(
                            'Purchase passes at the official ticket link above.'),
                        _buildBullet(
                            'Bring a valid photo ID and your ticket confirmation for check-in.'),
                        _buildBullet(
                            'Schedule and map updates will be posted here as needed.'),
                      ],
                    ),
                    _buildSection(
                      title: 'Set Times',
                      children: <Widget>[
                        const Text(
                          'Set times are being finalized. This section is live and will be updated with the full artist-by-artist schedule.',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 16,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _buildSetTimeRow(
                          slot: 'Day 1',
                          details: 'Full lineup and time slots: TBA',
                        ),
                        _buildSetTimeRow(
                          slot: 'Day 2',
                          details: 'Full lineup and time slots: TBA',
                        ),
                        _buildSetTimeRow(
                          slot: 'Day 3',
                          details: 'Full lineup and time slots: TBA',
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
                          'Camp only in designated attendee camping areas assigned by event staff.',
                        ),
                        _buildBullet(
                          'If car camping is allowed for your pass type, park only in marked zones.',
                        ),
                        _buildBullet(
                          'Pack for changing weather, including rain protection and warm layers.',
                        ),
                        _buildBullet(
                          'Bring reusable water containers, personal lighting, and basic campsite safety gear.',
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
                        _buildBullet(
                          'No harassment, violence, or unsafe behavior. Attendee safety comes first.',
                        ),
                        _buildBullet(
                          'Violation of venue or event rules may lead to removal without refund.',
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
