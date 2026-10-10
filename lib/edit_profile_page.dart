import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'src/theme/pluto_ui.dart';
import 'user_profile_repository.dart';

class EditProfilePage extends StatefulWidget {
  const EditProfilePage({super.key});
  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage> {
  final _repository = UserProfileRepository();
  late final Future<UserProfile?> _profile;
  @override
  void initState() {
    super.initState();
    _profile = _loadProfile();
  }

  Future<UserProfile?> _loadProfile() async {
    final user = await FirebaseAuth.instance.authStateChanges().first;
    if (user == null) return null;
    await _repository.ensureProfileForUser(user);
    return _repository
        .watchProfile(
            uid: user.uid,
            fallbackDisplayName: user.displayName ?? 'Pluto Member')
        .first;
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<UserProfile?>(
      future: _profile,
      builder: (context, snapshot) {
        final user = FirebaseAuth.instance.currentUser;
        if (user == null)
          return Center(
              child: TextButton(
                  onPressed: () => context.go('/sign-on'),
                  child: const Text('Sign in to edit your profile')));
        if (snapshot.hasError)
          return const Center(
              child: Text(
                  'Could not load your profile. Please return and try again.'));
        if (!snapshot.hasData)
          return const Center(child: CircularProgressIndicator());
        return ColoredBox(
            color: PlutoColors.background,
            child: ProfileEditForm(
                profile: snapshot.data!,
                onBack: () {
                  if (context.canPop())
                    context.pop();
                  else
                    context.go('/profile');
                },
                onSave: (values) async {
                  await _repository.updateProfile(
                      uid: user.uid,
                      displayName: values['displayName']!,
                      homeCity: values['homeCity']!,
                      favoriteGenre: values['favoriteGenre']!,
                      bio: values['bio']!,
                      profileImageDataUrl: values['profileImageDataUrl']!);
                  if (context.mounted) {
                    if (context.canPop())
                      context.pop();
                    else
                      context.go('/profile');
                  }
                }));
      });
}

class ProfileEditForm extends StatefulWidget {
  const ProfileEditForm(
      {super.key,
      required this.profile,
      required this.onSave,
      required this.onBack});
  final UserProfile profile;
  final Future<void> Function(Map<String, String>) onSave;
  final VoidCallback onBack;
  @override
  State<ProfileEditForm> createState() => _ProfileEditFormState();
}

class _ProfileEditFormState extends State<ProfileEditForm> {
  final _form = GlobalKey<FormState>();
  late final Map<String, TextEditingController> _fields;
  late String _image;
  bool _saving = false;
  String _error = '';
  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    _fields = {
      for (final entry in {
        'displayName': p.displayName,
        'homeCity': p.homeCity,
        'favoriteGenre': p.favoriteGenre,
        'bio': p.bio
      }.entries)
        entry.key: TextEditingController(text: entry.value)
    };
    _image = p.profileImageDataUrl;
  }

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _pickImage() async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
        withData: true);
    if (result == null || result.files.isEmpty || !mounted) return;
    final file = result.files.first, bytes = file.bytes;
    if (bytes == null || bytes.length > 700000) {
      setState(() => _error = 'Choose a picture smaller than 700 KB.');
      return;
    }
    final mime = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp'
    }[file.extension?.toLowerCase()];
    if (mime == null) {
      setState(() => _error = 'Choose a PNG, JPEG or WebP picture.');
      return;
    }
    setState(() {
      _image = encodeDataUrl(bytes: bytes, mimeType: mime);
      _error = '';
    });
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = '';
    });
    try {
      await widget.onSave({
        for (final field in _fields.entries) field.key: field.value.text.trim(),
        'profileImageDataUrl': _image
      });
    } catch (_) {
      if (mounted)
        setState(() =>
            _error = 'Your changes could not be saved. Please try again.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final Uint8List? bytes = decodeDataUrl(_image);
    return ListView(padding: const EdgeInsets.all(20), children: [
      Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 680),
              child: Card(
                color: PlutoColors.surface,
                semanticContainer: false,
                child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Form(
                        key: _form,
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton.icon(
                                      onPressed: _saving ? null : widget.onBack,
                                      icon: const Icon(Icons.arrow_back),
                                      label: const Text('My Profile'))),
                              const Text('Edit profile',
                                  style: TextStyle(
                                      fontSize: 28,
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 20),
                              Center(
                                  child: CircleAvatar(
                                      radius: 48,
                                      backgroundImage: bytes == null
                                          ? null
                                          : MemoryImage(bytes),
                                      child: bytes == null
                                          ? const Icon(Icons.person, size: 40)
                                          : null)),
                              const SizedBox(height: 12),
                              Wrap(
                                  alignment: WrapAlignment.center,
                                  spacing: 12,
                                  children: [
                                    TextButton.icon(
                                        onPressed: _saving ? null : _pickImage,
                                        icon: const Icon(
                                            Icons.add_a_photo_outlined),
                                        label: const Text('Change picture')),
                                    if (_image.isNotEmpty)
                                      TextButton(
                                          onPressed: _saving
                                              ? null
                                              : () =>
                                                  setState(() => _image = ''),
                                          child: const Text('Remove picture')),
                                  ]),
                              for (final field in {
                                'displayName': 'Display Name',
                                'homeCity': 'Home City',
                                'favoriteGenre': 'Favorite Genre',
                                'bio': 'Bio'
                              }.entries)
                                Padding(
                                    padding: const EdgeInsets.only(top: 16),
                                    child: TextFormField(
                                        controller: _fields[field.key],
                                        enabled: !_saving,
                                        maxLines: field.key == 'bio' ? 4 : 1,
                                        maxLength:
                                            field.key == 'bio' ? 1000 : 150,
                                        textCapitalization: field.key == 'bio'
                                            ? TextCapitalization.sentences
                                            : TextCapitalization.words,
                                        decoration: InputDecoration(
                                            labelText: field.value),
                                        validator: field.key == 'displayName'
                                            ? (v) => v!.trim().isEmpty
                                                ? 'Enter your display name.'
                                                : null
                                            : null)),
                              if (_error.isNotEmpty)
                                Padding(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 12),
                                    child: Text(_error,
                                        style: const TextStyle(
                                            color: Colors.orangeAccent))),
                              const SizedBox(height: 20),
                              FilledButton.icon(
                                  onPressed: _saving ? null : _save,
                                  icon: const Icon(Icons.check),
                                  label: Text(
                                      _saving ? 'Saving…' : 'Save profile')),
                            ]))),
              )))
    ]);
  }
}
