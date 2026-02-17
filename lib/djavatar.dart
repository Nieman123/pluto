import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../src/custom/custom_text.dart';

class DJAvatar extends StatelessWidget {
  const DJAvatar({
    Key? key,
    required this.name,
    required this.description,
    required this.image,
    this.size = 350.0,
    required this.instagramUrl,
  }) : super(key: key);

  final String name;
  final String description;
  final ImageProvider image;
  final double size;
  final String instagramUrl;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        GestureDetector(
          onTap: () => _showDJDescription(context),
          child: Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: 30.0, vertical: 30.0),
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                image: DecorationImage(
                  fit: BoxFit.fill,
                  image: image, // Use the provided ImageProvider
                ),
              ),
            ),
          ),
        ),
        CustomText(
          text: name,
          fontSize: 18,
          color: Theme.of(context).primaryColorLight,
        ),
      ],
    );
  }

  void _showDJDescription(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return Dialog(
          backgroundColor: Colors.black45,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
                maxWidth: 600), // Set your desired max width
            child: FractionallySizedBox(
              widthFactor:
                  0.9, // Makes the dialog take up to 90% of the screen width
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize
                      .min, // Ensures the column takes up only necessary space
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: CustomText(
                        text: name,
                        fontSize: 18,
                        color: Theme.of(context).primaryColorLight,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: CustomText(
                        text: description,
                        fontSize: 16,
                        color: Colors.white,
                      ),
                    ),
                    GestureDetector(
                      onTap: () => _launchInstagram(instagramUrl),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Image.asset(
                              'assets/home/constant/instagram.png',
                              width: 24,
                              height: 24,
                            ),
                            const Padding(
                              padding: EdgeInsets.only(left: 8.0),
                              child: CustomText(
                                text: 'FOLLOW ON INSTAGRAM',
                                fontSize: 16,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    TextButton(
                      child: CustomText(
                        text: 'Close',
                        fontSize: 16,
                        color: Theme.of(context).primaryColor,
                      ),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _launchInstagram(String url) async {
    if (!await launchUrl(Uri.parse(url))) {
      throw Exception('Could not launch $url');
    }
  }
}
