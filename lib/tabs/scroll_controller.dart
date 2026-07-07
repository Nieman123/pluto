import 'package:flutter/material.dart';

final ScrollController homeScrollController = ScrollController();

void scrollToHomeSection(BuildContext context, int sectionIndex) {
  if (!homeScrollController.hasClients) {
    return;
  }

  final double viewportHeight = MediaQuery.of(context).size.height;
  final double targetOffset = sectionIndex * viewportHeight;
  final double maxOffset = homeScrollController.position.maxScrollExtent;

  homeScrollController.animateTo(
    targetOffset.clamp(0, maxOffset).toDouble(),
    curve: Curves.decelerate,
    duration: const Duration(milliseconds: 700),
  );
}
