import 'dart:convert';

import 'package:flutter/services.dart';

const String manaFestContentAsset = 'site/content/manafest.json';

class ManaFestExperienceItem {
  const ManaFestExperienceItem({
    required this.text,
    this.linkText = '',
    this.url = '',
  });

  factory ManaFestExperienceItem.fromJson(Map<String, dynamic> json) {
    return ManaFestExperienceItem(
      text: _requiredString(json, 'text'),
      linkText: _optionalString(json, 'linkText'),
      url: _optionalString(json, 'url'),
    );
  }

  final String text;
  final String linkText;
  final String url;

  bool get hasLink => linkText.isNotEmpty && url.isNotEmpty;
}

class ManaFestExperienceGroup {
  const ManaFestExperienceGroup({
    required this.title,
    required this.items,
  });

  factory ManaFestExperienceGroup.fromJson(Map<String, dynamic> json) {
    final List<dynamic> rawItems = _requiredList(json, 'items');
    return ManaFestExperienceGroup(
      title: _requiredString(json, 'title'),
      items: rawItems
          .map(
            (dynamic item) => ManaFestExperienceItem.fromJson(
              _requiredMap(item, 'festival experience item'),
            ),
          )
          .toList(growable: false),
    );
  }

  final String title;
  final List<ManaFestExperienceItem> items;
}

class ManaFestExperience {
  const ManaFestExperience({
    required this.eyebrow,
    required this.title,
    required this.intro,
    required this.notice,
    required this.groups,
  });

  factory ManaFestExperience.fromJson(Map<String, dynamic> json) {
    final List<dynamic> rawGroups = _requiredList(json, 'groups');
    return ManaFestExperience(
      eyebrow: _requiredString(json, 'eyebrow'),
      title: _requiredString(json, 'title'),
      intro: _requiredString(json, 'intro'),
      notice: _requiredString(json, 'notice'),
      groups: rawGroups
          .map(
            (dynamic group) => ManaFestExperienceGroup.fromJson(
              _requiredMap(group, 'festival experience group'),
            ),
          )
          .toList(growable: false),
    );
  }

  final String eyebrow;
  final String title;
  final String intro;
  final String notice;
  final List<ManaFestExperienceGroup> groups;

  static Future<ManaFestExperience> load({AssetBundle? bundle}) async {
    final String source = await (bundle ?? rootBundle).loadString(
      manaFestContentAsset,
    );
    final Map<String, dynamic> root = _requiredMap(
      jsonDecode(source),
      'ManaFest content',
    );
    return ManaFestExperience.fromJson(
      _requiredMap(root['festivalExperience'], 'festivalExperience'),
    );
  }
}

String _requiredString(Map<String, dynamic> json, String key) {
  final dynamic value = json[key];
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('ManaFest content requires a non-empty "$key".');
  }
  return value.trim();
}

String _optionalString(Map<String, dynamic> json, String key) {
  final dynamic value = json[key];
  return value is String ? value.trim() : '';
}

List<dynamic> _requiredList(Map<String, dynamic> json, String key) {
  final dynamic value = json[key];
  if (value is! List<dynamic> || value.isEmpty) {
    throw FormatException('ManaFest content requires a non-empty "$key" list.');
  }
  return value;
}

Map<String, dynamic> _requiredMap(dynamic value, String label) {
  if (value is! Map<String, dynamic>) {
    throw FormatException('ManaFest content requires a "$label" object.');
  }
  return value;
}
