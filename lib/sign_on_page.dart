import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

enum _CredentialAction {
  signIn,
  createAccount,
}

class SignOnPage extends StatefulWidget {
  const SignOnPage({Key? key}) : super(key: key);

  @override
  State<SignOnPage> createState() => _SignOnPageState();
}

class _SignOnPageState extends State<SignOnPage> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final FocusNode _emailFocusNode = FocusNode();
  final FocusNode _passwordFocusNode = FocusNode();

  bool _isBusy = false;
  bool _showPasswordStep = false;
  _CredentialAction _credentialAction = _CredentialAction.signIn;
  String _statusMessage = '';

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
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

  void _openPasswordStep(_CredentialAction action) {
    final String email = _emailController.text.trim();
    if (email.isEmpty) {
      setState(() {
        _statusMessage = 'Enter your email to continue.';
      });
      _emailFocusNode.requestFocus();
      return;
    }

    setState(() {
      _showPasswordStep = true;
      _credentialAction = action;
      _statusMessage = '';
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _passwordFocusNode.requestFocus();
      }
    });
  }

  void _backToEmailStep() {
    setState(() {
      _showPasswordStep = false;
      _passwordController.clear();
      _statusMessage = '';
    });
    _emailFocusNode.requestFocus();
  }

  Future<void> _submitPasswordStep() async {
    if (_credentialAction == _CredentialAction.createAccount) {
      await _createAccount();
      return;
    }
    await _signInWithEmail();
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
            onPressed: () => context.go('/'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Home'),
          ),
          TextButton(
            onPressed: () => context.go('/admin'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Admin'),
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
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    SizedBox(
                      width: 132,
                      height: 132,
                      child: Image.asset(
                        'assets/experience/pluto-logo-small.png',
                        fit: BoxFit.contain,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Card(
                      color: Colors.black.withValues(alpha: 0.6),
                      elevation: 12,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: const BorderSide(color: Colors.white24),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: StreamBuilder<User?>(
                          stream: FirebaseAuth.instance.authStateChanges(),
                          builder: (BuildContext context,
                              AsyncSnapshot<User?> snapshot) {
                            final User? user = snapshot.data;

                            if (user != null) {
                              return Column(
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  const Icon(
                                    Icons.verified_user_rounded,
                                    size: 42,
                                    color: Colors.white,
                                  ),
                                  const SizedBox(height: 10),
                                  const Text(
                                    'You are signed in.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 24,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'Email: ${user.email ?? 'No email'}',
                                    textAlign: TextAlign.center,
                                    style:
                                        const TextStyle(color: Colors.white70),
                                  ),
                                  Text(
                                    'UID: ${user.uid}',
                                    textAlign: TextAlign.center,
                                    style:
                                        const TextStyle(color: Colors.white70),
                                  ),
                                  const SizedBox(height: 16),
                                  Wrap(
                                    alignment: WrapAlignment.center,
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
                                      ElevatedButton(
                                        onPressed: () => context.go('/scan-qr'),
                                        child: const Text('Open Scanner'),
                                      ),
                                      ElevatedButton(
                                        onPressed: () => context.go('/shop'),
                                        child: const Text('Open Rewards Shop'),
                                      ),
                                    ],
                                  ),
                                ],
                              );
                            }

                            final bool createAccountFlow = _credentialAction ==
                                _CredentialAction.createAccount;

                            return Column(
                              mainAxisSize: MainAxisSize.min,
                              children: <Widget>[
                                Text(
                                  _showPasswordStep
                                      ? createAccountFlow
                                          ? 'Create your account'
                                          : 'Enter your password'
                                      : 'Sign in',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _showPasswordStep
                                      ? _emailController.text.trim()
                                      : 'Sign up to start earning Pluto Points and more',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: Colors.white70),
                                ),
                                const SizedBox(height: 16),
                                if (!_showPasswordStep) ...<Widget>[
                                  TextField(
                                    controller: _emailController,
                                    focusNode: _emailFocusNode,
                                    autofocus: true,
                                    keyboardType: TextInputType.emailAddress,
                                    textInputAction: TextInputAction.next,
                                    onSubmitted: (_) => _openPasswordStep(
                                        _CredentialAction.signIn),
                                    style: const TextStyle(color: Colors.white),
                                    cursorColor: Colors.white,
                                    decoration:
                                        _inputDecoration('Email').copyWith(
                                      hintText: 'you@example.com',
                                      hintStyle: const TextStyle(
                                        color: Colors.white54,
                                      ),
                                      suffixIcon: IconButton(
                                        onPressed: _isBusy
                                            ? null
                                            : () => _openPasswordStep(
                                                _CredentialAction.signIn),
                                        icon: const Icon(
                                          Icons.arrow_forward_rounded,
                                          color: Colors.white,
                                        ),
                                        tooltip: 'Continue',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  const Row(
                                    children: <Widget>[
                                      Expanded(
                                        child: Divider(
                                          color: Colors.white24,
                                          thickness: 1,
                                        ),
                                      ),
                                      Padding(
                                        padding: EdgeInsets.symmetric(
                                            horizontal: 10),
                                        child: Text(
                                          'or',
                                          style: TextStyle(
                                            color: Colors.white70,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                      Expanded(
                                        child: Divider(
                                          color: Colors.white24,
                                          thickness: 1,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 16),
                                  SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton.icon(
                                      onPressed:
                                          _isBusy ? null : _signInWithGoogle,
                                      style: OutlinedButton.styleFrom(
                                        backgroundColor: Colors.white,
                                        foregroundColor:
                                            const Color(0xFF202124),
                                        side: const BorderSide(
                                          color: Color(0xFFDADCE0),
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 14,
                                        ),
                                      ),
                                      icon: Image.network(
                                        'https://www.gstatic.com/marketing-cms/assets/images/d5/dc/cfe9ce8b4425b410b49b7f2dd3f3/g.webp',
                                        width: 20,
                                        height: 20,
                                        fit: BoxFit.contain,
                                      ),
                                      label: const Text('Continue with Google'),
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  const Row(
                                    children: <Widget>[
                                      Expanded(
                                        child: Divider(
                                          color: Colors.white24,
                                          thickness: 1,
                                        ),
                                      ),
                                      Padding(
                                        padding: EdgeInsets.symmetric(
                                            horizontal: 10),
                                        child: Text(
                                          "Don't have an account?",
                                          style: TextStyle(
                                            color: Colors.white70,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                      Expanded(
                                        child: Divider(
                                          color: Colors.white24,
                                          thickness: 1,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 16),
                                  SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton(
                                      onPressed: _isBusy
                                          ? null
                                          : () => _openPasswordStep(
                                              _CredentialAction.createAccount),
                                      style: OutlinedButton.styleFrom(
                                        backgroundColor: Colors.white,
                                        foregroundColor:
                                            const Color(0xFF202124),
                                        side: const BorderSide(
                                          color: Color(0xFFDADCE0),
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 14,
                                        ),
                                      ),
                                      child: const Text('Create account'),
                                    ),
                                  ),
                                ] else ...<Widget>[
                                  SizedBox(
                                    width: double.infinity,
                                    child: TextField(
                                      controller: _passwordController,
                                      focusNode: _passwordFocusNode,
                                      obscureText: true,
                                      textInputAction: TextInputAction.done,
                                      onSubmitted: (_) => _submitPasswordStep(),
                                      style:
                                          const TextStyle(color: Colors.white),
                                      cursorColor: Colors.white,
                                      decoration: _inputDecoration('Password'),
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  SizedBox(
                                    width: double.infinity,
                                    child: ElevatedButton(
                                      onPressed:
                                          _isBusy ? null : _submitPasswordStep,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor:
                                            const Color(0xFF2B5DDA),
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 14,
                                        ),
                                      ),
                                      child: Text(
                                        createAccountFlow
                                            ? 'Create Account'
                                            : 'Sign In',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Wrap(
                                    alignment: WrapAlignment.center,
                                    spacing: 4,
                                    children: <Widget>[
                                      TextButton(
                                        onPressed:
                                            _isBusy ? null : _backToEmailStep,
                                        style: TextButton.styleFrom(
                                          foregroundColor: Colors.white70,
                                        ),
                                        child: const Text('Back'),
                                      ),
                                      if (createAccountFlow)
                                        TextButton(
                                          onPressed: _isBusy
                                              ? null
                                              : () {
                                                  setState(() {
                                                    _credentialAction =
                                                        _CredentialAction
                                                            .signIn;
                                                  });
                                                },
                                          style: TextButton.styleFrom(
                                            foregroundColor: Colors.white70,
                                          ),
                                          child:
                                              const Text('Use sign in instead'),
                                        ),
                                    ],
                                  ),
                                ],
                              ],
                            );
                          },
                        ),
                      ),
                    ),
                  ],
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
