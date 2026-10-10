import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/edit_profile_page.dart';
import 'package:pluto/src/profile_identity_card.dart';
import 'package:pluto/user_profile_repository.dart';

UserProfile profile() => UserProfile(
    uid: 'member',
    displayName: 'Pluto Member',
    homeCity: 'Asheville',
    favoriteGenre: 'House',
    bio: 'Dance',
    profileImageDataUrl: '',
    pointsBalance: 100,
    lifetimePoints: 100,
    eventsAttended: 2,
    createdAt: null,
    updatedAt: null);
void main() {
  testWidgets(
      'profile summary has identity and edit navigation without editable fields',
      (tester) async {
    var edited = false;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ProfileIdentityCard(
                profile: profile(), onEdit: () => edited = true))));
    expect(find.text('Pluto Member'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Edit profile'));
    expect(edited, true);
  });
  testWidgets(
      'edit page preserves existing fields, validates name and submits all changes',
      (tester) async {
    Map<String, String>? saved;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ProfileEditForm(
                profile: profile(),
                onBack: () {},
                onSave: (value) async {
                  saved = value;
                }))));
    final fields = find.byType(TextFormField);
    expect(fields, findsNWidgets(4));
    await tester.enterText(fields.at(0), '');
    await tester.ensureVisible(find.text('Save profile'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save profile'));
    await tester.pump();
    expect(saved, isNull);
    expect(find.text('Enter your display name.'), findsOneWidget);
    await tester.ensureVisible(fields.at(0));
    await tester.enterText(fields.at(0), 'New name');
    await tester.ensureVisible(fields.at(1));
    await tester.enterText(fields.at(1), 'Durham');
    await tester.ensureVisible(fields.at(2));
    await tester.enterText(fields.at(2), 'Techno');
    await tester.ensureVisible(fields.at(3));
    await tester.enterText(fields.at(3), 'New bio');
    await tester.ensureVisible(find.text('Save profile'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save profile'));
    await tester.pump();
    expect(saved, {
      'displayName': 'New name',
      'homeCity': 'Durham',
      'favoriteGenre': 'Techno',
      'bio': 'New bio',
      'profileImageDataUrl': ''
    });
  });
}
