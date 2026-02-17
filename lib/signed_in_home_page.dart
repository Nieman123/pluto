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

  Widget _buildQuickActions(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: <Widget>[
        ElevatedButton.icon(
          onPressed: () => context.go('/profile'),
          icon: const Icon(Icons.person),
          label: const Text('Profile'),
        ),
        ElevatedButton.icon(
          onPressed: () => context.go('/scan-qr'),
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Scan QR Code'),
        ),
        OutlinedButton.icon(
          onPressed: () => context.go('/profile'),
          icon: const Icon(Icons.redeem),
          label: const Text('Rewards Shop'),
        ),
        OutlinedButton.icon(
          onPressed: () => context.go('/sign-on'),
          icon: const Icon(Icons.settings),
          label: const Text('Account'),
        ),
        StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection('adminUsers')
              .doc(user.uid)
              .snapshots(),
          builder: (BuildContext context,
              AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>>
                  adminSnapshot) {
            final bool isAdmin = adminSnapshot.data?.exists ?? false;
            if (!isAdmin) {
              return const SizedBox.shrink();
            }

            return OutlinedButton.icon(
              onPressed: () => context.go('/admin'),
              icon: const Icon(Icons.admin_panel_settings),
              label: const Text('Admin'),
            );
          },
        ),
      ],
    );
  }

  Widget _buildHeaderCard(BuildContext context) {
    final String displayName = _displayNameForUser(user);

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Wrap(
              spacing: 14,
              runSpacing: 10,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: <Widget>[
                Container(
                  width: 72,
                  height: 72,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white10,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: Image.asset(
                    'assets/experience/pluto-logo-small.png',
                    fit: BoxFit.contain,
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Welcome back, $displayName',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Signed in as ${user.email ?? user.uid}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ],
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
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
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
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    event.title.isEmpty ? 'Upcoming Event' : event.title,
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
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
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
              return Text(
                'Could not load events: ${snapshot.error}',
                style: const TextStyle(color: Colors.white70),
              );
            }

            final List<CurrentEvent> events = snapshot.data ?? <CurrentEvent>[];
            if (events.isEmpty) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const <Widget>[
                  Text(
                    'Upcoming Events',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'No active events right now. Check back soon.',
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Upcoming Events',
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
        title: const Text('Pluto'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/profile'),
            child: const Text('Profile'),
          ),
          TextButton(
            onPressed: () => context.go('/scan-qr'),
            child: const Text('Scan QR'),
          ),
          TextButton(
            onPressed: () => FirebaseAuth.instance.signOut(),
            child: const Text('Sign Out'),
          ),
        ],
      ),
      body: Stack(
        children: <Widget>[
          const PlasmaRenderer(
            type: PlasmaType.infinity,
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
