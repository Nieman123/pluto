import 'package:flutter/material.dart';
import 'package:flutter_glow/flutter_glow.dart';

class SparkleButton extends StatefulWidget {
  final String text;
  final VoidCallback onPressed;

  const SparkleButton({Key? key, required this.text, required this.onPressed})
      : super(key: key);

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
  final double progress;

  SparklePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.5)
      ..style = PaintingStyle.fill;

    // Draw sparkles at dynamic positions based on progress
    final sparkles = [
      Offset(size.width * progress, size.height * 0.2),
      Offset(size.width * (1 - progress), size.height * 0.8),
      Offset(size.width * 0.5, size.height * progress),
    ];

    for (var sparkle in sparkles) {
      canvas.drawCircle(sparkle, 3, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
