import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'src/account_deletion.dart';
import 'src/google_auth.dart';
import 'src/theme/pluto_ui.dart';
import 'src/ticket_access_store.dart';
import 'src/ticket_session_cleanup.dart';
import 'ticketing_repository.dart';

const _receiptKey = 'pluto-deletion-receipt';

class DeleteAccountPage extends StatefulWidget {
  const DeleteAccountPage({super.key});
  @override
  State<DeleteAccountPage> createState() => _DeleteAccountPageState();
}

class _DeleteAccountPageState extends State<DeleteAccountPage> {
  final _password = TextEditingController();
  final _api = TicketingRepository(
      tokenProvider: () async =>
          FirebaseAuth.instance.currentUser?.getIdToken(true));
  final _statusApi = TicketingRepository(tokenProvider: () async => null);
  bool _busy = false, _accepted = false, _pending = false, _completed = false;
  String _message = '', _receipt = '', _deletionUid = '';
  bool _checking = false, _localCleared = false;
  Timer? _poll;
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    await ticketAccessInitialize();
    await FirebaseAuth.instance.authStateChanges().first;
    final saved = ticketAccessRead(_receiptKey);
    if (saved == null || !mounted) return;
    try {
      final data = jsonDecode(saved) as Map;
      _receipt = data['receipt'] as String;
      _deletionUid = data['uid'] as String;
      final current = FirebaseAuth.instance.currentUser;
      if (current != null && current.uid != _deletionUid) {
        _receipt = '';
        return;
      }
    } catch (_) {
      await ticketAccessRemove(_receiptKey);
      return;
    }
    await _checkStatus();
  }

  Future<void> _clearLocalAccount() async {
    if (_localCleared) return;
    final current = FirebaseAuth.instance.currentUser;
    if (current != null && current.uid != _deletionUid) return;
    _localCleared = true;
    await signOutOfPluto();
    // Deletion clears web credentials too, even when ordinary browser sign-out
    // leaves saved anonymous checkout proofs available on that device.
    for (final key in attendeeKeysToRemoveOnDeletion(ticketAccessKeys())) {
      await ticketAccessRemove(key);
    }
  }

  Future<void> _checkStatus() async {
    if (_checking || _receipt.isEmpty) return;
    _checking = true;
    try {
      final result = await _statusApi
          .request('account/deletion-status', {'receipt': _receipt});
      if (!mounted) return;
      final completed = result['status'] == 'completed';
      setState(() {
        _pending = !completed;
        _completed = completed;
        _message = '';
      });
      await _clearLocalAccount();
      if (completed)
        _poll?.cancel();
      else
        _poll ??=
            Timer.periodic(const Duration(seconds: 5), (_) => _checkStatus());
    } on TicketingException catch (error) {
      if (error.status == 404) {
        await ticketAccessRemove(_receiptKey);
        _receipt = '';
      } else if (mounted)
        setState(() => _message =
            'Could not check completion. Your saved confirmation is safe; try again.');
    } catch (_) {
      if (mounted)
        setState(
            () => _message = 'Could not check completion. Please try again.');
    } finally {
      _checking = false;
    }
  }

  Future<void> _delete(User user) async {
    if (_busy || !_accepted) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final proof = await confirmDeletionIdentity(user, _password.text);
      _password.clear();
      _receipt = _receipt.isEmpty
          ? List.generate(
              32,
              (_) => Random.secure()
                  .nextInt(256)
                  .toRadixString(16)
                  .padLeft(2, '0')).join()
          : _receipt;
      _deletionUid = user.uid;
      await ticketAccessWrite(
          _receiptKey, jsonEncode({'receipt': _receipt, 'uid': _deletionUid}));
      await _api.request('account/delete',
          {'confirmation': 'DELETE', 'receipt': _receipt, ...proof});
      if (!mounted) return;
      setState(() => _pending = true);
      await _clearLocalAccount();
      await _checkStatus();
    } catch (error) {
      // A timeout can occur after acceptance. Check the saved receipt before
      // reporting failure, rather than sending a second destructive request.
      if (_receipt.isNotEmpty) await _checkStatus();
      if (mounted && !_pending && !_completed)
        setState(() => _message = error is FirebaseAuthException
            ? (error.code == 'wrong-password' ||
                    error.code == 'invalid-credential'
                ? 'That password did not match. Please try again.'
                : 'Identity confirmation did not finish. Please try again.')
            : error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _api.dispose();
    _statusApi.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    String provider = '';
    if (user != null) {
      try {
        provider = deletionProvider(user.providerData.map((p) => p.providerId));
      } catch (_) {/* Explain unsupported authentication below. */}
    }
    return ColoredBox(
        color: PlutoColors.background,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Align(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 680),
                  child: Card(
                    color: PlutoColors.surface,
                    semanticContainer: false,
                    child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton.icon(
                                      onPressed: _busy
                                          ? null
                                          : () => context.go('/profile'),
                                      icon: const Icon(Icons.arrow_back),
                                      label: const Text('My Profile'))),
                              const Text('Delete account',
                                  style: TextStyle(
                                      fontSize: 28,
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 16),
                              if (_completed) ...[
                                const Icon(Icons.check_circle_outline,
                                    color: Colors.greenAccent, size: 48),
                                const SizedBox(height: 12),
                                const Text('Your account has been deleted.',
                                    style: TextStyle(fontSize: 20)),
                                const SizedBox(height: 12),
                                const Text(deletionRetention),
                                TextButton(
                                    onPressed: () => context.go('/sign-on'),
                                    child: const Text('Back to sign in')),
                              ] else if (_pending) ...[
                                const LinearProgressIndicator(),
                                const SizedBox(height: 16),
                                const Text(
                                    'Deletion is in progress. You have been signed out. You can close this page and return to check completion; your confirmation is saved on this device.'),
                                TextButton(
                                    onPressed: _checkStatus,
                                    child: const Text('Check completion')),
                              ] else ...[
                                const Text(deletionExplanation),
                                const SizedBox(height: 12),
                                const Text(deletionRetention),
                                const SizedBox(height: 16),
                                if (user == null)
                                  ElevatedButton(
                                      onPressed: () => context.go(
                                          '/sign-on?returnTo=%2Fdelete-account'),
                                      child: const Text(
                                          'Sign in to delete account'))
                                else ...[
                                  Text(
                                      'Account: ${user.email ?? user.displayName ?? 'Pluto member'}'),
                                  const SizedBox(height: 12),
                                  if (provider == 'password')
                                    TextField(
                                        controller: _password,
                                        obscureText: true,
                                        enabled: !_busy,
                                        autofillHints: const [
                                          AutofillHints.password
                                        ],
                                        decoration: const InputDecoration(
                                            labelText:
                                                'Confirm your password')),
                                  CheckboxListTile(
                                      contentPadding: EdgeInsets.zero,
                                      value: _accepted,
                                      onChanged: _busy
                                          ? null
                                          : (v) => setState(
                                              () => _accepted = v ?? false),
                                      title: const Text(
                                          'I understand this is permanent and I will lose account access to my tickets.')),
                                  FilledButton.icon(
                                      style: FilledButton.styleFrom(
                                          backgroundColor:
                                              const Color(0xFFAD304B),
                                          foregroundColor: Colors.white),
                                      onPressed: !_accepted ||
                                              _busy ||
                                              provider.isEmpty
                                          ? null
                                          : () => _delete(user),
                                      icon: const Icon(Icons.delete_forever),
                                      label: Text(_busy
                                          ? 'Confirming…'
                                          : provider == 'apple.com'
                                              ? 'Confirm with Apple & delete account'
                                              : provider == 'google.com'
                                                  ? 'Confirm with Google & delete account'
                                                  : 'Permanently delete account')),
                                ],
                              ],
                              if (_message.isNotEmpty)
                                Padding(
                                    padding: const EdgeInsets.only(top: 16),
                                    child: Text(_message,
                                        style: const TextStyle(
                                            color: Colors.orangeAccent))),
                            ])),
                  ))),
        ]));
  }
}
