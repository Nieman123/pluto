import 'package:flutter/material.dart';

class PlutoBackground extends StatelessWidget {
  const PlutoBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const SizedBox.expand(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              Color(0xFF141118),
              Color(0xFF24172E),
              Color(0xFF101014),
            ],
          ),
        ),
      ),
    );
  }
}
