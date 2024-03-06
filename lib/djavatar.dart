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
        return AlertDialog(
          title: CustomText(
            text: name,
            fontSize: 18,
            color: Theme.of(context).primaryColorLight,
          ),
          backgroundColor: Colors.black45,
          content: SingleChildScrollView(
            // Wrap the content in a SingleChildScrollView
            child: Column(
              mainAxisSize: MainAxisSize.min, // Set the mainAxisSize to min
              children: [
                CustomText(
                  text: description,
                  fontSize: 16,
                  color: Colors.white,
                ),
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: GestureDetector(
                    onTap: () => _launchInstagram(instagramUrl),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(8.0),
                          child: Image.asset(
                            'assets/home/constant/instagram.png',
                            width: 24,
                            height: 24,
                          ),
                        ),
                        const CustomText(
                          text: 'FOLLOW ON INSTAGRAM',
                          fontSize: 16,
                          color: Colors.white,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              child: CustomText(
                text: 'Close',
                fontSize: 16,
                color: Theme.of(context).primaryColor,
              ),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _launchInstagram(String url) async {
    if (!await launchUrl(Uri.parse(url))) {
      // ignore: only_throw_errors
      throw 'Could not launch $url';
    }
  }
}
