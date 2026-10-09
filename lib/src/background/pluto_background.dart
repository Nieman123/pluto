import 'package:flutter/material.dart';

class PlutoBackground extends StatelessWidget {
  const PlutoBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const RepaintBoundary(
        child: SizedBox.expand(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              Color(0xFF17101F),
              Color(0xFF21162D),
              Color(0xFF100D16),
            ],
          ),
        ),
      ),
    ));
  }
}
