import 'package:flutter/material.dart';

final ScrollController homeScrollController = ScrollController();
final List<GlobalKey> homeSectionKeys = <GlobalKey>[
  GlobalKey(debugLabel: 'home-section'),
  GlobalKey(debugLabel: 'events-section'),
  GlobalKey(debugLabel: 'artists-section'),
  GlobalKey(debugLabel: 'contact-section'),
];

Future<void> scrollToHomeSection(int sectionIndex) async {
  if (sectionIndex < 0 || sectionIndex >= homeSectionKeys.length) {
    return;
  }

  if (_ensureSectionVisible(sectionIndex)) {
    return;
  }

  if (!homeScrollController.hasClients) {
    return;
  }

  final ScrollPosition position = homeScrollController.position;
  final double targetOffset = sectionIndex * position.viewportDimension;
  await homeScrollController.animateTo(
    targetOffset.clamp(0, position.maxScrollExtent).toDouble(),
    curve: Curves.easeOutCubic,
    duration: const Duration(milliseconds: 700),
  );

  await WidgetsBinding.instance.endOfFrame;
  _ensureSectionVisible(sectionIndex);
}

bool _ensureSectionVisible(int sectionIndex) {
  final BuildContext? sectionContext =
      homeSectionKeys[sectionIndex].currentContext;
  if (sectionContext == null) {
    return false;
  }

  Scrollable.ensureVisible(
    sectionContext,
    curve: Curves.easeOutCubic,
    duration: const Duration(milliseconds: 700),
  );
  return true;
}
