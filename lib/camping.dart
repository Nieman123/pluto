import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

class CampingInfoPage extends StatelessWidget {
  const CampingInfoPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color.fromARGB(255, 115, 60, 175),
        title: const Text('Camping Info'),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          // Nature-inspired background animation
          const PlasmaRenderer(
            color: Color.fromARGB(255, 63, 3, 132),
            blur: 0.7,
            particleType: ParticleType.atlas,
            variation1: 0.7,
            variation2: 0.3,
            size: 1.0,
          ),
          SingleChildScrollView(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width > 800
                      ? 800
                      : MediaQuery.of(context).size.width * 0.9,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Camping Info Title
                      const Text(
                        '🌲 Camping Info 🌲',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),

                      // Section: Overview
                      _buildSection(
                        title: '🏕️ Camping Overview',
                        content:
                            'Camping at Pluto Camp Out is all about connecting with nature and enjoying a unique outdoor experience. '
                            'Set up your tent, hammock, or canopy in the beautiful Kuykendall Group Campground, located in the Pisgah National Forest.',
                      ),
                      const SizedBox(height: 16),

                      // Section: Essential Amenities
                      _buildSection(
                        title: '🚻 Essential Amenities',
                        content:
                            '- **Pit Toilet**: A basic toilet is available on-site.\n'
                            '- **Drinking Water**: A spigot with potable water is available—bring reusable bottles.\n'
                            '- **No Showers**: Plan accordingly with portable wipes, solar showers or other alternatives.',
                      ),
                      const SizedBox(height: 16),

                      // Section: Camping Rules
                      _buildSection(
                        title: '📜 Camping Rules',
                        content:
                            '- Keep your area clean and pack out all trash.\n'
                            '- Open flames only in designiated fire pits due to forest regulations. Portable stoves are permitted.\n'
                            '- Bring extra lighting for your campsite—it gets very dark at night.\n'
                            '- **No Dogs**',
                      ),
                      const SizedBox(height: 16),

                      // Section: Creek Crossing
                      _buildSection(
                        title: '🌊 Creek Crossing Alert',
                        content:
                            '**The road to the campground includes a creek crossing**. Heavy rains may temporarily make the crossing difficult. '
                            'We recommend a high-clearance or four-wheel-drive vehicle for safe access.',
                      ),
                      const SizedBox(height: 16),

                      // Section: Packing List
                      _buildSection(
                        title: '🎒 Recommended Packing List',
                        content:
                            '- Tent or hammock setup\n'
                            '- Warm clothing and rain gear\n'
                            '- Reusable water bottle\n'
                            '- Pop-up canopy\n'
                            '- Food and cooking equipment\n'
                            '- Lighting: headlamps, lanterns, or fairy lights\n'
                            '- Portable power bank for devices',
                      ),
                      const SizedBox(height: 24),

                      // Section: Call to Action
                      Center(
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor:
                                const Color.fromARGB(255, 115, 60, 175),
                            foregroundColor: Colors.white,
                          ),
                          onPressed: () {
                            GoRouter.of(context).go('/campout');
                          },
                          child: const Text('Back to Event Info'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection({required String title, required String content}) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
      const SizedBox(height: 8),
      RichText(
        text: TextSpan(
          style: const TextStyle(fontSize: 14, color: Colors.white70),
          children: _parseMarkdownBold(content),
        ),
      ),
      const SizedBox(height: 16),
    ],
  );
}

/// Helper function to parse bold text wrapped in ** into TextSpans
List<TextSpan> _parseMarkdownBold(String text) {
  final regex = RegExp(r'\*\*(.*?)\*\*'); // Matches text between **
  final spans = <TextSpan>[];
  int currentIndex = 0;

  for (final match in regex.allMatches(text)) {
    // Add regular text before the bold part
    if (match.start > currentIndex) {
      spans.add(TextSpan(text: text.substring(currentIndex, match.start)));
    }

    // Add bold text
    spans.add(TextSpan(
      text: match.group(1), // Extract text between **
      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
    ));

    currentIndex = match.end;
  }

  // Add remaining text after the last bold match
  if (currentIndex < text.length) {
    spans.add(TextSpan(text: text.substring(currentIndex)));
  }

  return spans;
}

}
