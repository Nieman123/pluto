import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'src/background/pluto_background.dart';
import 'src/nav_bar/nav_bar.dart';
import 'user_profile_repository.dart';

class SignUpPage extends StatefulWidget {
  const SignUpPage({Key? key}) : super(key: key);

  @override
  State<SignUpPage> createState() => _SignUpPageState();
}

class _SignUpPageState extends State<SignUpPage> {
  static const Color _panelColor = Color(0xE60C0910);
  static const Color _panelAltColor = Color(0xCC16101D);
  static const Color _fieldColor = Color(0xFF15111B);
  static const Color _textColor = Color(0xFFF4EFF8);
  static const Color _mutedTextColor = Color(0xB8F4EFF8);
  static const Color _accentColor = Color(0xFFD49CFF);
  static const Color _primaryButtonColor = Color(0xFF7F48D6);

  final UserProfileRepository _profileRepository = UserProfileRepository();
  final TextEditingController _displayNameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();

  bool _isBusy = false;
  bool _hidePassword = true;
  bool _hideConfirmPassword = true;
  String _statusMessage = '';

  @override
  void dispose() {
    _displayNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  InputDecoration _inputDecoration({
    required String labelText,
    required IconData icon,
    String? hintText,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      labelText: labelText,
      hintText: hintText,
      prefixIcon: Icon(icon, color: _mutedTextColor),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: _fieldColor,
      labelStyle: const TextStyle(color: _mutedTextColor),
      hintStyle: const TextStyle(color: Colors.white38),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Colors.white24),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: _accentColor, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
    );
  }

  Future<void> _createAccount() async {
    if (_isBusy) {
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _isBusy = true;
      _statusMessage = '';
    });

    try {
      final String displayName = _displayNameController.text.trim();
      final String email = _emailController.text.trim();
      final String password = _passwordController.text;
      final String confirmPassword = _confirmPasswordController.text;

      if (displayName.isEmpty) {
        throw FirebaseAuthException(
          code: 'missing-display-name',
          message: 'Enter the name you want to use inside Pluto.',
        );
      }
      if (email.isEmpty || password.isEmpty || confirmPassword.isEmpty) {
        throw FirebaseAuthException(
          code: 'missing-credentials',
          message: 'Name, email, and password are required.',
        );
      }
      if (password.length < 6) {
        throw FirebaseAuthException(
          code: 'weak-password',
          message: 'Use at least 6 characters for your password.',
        );
      }
      if (password != confirmPassword) {
        throw FirebaseAuthException(
          code: 'password-mismatch',
          message: 'The passwords do not match.',
        );
      }

      final UserCredential credential =
          await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      final User? createdUser = credential.user;
      if (createdUser == null) {
        throw FirebaseAuthException(
          code: 'missing-user',
          message: 'Account created, but the user profile was not returned.',
        );
      }

      await createdUser.updateDisplayName(displayName);
      await createdUser.reload();

      final User user = FirebaseAuth.instance.currentUser ?? createdUser;
      await _profileRepository.ensureProfileForUser(user);
      await _profileRepository.updateProfile(
        uid: user.uid,
        displayName: displayName,
        homeCity: '',
        favoriteGenre: '',
        bio: '',
        profileImageDataUrl: '',
      );

      if (!mounted) {
        return;
      }
      context.go('/');
    } on FirebaseAuthException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = _authErrorMessage(error);
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

  Future<void> _signUpWithGoogle() async {
    if (_isBusy) {
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _isBusy = true;
      _statusMessage = '';
    });

    try {
      if (!kIsWeb) {
        throw FirebaseAuthException(
          code: 'unsupported-platform',
          message: 'Google popup sign-up is configured for web.',
        );
      }

      final UserCredential credential =
          await FirebaseAuth.instance.signInWithPopup(GoogleAuthProvider());
      final User? user = credential.user ?? FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw FirebaseAuthException(
          code: 'missing-user',
          message: 'Google sign-up finished, but no user was returned.',
        );
      }

      await _profileRepository.ensureProfileForUser(user);

      if (!mounted) {
        return;
      }
      context.go('/');
    } on FirebaseAuthException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = _authErrorMessage(error);
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

  String _authErrorMessage(FirebaseAuthException error) {
    switch (error.code) {
      case 'email-already-in-use':
        return 'This email already has an account. Sign in instead.';
      case 'invalid-email':
        return 'Enter a valid email address.';
      case 'popup-closed-by-user':
        return 'Google sign-up was closed before it finished.';
      case 'weak-password':
        return error.message ?? 'Use a stronger password.';
      default:
        return error.message ?? 'Account creation failed: ${error.code}';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const NavBar(isDarkModeBtnVisible: true),
      body: Stack(
        children: <Widget>[
          const PlutoBackground(),
          SafeArea(
            child: StreamBuilder<User?>(
              stream: FirebaseAuth.instance.authStateChanges(),
              initialData: FirebaseAuth.instance.currentUser,
              builder: (BuildContext context, AsyncSnapshot<User?> snapshot) {
                final User? user = snapshot.data;
                if (user != null) {
                  return _buildSignedInState(user);
                }

                return LayoutBuilder(
                  builder: (
                    BuildContext context,
                    BoxConstraints constraints,
                  ) {
                    final bool isWide = constraints.maxWidth >= 860;
                    return SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                        isWide ? 32 : 18,
                        isWide ? 42 : 22,
                        isWide ? 32 : 18,
                        36,
                      ),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1060),
                          child: isWide
                              ? Row(
                                  children: <Widget>[
                                    Expanded(child: _buildPitchPanel(isWide)),
                                    const SizedBox(width: 30),
                                    SizedBox(
                                      width: 430,
                                      child: _buildSignUpForm(),
                                    ),
                                  ],
                                )
                              : Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: <Widget>[
                                    _buildPitchPanel(isWide),
                                    const SizedBox(height: 22),
                                    _buildSignUpForm(),
                                  ],
                                ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          if (_isBusy)
            Container(
              color: Colors.black45,
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  Widget _buildPitchPanel(bool isWide) {
    return Padding(
      padding: EdgeInsets.only(right: isWide ? 18 : 0),
      child: Column(
        crossAxisAlignment:
            isWide ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: <Widget>[
          SizedBox(
            width: isWide ? 124 : 96,
            height: isWide ? 124 : 96,
            child: Image.asset(
              'assets/experience/pluto-logo-small.webp',
              fit: BoxFit.contain,
            ),
          ),
          SizedBox(height: isWide ? 22 : 16),
          Text(
            'Create your Pluto account',
            textAlign: isWide ? TextAlign.left : TextAlign.center,
            style: TextStyle(
              color: _textColor,
              fontSize: isWide ? 42 : 30,
              height: 1.05,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 14),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Text(
              'Earn Pluto Points when you show up, redeem rewards from the shop, and keep your festival profile ready for the next event.',
              textAlign: isWide ? TextAlign.left : TextAlign.center,
              style: const TextStyle(
                color: _mutedTextColor,
                fontSize: 17,
                height: 1.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 0,
              ),
            ),
          ),
          const SizedBox(height: 26),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: _panelAltColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white12),
            ),
            child: const Column(
              children: <Widget>[
                _BenefitRow(
                  icon: Icons.confirmation_number_outlined,
                  title: 'Check in faster',
                  body:
                      'Your profile stays tied to your account across events.',
                ),
                SizedBox(height: 16),
                _BenefitRow(
                  icon: Icons.auto_awesome,
                  title: 'Build your points balance',
                  body: 'Scan eligible event QR codes and track rewards.',
                ),
                SizedBox(height: 16),
                _BenefitRow(
                  icon: Icons.card_giftcard,
                  title: 'Redeem from the shop',
                  body: 'Use Pluto Points for rewards when new drops open.',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSignUpForm() {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: _panelColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white24),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.32),
            blurRadius: 22,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Text(
            'Start earning tonight',
            style: TextStyle(
              color: _textColor,
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 7),
          const Text(
            'Create your account with the email you will use at events.',
            style: TextStyle(
              color: _mutedTextColor,
              fontSize: 14,
              height: 1.45,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 48,
            child: OutlinedButton.icon(
              onPressed: _isBusy ? null : _signUpWithGoogle,
              style: OutlinedButton.styleFrom(
                backgroundColor: const Color(0xFFF8F4FC),
                foregroundColor: const Color(0xFF17121D),
                disabledBackgroundColor: Colors.white24,
                disabledForegroundColor: Colors.white54,
                side: const BorderSide(color: Color(0xFFE7DEEF)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              icon: Image.network(
                'https://www.gstatic.com/marketing-cms/assets/images/d5/dc/cfe9ce8b4425b410b49b7f2dd3f3/g.webp',
                width: 20,
                height: 20,
                fit: BoxFit.contain,
                errorBuilder: (
                  BuildContext context,
                  Object error,
                  StackTrace? stackTrace,
                ) {
                  return const Icon(Icons.account_circle_outlined, size: 20);
                },
              ),
              label: const Text('Sign up with Google'),
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
                padding: EdgeInsets.symmetric(horizontal: 10),
                child: Text(
                  'or use email',
                  style: TextStyle(
                    color: _mutedTextColor,
                    fontWeight: FontWeight.w700,
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
          TextField(
            controller: _displayNameController,
            autofillHints: const <String>[AutofillHints.name],
            textInputAction: TextInputAction.next,
            style: const TextStyle(color: _textColor),
            cursorColor: _accentColor,
            decoration: _inputDecoration(
              labelText: 'Name',
              hintText: 'Your name',
              icon: Icons.person_outline,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _emailController,
            autofillHints: const <String>[AutofillHints.email],
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            style: const TextStyle(color: _textColor),
            cursorColor: _accentColor,
            decoration: _inputDecoration(
              labelText: 'Email',
              hintText: 'you@example.com',
              icon: Icons.alternate_email,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _passwordController,
            autofillHints: const <String>[AutofillHints.newPassword],
            obscureText: _hidePassword,
            textInputAction: TextInputAction.next,
            style: const TextStyle(color: _textColor),
            cursorColor: _accentColor,
            decoration: _inputDecoration(
              labelText: 'Password',
              icon: Icons.lock_outline,
              suffixIcon: IconButton(
                onPressed: () {
                  setState(() {
                    _hidePassword = !_hidePassword;
                  });
                },
                tooltip: _hidePassword ? 'Show password' : 'Hide password',
                icon: Icon(
                  _hidePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: _mutedTextColor,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmPasswordController,
            autofillHints: const <String>[AutofillHints.newPassword],
            obscureText: _hideConfirmPassword,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _createAccount(),
            style: const TextStyle(color: _textColor),
            cursorColor: _accentColor,
            decoration: _inputDecoration(
              labelText: 'Confirm password',
              icon: Icons.verified_user_outlined,
              suffixIcon: IconButton(
                onPressed: () {
                  setState(() {
                    _hideConfirmPassword = !_hideConfirmPassword;
                  });
                },
                tooltip:
                    _hideConfirmPassword ? 'Show password' : 'Hide password',
                icon: Icon(
                  _hideConfirmPassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: _mutedTextColor,
                ),
              ),
            ),
          ),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 160),
            child: _statusMessage.isEmpty
                ? const SizedBox(height: 18)
                : Padding(
                    padding: const EdgeInsets.only(top: 12, bottom: 6),
                    child: Container(
                      key: ValueKey<String>(_statusMessage),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF3A1720),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFB85B71)),
                      ),
                      child: Text(
                        _statusMessage,
                        style: const TextStyle(
                          color: Color(0xFFFFD6DF),
                          fontWeight: FontWeight.w700,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ),
          ),
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _isBusy ? null : _createAccount,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primaryButtonColor,
                foregroundColor: _textColor,
                disabledBackgroundColor: Colors.white12,
                disabledForegroundColor: Colors.white54,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              icon: _isBusy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: _textColor,
                      ),
                    )
                  : const Icon(Icons.person_add_alt_1),
              label: Text(_isBusy ? 'Creating Account' : 'Create Account'),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              const Text(
                'Already have an account?',
                style: TextStyle(
                  color: _mutedTextColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              TextButton(
                onPressed: _isBusy ? null : () => context.go('/sign-on'),
                style: TextButton.styleFrom(
                  foregroundColor: _accentColor,
                ),
                child: const Text('Sign in'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSignedInState(User user) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(22),
        child: Container(
          width: 430,
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: _panelColor,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white24),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(
                Icons.verified_user_rounded,
                color: _accentColor,
                size: 42,
              ),
              const SizedBox(height: 12),
              const Text(
                'You are already signed in.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _textColor,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                user.email ?? 'Signed in account',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _mutedTextColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => context.go('/'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _primaryButtonColor,
                    foregroundColor: _textColor,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Open Dashboard'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BenefitRow extends StatelessWidget {
  const _BenefitRow({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _SignUpPageState._primaryButtonColor.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            icon,
            color: _SignUpPageState._accentColor,
            size: 21,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: const TextStyle(
                  color: _SignUpPageState._textColor,
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                body,
                style: const TextStyle(
                  color: _SignUpPageState._mutedTextColor,
                  fontSize: 13,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
