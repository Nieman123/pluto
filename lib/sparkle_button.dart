import 'package:flutter/material.dart';
import 'package:flutter_glow/flutter_glow.dart';

class SparkleButton extends StatefulWidget {
  const SparkleButton({super.key, required this.text, required this.onPressed});
  final String text;
  final VoidCallback onPressed;

  @override
  _SparkleButtonState createState() => _SparkleButtonState();
}

class _SparkleButtonState extends State<SparkleButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        // Glow Animation
        GlowButton(
          color: const Color.fromARGB(255, 115, 60, 175),
          onPressed: widget.onPressed,
          child: Text(
            widget.text,
            style: const TextStyle(fontSize: 16, color: Colors.white),
          ),
        ),
        // Animated Sparkles
        Positioned.fill(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return CustomPaint(
                painter: SparklePainter(progress: _controller.value),
              );
            },
          ),
        ),
      ],
    );
  }
}

class SparklePainter extends CustomPainter {
  SparklePainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.5)
      ..style = PaintingStyle.fill;

    // Draw sparkles at dynamic positions based on progress
    final sparkles = [
      Offset(size.width * progress, size.height * 0.2),
      Offset(size.width * (1 - progress), size.height * 0.8),
      Offset(size.width * 0.5, size.height * progress),
    ];

    for (final sparkle in sparkles) {
      canvas.drawCircle(sparkle, 3, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
