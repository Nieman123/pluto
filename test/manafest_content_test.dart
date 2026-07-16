import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/manafest_content.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('shared ManaFest experience includes activities, notices, and links',
      () async {
    final ManaFestExperience experience = await ManaFestExperience.load();
    final List<ManaFestExperienceItem> items = experience.groups
        .expand((ManaFestExperienceGroup group) => group.items)
        .toList(growable: false);

    expect(experience.title, 'Around the festival');
    expect(experience.notice, '21+ event');
    expect(
      items.map((ManaFestExperienceItem item) => item.text),
      containsAll(<String>[
        'Sunrise sound bath',
        'Sunrise yoga',
        'Free tea each morning',
        'Custom T-shirt booth',
        'Free festival-wear boutique',
        'Instructional flow-arts classes',
        'Live painting',
        'Food by In Woking Distance and',
        'BYOB event. No alcohol will be sold on site.',
      ]),
    );
    expect(
      items
          .singleWhere(
            (ManaFestExperienceItem item) => item.linkText == '@pyro.possum',
          )
          .url,
      'https://www.instagram.com/pyro.possum/',
    );
    expect(
      items
          .singleWhere(
            (ManaFestExperienceItem item) => item.linkText == '@banh.gvl',
          )
          .url,
      'https://www.instagram.com/banh.gvl/',
    );
  });

  test('shared ManaFest guide includes sound system and gate times', () async {
    final String source = await rootBundle.loadString(manaFestContentAsset);
    final Map<String, dynamic> content =
        jsonDecode(source) as Map<String, dynamic>;
    final List<dynamic> sections = content['sections'] as List<dynamic>;
    final Map<String, dynamic> eventInfo = sections
        .cast<Map<String, dynamic>>()
        .singleWhere(
            (Map<String, dynamic> section) => section['title'] == 'Event Info');
    final Map<String, dynamic> gateTimes = sections
        .cast<Map<String, dynamic>>()
        .singleWhere(
            (Map<String, dynamic> section) => section['title'] == 'Gate Times');
    final Map<String, dynamic> camping = sections
        .cast<Map<String, dynamic>>()
        .singleWhere(
            (Map<String, dynamic> section) => section['title'] == 'Camping');
    final Map<String, dynamic> checkIn = sections
        .cast<Map<String, dynamic>>()
        .singleWhere(
            (Map<String, dynamic> section) => section['title'] == 'Check-in');
    final Map<String, dynamic> festivalRules = sections
        .cast<Map<String, dynamic>>()
        .singleWhere((Map<String, dynamic> section) =>
            section['title'] == 'Festival Rules');

    expect(
      eventInfo['body'],
      contains('Main Stage will be powered by BASSBOSS speakers'),
    );
    expect(gateTimes['body'], contains('Thursday Early Arrival: 2–9 PM'));
    expect(gateTimes['body'], contains('Friday and Saturday: 10 AM–9 PM'));
    expect(gateTimes['body'], contains('Early Arrival pass is required'));
    expect(gateTimes['body'], contains('leave and re-enter during the day'));
    expect(checkIn['body'], contains('valid government-issued photo ID'));
    expect(checkIn['body'], contains('Festival tickets are digital'));
    expect(checkIn['body'], contains('Car camping passes are also digital'));
    expect(camping['body'], contains('No generators, please'));
    expect(camping['body'], contains('No glass'));
    expect(festivalRules['body'], contains('No weapons'));
    expect(festivalRules['body'], contains('No pets'));
    expect(festivalRules['body'], contains('No campfires or grills'));
    expect(
        festivalRules['body'], contains('Personal sound systems are allowed'));
  });
}
