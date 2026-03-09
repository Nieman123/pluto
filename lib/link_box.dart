import 'dart:math';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class LinkBox extends StatelessWidget {
  // New parameter to toggle image shape

  const LinkBox({
    Key? key,
    required this.icon,
    required this.text,
    required this.url,
    this.image, // Initialize the optional image parameter
    this.isImageCircular = false, // Default shape is square
  }) : super(key: key);
  final IconData icon;
  final String text;
  final String url;
  final ImageProvider? image; // Optional image parameter
  final bool isImageCircular;

  @override
  Widget build(BuildContext context) {
    final double buttonWidth =
        min(MediaQuery.of(context).size.width * 0.8, 800.0);
    const double iconHeight = 75;
    final ImageProvider? imageProvider = image;
    final Widget media = imageProvider != null
        ? Image(image: imageProvider, fit: BoxFit.cover)
        : Icon(
            icon,
            size: iconHeight * 0.72,
            color: const Color(0xFF141414),
          );

    return InkWell(
      onTap: () async {
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) {
          launchUrl(uri);
        }
      },
      child: Container(
        width: buttonWidth,
        height: 150.0,
        margin: const EdgeInsets.all(8),
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF141414),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white24),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              spreadRadius: 1,
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                shape: isImageCircular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius:
                    isImageCircular ? null : BorderRadius.circular(10),
              ),
              height: iconHeight,
              width: isImageCircular ? iconHeight : iconHeight + 18,
              clipBehavior: Clip.antiAlias,
              child: isImageCircular
                  ? ClipOval(child: media)
                  : ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: media,
                    ),
            ),
            const SizedBox(height: 10),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
