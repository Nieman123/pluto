import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

/// Pluto styling stays outside the QR quiet zone. Square finder patterns,
/// opaque light background and dark modules preserve contrast at the door.
class TicketQr extends StatelessWidget {
  const TicketQr(
      {super.key,
      required this.data,
      required this.label,
      this.maxWidth = 340});
  final String data;
  final String label;
  final double maxWidth;
  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final width = constraints.maxWidth.clamp(0.0, maxWidth);
        final validation = QrValidator.validate(
            data: data, errorCorrectionLevel: QrErrorCorrectLevel.M);
        final codeWidth = (width - 18).clamp(0.0, maxWidth - 18);
        return Center(
            child: SizedBox(
                width: width,
                child: Container(
                  decoration: BoxDecoration(
                      color: const Color(0xFF211529),
                      border: Border.all(
                          color: const Color(0xFFFFBB78), width: 1.5),
                      borderRadius: BorderRadius.circular(18)),
                  padding: const EdgeInsets.all(7),
                  child:
                      Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 11),
                        child: Text('PLUTO',
                            style: TextStyle(
                                color: Color(0xFFFFBB78),
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.1))),
                    if (validation.qrCode != null)
                      Semantics(
                          label: label,
                          image: true,
                          child: CustomPaint(
                            size: Size.square(codeWidth),
                            painter: _TicketQrPainter(
                                QrImage(validation.qrCode!),
                                MediaQuery.devicePixelRatioOf(context)),
                          )),
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 11),
                        child: Text('SHOW AT THE DOOR',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                letterSpacing: 1.6))),
                  ]),
                )));
      });
}

class ZoomableTicketQr extends StatelessWidget {
  const ZoomableTicketQr({super.key, required this.data, required this.label});
  final String data;
  final String label;

  void _open(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: Colors.black87,
      transitionDuration:
          reducedMotion ? Duration.zero : const Duration(milliseconds: 240),
      pageBuilder: (context, animation, secondaryAnimation) {
        final screen = MediaQuery.sizeOf(context);
        final width = (screen.width - 48).clamp(80.0, 640.0);
        final maxWidth =
            width.clamp(80.0, (screen.height - 160).clamp(80.0, 640.0));
        return SafeArea(
          child: Center(
            child: Material(
              color: Colors.transparent,
              child: SizedBox(
                width: maxWidth,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Align(
                    alignment: Alignment.centerRight,
                    child: IconButton(
                      autofocus: true,
                      tooltip: 'Close enlarged QR',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: Colors.white),
                    ),
                  ),
                  TicketQr(
                      data: data, label: 'Enlarged $label', maxWidth: maxWidth),
                ]),
              ),
            ),
          ),
        );
      },
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        final eased = CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
            reverseCurve: Curves.easeInCubic);
        return FadeTransition(
          opacity: eased,
          child: ScaleTransition(
              scale: Tween<double>(begin: .85, end: 1).animate(eased),
              child: child),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        hint: 'Tap to enlarge the QR code',
        child: InkWell(
          onTap: () => _open(context),
          borderRadius: BorderRadius.circular(18),
          child: TicketQr(data: data, label: label),
        ),
      );
}

class _TicketQrPainter extends CustomPainter {
  _TicketQrPainter(this.image, this.pixelRatio);
  final QrImage image;
  final double pixelRatio;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    // Align modules to physical pixels; qr_flutter rounds to half logical pixels,
    // which can distort dense codes on a 1x display. Never cover modules with art.
    final module =
        (size.shortestSide * pixelRatio / (image.moduleCount + 8)).floor() /
            pixelRatio;
    if (module <= 0) return;
    final start =
        ((size.shortestSide - module * image.moduleCount) * pixelRatio / 2)
                .floor() /
            pixelRatio;
    final paint = Paint()
      ..color = const Color(0xFF201529)
      ..isAntiAlias = false;
    for (var row = 0; row < image.moduleCount; row++) {
      for (var col = 0; col < image.moduleCount; col++) {
        if (image.isDark(row, col))
          canvas.drawRect(
              Rect.fromLTWH(
                  start + col * module, start + row * module, module, module),
              paint);
      }
    }
  }

  @override
  bool shouldRepaint(_TicketQrPainter oldDelegate) =>
      oldDelegate.image != image || oldDelegate.pixelRatio != pixelRatio;
}
