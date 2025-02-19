import 'package:flutter/material.dart';

class ModernAppBarPage extends StatelessWidget {
  const ModernAppBarPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true, // Allows AppBar to overlay the content
      appBar: AppBar(
        backgroundColor: Colors.deepPurple.withOpacity(0.7), // Transparent color
        elevation: 0, // Removes shadow for a clean look
        centerTitle: true,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/experience/pluto-logo-small.png', // Replace with your logo path
              height: 30, // Logo size
            ),
            const SizedBox(width: 8),
            const Text(
              'Pluto Campout 2025',
              style: TextStyle(
                fontFamily: 'Montserrat', // Use a clean, custom font
                fontWeight: FontWeight.bold,
                fontSize: 80,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          // Background Image
          Positioned.fill(
            child: Image.asset(
              'assets/background.jpg', // Replace with your background image
              fit: BoxFit.cover,
            ),
          ),
          // Your page content
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Center(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.5), // Optional content overlay
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.all(16),
                child: const Text(
                  'Welcome to the Pluto Campout 2025!\nExperience unforgettable music and vibes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 18,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
