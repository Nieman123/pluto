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

    final imageProvider = image;

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
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              spreadRadius: 1,
              blurRadius: 5,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                shape: isImageCircular
                    ? BoxShape.circle
                    : BoxShape.rectangle, // Conditionally set the shape
                borderRadius: isImageCircular
                    ? null
                    : BorderRadius.circular(
                        10), // Only round corners if not circular
              ),
              height: iconHeight, // Reserve space for the icon/image
              width: isImageCircular
                  ? iconHeight
                  : null, // If circular, set width to maintain aspect ratio
              child: ClipOval(
                child: imageProvider != null
                    ? Image(image: imageProvider, fit: BoxFit.cover)
                    : Icon(icon, size: iconHeight),
              ),
            ),
            const SizedBox(height: 10), // Space between image and text
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
