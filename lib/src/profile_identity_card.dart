import 'package:flutter/material.dart';
import '../user_profile_repository.dart';
import 'theme/pluto_ui.dart';

class ProfileIdentityCard extends StatelessWidget {
  const ProfileIdentityCard(
      {super.key, required this.profile, required this.onEdit, this.photoUrl});
  final UserProfile profile;
  final VoidCallback onEdit;
  final String? photoUrl;
  @override
  Widget build(BuildContext context) {
    final bytes = profile.profileImageBytes;
    final ImageProvider? image = bytes != null
        ? MemoryImage(bytes)
        : (photoUrl?.isNotEmpty ?? false)
            ? NetworkImage(photoUrl!)
            : null;
    return Card(
        color: PlutoColors.surface,
        child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(children: [
              CircleAvatar(
                  radius: 40,
                  backgroundImage: image,
                  child: image == null
                      ? const Icon(Icons.person_outline, size: 36)
                      : null),
              const SizedBox(width: 18),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(profile.displayName,
                        style: const TextStyle(
                            fontSize: 23, fontWeight: FontWeight.bold)),
                    if (profile.homeCity.isNotEmpty)
                      Text(profile.homeCity,
                          style: const TextStyle(color: Colors.white70)),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                        onPressed: onEdit,
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Edit profile')),
                  ])),
            ])));
  }
}
