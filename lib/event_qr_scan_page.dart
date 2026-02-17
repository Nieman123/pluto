import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

import 'user_profile_repository.dart';

class EventQrScanPage extends StatefulWidget {
  const EventQrScanPage({Key? key}) : super(key: key);

  @override
  State<EventQrScanPage> createState() => _EventQrScanPageState();
}

class _EventQrScanPageState extends State<EventQrScanPage> {
  final UserProfileRepository _profileRepository = UserProfileRepository();
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const <BarcodeFormat>[BarcodeFormat.qrCode],
  );
  final TextEditingController _manualCodeController = TextEditingController();

  bool _isClaiming = false;
  String _statusMessage = 'Point your camera at the venue QR code.';
  String _lastScannedCode = '';
  DateTime? _lastScanTime;

  @override
  void dispose() {
    _manualCodeController.dispose();
    _scannerController.dispose();
    super.dispose();
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: const TextStyle(color: Colors.white70),
      border: const OutlineInputBorder(),
      enabledBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Colors.white54),
      ),
      focusedBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Colors.white),
      ),
    );
  }

  Future<void> _claimCode({
    required User user,
    required String rawCode,
  }) async {
    if (_isClaiming) {
      return;
    }

    final String trimmed = rawCode.trim();
    if (trimmed.isEmpty) {
      return;
    }

    final DateTime now = DateTime.now();
    if (_lastScannedCode == trimmed &&
        _lastScanTime != null &&
        now.difference(_lastScanTime!).inSeconds < 3) {
      return;
    }

    setState(() {
      _isClaiming = true;
      _statusMessage = 'Checking in...';
    });

    try {
      final EventQrClaimResult result =
          await _profileRepository.claimEventQrCode(
        user: user,
        scannedCode: trimmed,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _lastScannedCode = trimmed;
        _lastScanTime = DateTime.now();
        _statusMessage =
            'Success: +${result.pointsAwarded} Pluto Points for ${result.eventName}. '
            'New Pluto Points balance: ${result.newPointsBalance}.';
      });
    } on FirebaseException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = _friendlyClaimError(error);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Claim failed: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isClaiming = false;
        });
      }
    }
  }

  String _friendlyClaimError(FirebaseException error) {
    switch (error.code) {
      case 'invalid-code':
        return 'Invalid QR code value.';
      case 'qr-not-found':
        return 'This QR code is not recognized.';
      case 'qr-inactive':
        return 'This QR code is not active.';
      case 'qr-expired':
        return 'This QR code has expired.';
      case 'already-claimed':
        return 'You already checked in for this event.';
      case 'claim-cooldown':
        return error.message ??
            'Please wait a moment before claiming another event QR code.';
      case 'daily-claim-limit':
        return error.message ??
            "You reached today's event QR claim limit. Try again tomorrow.";
      default:
        return error.message ?? 'Claim failed (${error.code}).';
    }
  }

  Widget _buildSignedOutState() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: Card(
          color: Colors.black.withValues(alpha: 0.45),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Sign in required',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Sign in before scanning event QR codes for Pluto Points.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () => context.go('/sign-on'),
                  child: const Text('Open Sign On'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildScannerContent(User user) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 860),
          child: Card(
            color: Colors.black.withValues(alpha: 0.45),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text(
                    'Event QR Check-In',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Signed in as: ${user.email ?? user.uid}',
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Scan the venue QR code to add Pluto Points to your account.',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 14),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      height: 420,
                      child: Stack(
                        children: <Widget>[
                          MobileScanner(
                            controller: _scannerController,
                            onDetect: (BarcodeCapture capture) {
                              if (capture.barcodes.isEmpty) {
                                return;
                              }
                              final String rawValue =
                                  capture.barcodes.first.rawValue ?? '';
                              _claimCode(user: user, rawCode: rawValue);
                            },
                          ),
                          if (_isClaiming)
                            Container(
                              color: Colors.black54,
                              child: const Center(
                                child: CircularProgressIndicator(),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Manual code entry (fallback)',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _manualCodeController,
                    style: const TextStyle(color: Colors.white),
                    cursorColor: Colors.white,
                    decoration: _inputDecoration('Event QR code text'),
                  ),
                  const SizedBox(height: 10),
                  ElevatedButton(
                    onPressed: _isClaiming
                        ? null
                        : () {
                            _claimCode(
                              user: user,
                              rawCode: _manualCodeController.text,
                            );
                          },
                    child: const Text('Claim Pluto Points'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Event QR'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/'),
            child: const Text('Home'),
          ),
          TextButton(
            onPressed: () => context.go('/profile'),
            child: const Text('Profile'),
          ),
          TextButton(
            onPressed: () => context.go('/shop'),
            child: const Text('Rewards Shop'),
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
          StreamBuilder<User?>(
            stream: FirebaseAuth.instance.authStateChanges(),
            builder: (BuildContext context, AsyncSnapshot<User?> snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              final User? user = snapshot.data;
              if (user == null) {
                return _buildSignedOutState();
              }

              return _buildScannerContent(user);
            },
          ),
          if (_statusMessage.isNotEmpty)
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                margin: const EdgeInsets.all(18),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _statusMessage,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
