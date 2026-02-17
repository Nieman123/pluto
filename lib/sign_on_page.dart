import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

class SignOnPage extends StatefulWidget {
  const SignOnPage({Key? key}) : super(key: key);

  @override
  State<SignOnPage> createState() => _SignOnPageState();
}

class _SignOnPageState extends State<SignOnPage> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _isBusy = false;
  String _statusMessage = '';

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _runAuthAction(Future<void> Function() action) async {
    if (_isBusy) {
      return;
    }

    setState(() {
      _isBusy = true;
      _statusMessage = '';
    });

    try {
      await action();
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Success.';
      });
    } on FirebaseAuthException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = error.message ?? 'Authentication error: ${error.code}';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
        });
      }
    }
  }

  Future<void> _signInWithEmail() async {
    await _runAuthAction(() async {
      final String email = _emailController.text.trim();
      final String password = _passwordController.text.trim();
      if (email.isEmpty || password.isEmpty) {
        throw FirebaseAuthException(
          code: 'missing-credentials',
          message: 'Email and password are required.',
        );
      }

      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    });
  }

  Future<void> _createAccount() async {
    await _runAuthAction(() async {
      final String email = _emailController.text.trim();
      final String password = _passwordController.text.trim();
      if (email.isEmpty || password.isEmpty) {
        throw FirebaseAuthException(
          code: 'missing-credentials',
          message: 'Email and password are required.',
        );
      }

      await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
    });
  }

  Future<void> _signInWithGoogle() async {
    await _runAuthAction(() async {
      if (!kIsWeb) {
        throw FirebaseAuthException(
          code: 'unsupported-platform',
          message: 'Google popup sign-in is configured for web.',
        );
      }

      await FirebaseAuth.instance.signInWithPopup(GoogleAuthProvider());
    });
  }

  Future<void> _signOut() async {
    await _runAuthAction(() async {
      await FirebaseAuth.instance.signOut();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sign On'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/'),
            child: const Text('Home'),
          ),
          TextButton(
            onPressed: () => context.go('/admin'),
            child: const Text('Admin'),
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
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Card(
                  color: Colors.black.withValues(alpha: 0.45),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: StreamBuilder<User?>(
                      stream: FirebaseAuth.instance.authStateChanges(),
                      builder: (BuildContext context,
                          AsyncSnapshot<User?> snapshot) {
                        final User? user = snapshot.data;

                        if (user != null) {
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Text(
                                'You are signed in.',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'Email: ${user.email ?? 'No email'}',
                                style: const TextStyle(color: Colors.white70),
                              ),
                              Text(
                                'UID: ${user.uid}',
                                style: const TextStyle(color: Colors.white70),
                              ),
                              const SizedBox(height: 16),
                              Wrap(
                                spacing: 12,
                                runSpacing: 12,
                                children: <Widget>[
                                  ElevatedButton(
                                    onPressed: _isBusy ? null : _signOut,
                                    child: const Text('Sign Out'),
                                  ),
                                  ElevatedButton(
                                    onPressed: () => context.go('/admin'),
                                    child: const Text('Open Admin'),
                                  ),
                                ],
                              ),
                            ],
                          );
                        }

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const Text(
                              'Sign in to manage events',
                              style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 14),
                            TextField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _passwordController,
                              obscureText: true,
                              decoration: const InputDecoration(
                                labelText: 'Password',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: <Widget>[
                                ElevatedButton(
                                  onPressed: _isBusy ? null : _signInWithEmail,
                                  child: const Text('Sign In'),
                                ),
                                OutlinedButton(
                                  onPressed: _isBusy ? null : _createAccount,
                                  child: const Text('Create Account'),
                                ),
                                OutlinedButton(
                                  onPressed: _isBusy ? null : _signInWithGoogle,
                                  child: const Text('Google Sign-In'),
                                ),
                              ],
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (_isBusy)
            Container(
              color: Colors.black45,
              child: const Center(child: CircularProgressIndicator()),
            ),
          if (_statusMessage.isNotEmpty)
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                margin: const EdgeInsets.all(24),
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
