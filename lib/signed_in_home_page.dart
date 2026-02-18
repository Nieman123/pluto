import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'current_events_repository.dart';

class SignedInHomePage extends StatelessWidget {
  SignedInHomePage({
    Key? key,
    required this.user,
  }) : super(key: key);

  final User user;
  final CurrentEventsRepository _eventsRepository = CurrentEventsRepository();

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

  Widget _buildQuickActionButton({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) {
    return SizedBox.expand(
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 28),
        label: Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  Widget _buildQuickActions(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('adminUsers')
          .doc(user.uid)
          .snapshots(),
      builder: (BuildContext context,
          AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>> adminSnapshot) {
        final bool isAdmin = adminSnapshot.data?.exists ?? false;

        final List<Widget> actionButtons = <Widget>[
          _buildQuickActionButton(
            label: 'Profile',
            icon: Icons.person,
            onPressed: () => context.go('/profile'),
          ),
          _buildQuickActionButton(
            label: 'Scan QR Code',
            icon: Icons.qr_code_scanner,
            onPressed: () => context.go('/scan-qr'),
          ),
          _buildQuickActionButton(
            label: 'Rewards Shop',
            icon: Icons.redeem,
            onPressed: () => context.go('/shop'),
          ),
          _buildQuickActionButton(
            label: 'Account',
            icon: Icons.settings,
            onPressed: () => context.go('/sign-on'),
          ),
        ];

        if (isAdmin) {
          actionButtons.add(
            _buildQuickActionButton(
              label: 'Admin',
              icon: Icons.admin_panel_settings,
              onPressed: () => context.go('/admin'),
            ),
          );
        }

        return LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            const double spacing = 12;
            final double buttonWidth = (constraints.maxWidth - spacing) / 2;

            return Wrap(
              alignment: WrapAlignment.center,
              spacing: spacing,
              runSpacing: spacing,
              children: actionButtons
                  .map(
                    (Widget button) => SizedBox(
                      width: buttonWidth,
                      height: 96,
                      child: button,
                    ),
                  )
                  .toList(),
            );
          },
        );
      },
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
                  'assets/experience/pluto-logo-small.png',
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
            _buildQuickActions(context),
          ],
        ),
      ),
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
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF121212),
        foregroundColor: Colors.white,
        title: SizedBox(
          height: 36,
          child: Image.asset(
            'assets/experience/pluto-logo-small.png',
            fit: BoxFit.contain,
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/profile'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Profile'),
          ),
          TextButton(
            onPressed: () => context.go('/scan-qr'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Scan QR'),
          ),
          TextButton(
            onPressed: () => context.go('/shop'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Rewards Shop'),
          ),
          TextButton(
            onPressed: () => FirebaseAuth.instance.signOut(),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Sign Out'),
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
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1200),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: <Widget>[
                  _buildHeaderCard(context),
                  const SizedBox(height: 14),
                  _buildUpcomingEventsCard(context),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
