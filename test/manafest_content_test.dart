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
}
