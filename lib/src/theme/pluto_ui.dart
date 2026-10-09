import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

abstract final class PlutoColors {
  static const background = Color(0xFF100D16);
  static const surface = Color(0xFF21192C);
  static const ink = Color(0xFFF7F2FF);
  static const muted = Color(0xFFC5B8D3);
  static const lilac = Color(0xFFD4B2FF);
  static const orange = Color(0xFFFFB45C);
  static const mint = Color(0xFFB4F4CE);
}

/// One short entrance, never a looping effect. Rebuilds retain the animation's
/// state, and the OS reduced-motion preference renders the final frame directly.
class PlutoEntrance extends StatelessWidget {
  const PlutoEntrance({super.key, required this.child, this.offset = 14});
  final Widget child;
  final double offset;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, offset * (1 - value)),
          child: child,
        ),
      ),
    );
  }
}

class PlutoSurface extends StatelessWidget {
  const PlutoSurface(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(22),
      this.orbit = false,
      this.borderColor});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool orbit;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: orbit
                ? const [Color(0xFF39244B), Color(0xFF20182D)]
                : const [Color(0xFF241B30), Color(0xFF19141F)],
          ),
          border: Border.all(
              color: borderColor ?? PlutoColors.lilac.withValues(alpha: .2)),
        ),
        child: Stack(children: [
          if (orbit)
            const Positioned.fill(
                child: IgnorePointer(
                    child: CustomPaint(painter: PlutoOrbitPainter()))),
          Padding(padding: padding, child: child),
        ]),
      );
}

/// Thin orbit paths are painted once, without blur filters or animation tickers.
class PlutoOrbitPainter extends CustomPainter {
  const PlutoOrbitPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.translate(size.width * .9, size.height * .32);
    canvas.rotate(-.5);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = PlutoColors.lilac.withValues(alpha: .13);
    for (var i = 0; i < 4; i++) {
      final width = 110.0 + i * 65;
      canvas.drawOval(
          Rect.fromCenter(
              center: Offset.zero, width: width, height: width * .6),
          paint);
    }
    paint
      ..style = PaintingStyle.fill
      ..color = PlutoColors.orange.withValues(alpha: .8);
    canvas.drawCircle(const Offset(-104, 20), 4, paint);
    canvas.restore();
    // A quiet River Styx motif ties the orbital artwork to Pluto's underworld.
    paint
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = PlutoColors.orange.withValues(alpha: .1);
    for (var i = 0; i < 3; i++) {
      final y = size.height * .78 + i * 8;
      final river = Path()
        ..moveTo(-20, y)
        ..cubicTo(size.width * .28, y - 35, size.width * .58, y + 40,
            size.width + 20, y - 12);
      canvas.drawPath(river, paint);
    }
  }

  @override
  bool shouldRepaint(PlutoOrbitPainter oldDelegate) => false;
}

/// A real InkWell keeps keyboard activation, focus, semantics and touch targets.
class PlutoPressable extends StatefulWidget {
  const PlutoPressable(
      {super.key, required this.child, required this.onTap, this.radius = 24});
  final Widget child;
  final VoidCallback onTap;
  final double radius;
  @override
  State<PlutoPressable> createState() => _PlutoPressableState();
}

class _PlutoPressableState extends State<PlutoPressable> {
  bool _pressed = false;
  @override
  Widget build(BuildContext context) => AnimatedScale(
        scale: _pressed ? .985 : 1,
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 110),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(widget.radius),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            borderRadius: BorderRadius.circular(widget.radius),
            onHighlightChanged: (value) => setState(() => _pressed = value),
            onTap: () {
              if (!kIsWeb) HapticFeedback.selectionClick();
              widget.onTap();
            },
            child: widget.child,
          ),
        ),
      );
}

class PlutoTicketDivider extends StatelessWidget {
  const PlutoTicketDivider({super.key});
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 28,
        width: double.infinity,
        child: CustomPaint(painter: _PerforationPainter()),
      );
}

class _PerforationPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = PlutoColors.lilac.withValues(alpha: .3)
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 10) {
      canvas.drawLine(Offset(x, size.height / 2),
          Offset(math.min(x + 4, size.width), size.height / 2), paint);
    }
  }

  @override
  bool shouldRepaint(_PerforationPainter oldDelegate) => false;
}
