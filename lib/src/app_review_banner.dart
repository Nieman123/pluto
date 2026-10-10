import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../ticketing_repository.dart';

class AppReviewBanner extends StatefulWidget {
  const AppReviewBanner({super.key});
  @override
  State<AppReviewBanner> createState() => _AppReviewBannerState();
}

class _AppReviewBannerState extends State<AppReviewBanner> {
  Stream<DocumentSnapshot<Map<String, dynamic>>>? _enrollment;
  final _api = TicketingRepository();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null)
      _enrollment = FirebaseFirestore.instance
          .collection('appReviewAccounts')
          .doc(uid)
          .snapshots();
  }

  Future<void> _guide() async {
    final refill = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Explore the demo'),
                content: const SingleChildScrollView(
                    child: Text(
                        'Home shows sample events. Tickets contains sample admission and a confirmed RSVP; tap a QR to enlarge it. Orders shows sample order details.\n\nRedeem sample rewards with your demo points. In Scan QR Code, enter PLUTO-REVIEW to try a scavenger hunt claim (once per account). Profile shows your points history and lets you edit your sample profile.\n\nNothing purchases admission, changes real points or sends email. You can refill sample points whenever needed.')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Close')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Refill demo points'))
                ]));
    if (refill != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await _api.request('review/refill', {});
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(result['message'] as String)));
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: _enrollment,
          builder: (context, snapshot) {
            if (snapshot.data?.exists != true) return const SizedBox.shrink();
            final enabled = snapshot.data?.data()?['enabled'] == true;
            return Semantics(
                container: true,
                explicitChildNodes: true,
                child: Material(
                    color: const Color(0xFF322347),
                    child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 4),
                        child: Row(children: [
                          const Icon(Icons.science_outlined, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(
                                  enabled
                                      ? 'Demo account • sample data only'
                                      : 'Demo access disabled • contact Pluto',
                                  style: const TextStyle(fontSize: 12))),
                          if (enabled)
                            TextButton(
                                onPressed: _busy ? null : _guide,
                                child: const Text('Demo guide'))
                        ]))));
          });

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }
}
