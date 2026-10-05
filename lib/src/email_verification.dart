import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

const String verificationEmailSent =
    'Verification email sent. Check your inbox and spam folder, then open the link to verify your account.';

Future<void> requestEmailVerification(User user) async {
  if (user.emailVerified) return;
  await user.sendEmailVerification(kIsWeb
      ? ActionCodeSettings(url: '${Uri.base.origin}/app/profile')
      : null);
}

/// Email delivery failure must not turn an already-created account into a
/// failed signup or encourage the customer to create it a second time.
Future<String> requestSignupVerification(User user) async {
  try {
    await requestEmailVerification(user);
    return user.emailVerified
        ? 'Your email is verified.'
        : verificationEmailSent;
  } catch (_) {
    return 'Your account was created, but the verification email could not be sent. Open Profile to try again.';
  }
}

class EmailVerificationPanel extends StatefulWidget {
  const EmailVerificationPanel({super.key, required this.user});
  final User user;

  @override
  State<EmailVerificationPanel> createState() => _EmailVerificationPanelState();
}

class _EmailVerificationPanelState extends State<EmailVerificationPanel> {
  bool _busy = false;
  String _message = '';

  Future<void> _send() => _run(() async {
        await requestEmailVerification(widget.user);
        return verificationEmailSent;
      });

  Future<void> _check() => _run(() async {
        await widget.user.reload();
        final User? user = FirebaseAuth.instance.currentUser;
        if (user?.uid != widget.user.uid) return '';
        await user!.getIdToken(true);
        return user.emailVerified
            ? 'Your email is verified.'
            : 'Your email is not verified yet. Open the link in your email, then try again.';
      });

  Future<void> _run(Future<String> Function() task) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final String message = await task();
      if (mounted) setState(() => _message = message);
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        setState(() => _message = error.code == 'too-many-requests'
            ? 'Please wait a little before trying again. Check your inbox and spam folder for the last email.'
            : 'Could not complete email verification. Check your connection and try again.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _message =
            'Could not complete email verification. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.user.emailVerified) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Row(children: <Widget>[
          Icon(Icons.verified_outlined, color: Color(0xFF9AE6B4), size: 20),
          SizedBox(width: 8),
          Text('Email verified', style: TextStyle(color: Color(0xFF9AE6B4))),
        ]),
      );
    }
    if (widget.user.email == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text('Verify your email',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
              'Verify ${widget.user.email} to link purchases to your account across devices. Request a link below, then open it in your email.',
              style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 12),
          Wrap(spacing: 12, runSpacing: 8, children: <Widget>[
            FilledButton(
                onPressed: _busy ? null : _send,
                child: const Text('Send verification email')),
            OutlinedButton(
                onPressed: _busy ? null : _check,
                child: const Text('I’ve verified my email')),
          ]),
          if (_message.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Semantics(
                liveRegion: true,
                child: Text(_message,
                    style: const TextStyle(color: Colors.white70))),
          ],
        ],
      ),
    );
  }
}
