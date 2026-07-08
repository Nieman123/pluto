import 'package:flutter/material.dart';

final ScrollController homeScrollController = ScrollController();
final List<GlobalKey> homeSectionKeys = <GlobalKey>[
  GlobalKey(debugLabel: 'home-section'),
  GlobalKey(debugLabel: 'events-section'),
  GlobalKey(debugLabel: 'artists-section'),
  GlobalKey(debugLabel: 'contact-section'),
];

const Duration _sectionScrollDuration = Duration(milliseconds: 700);
const Duration _sectionSeekDuration = Duration(milliseconds: 180);
const int _maxSectionSeekAttempts = 12;
const double _sectionSeekViewportStep = 0.85;

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

  for (int attempt = 0; attempt < _maxSectionSeekAttempts; attempt += 1) {
    final bool moved = await _moveTowardSection(sectionIndex);
    if (!moved) {
      break;
    }

    if (_ensureSectionVisible(sectionIndex)) {
      return;
    }
  }

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
    duration: _sectionScrollDuration,
  );
  return true;
}

Future<bool> _moveTowardSection(int sectionIndex) async {
  if (!homeScrollController.hasClients) {
    return false;
  }

  final ScrollPosition position = homeScrollController.position;
  final int direction = _scrollDirectionFor(sectionIndex, position);
  final double targetOffset = _nextSeekOffset(
    sectionIndex: sectionIndex,
    direction: direction,
    position: position,
  );

  if ((targetOffset - position.pixels).abs() < 1) {
    await WidgetsBinding.instance.endOfFrame;
    return false;
  }

  await homeScrollController.animateTo(
    targetOffset,
    curve: Curves.easeOutCubic,
    duration: _sectionSeekDuration,
  );
  await WidgetsBinding.instance.endOfFrame;
  return true;
}

double _nextSeekOffset({
  required int sectionIndex,
  required int direction,
  required ScrollPosition position,
}) {
  if (sectionIndex == 0) {
    return position.minScrollExtent;
  }

  if (sectionIndex == homeSectionKeys.length - 1 && direction > 0) {
    return position.maxScrollExtent;
  }

  final double step = position.viewportDimension * _sectionSeekViewportStep;
  final double targetOffset = position.pixels + (step * direction);
  return targetOffset.clamp(position.minScrollExtent, position.maxScrollExtent);
}

int _scrollDirectionFor(int sectionIndex, ScrollPosition position) {
  final List<int> mountedIndexes = _mountedSectionIndexes();
  if (mountedIndexes.isEmpty) {
    final double estimatedOffset = sectionIndex * position.viewportDimension;
    return estimatedOffset >= position.pixels ? 1 : -1;
  }

  final int firstMountedIndex = mountedIndexes.first;
  final int lastMountedIndex = mountedIndexes.last;
  if (sectionIndex < firstMountedIndex) {
    return -1;
  }
  if (sectionIndex > lastMountedIndex) {
    return 1;
  }

  final double estimatedOffset = sectionIndex * position.viewportDimension;
  return estimatedOffset >= position.pixels ? 1 : -1;
}

List<int> _mountedSectionIndexes() {
  final List<int> indexes = <int>[];
  for (int index = 0; index < homeSectionKeys.length; index += 1) {
    if (homeSectionKeys[index].currentContext != null) {
      indexes.add(index);
    }
  }
  return indexes;
}
