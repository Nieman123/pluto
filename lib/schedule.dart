import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

class SchedulePage extends StatelessWidget {
  const SchedulePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color.fromARGB(255, 115, 60, 175),
        title: const Text('Schedule Info'),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          // Nature-inspired background
          const PlasmaRenderer(
            color: Color.fromARGB(255, 63, 3, 132),
            blur: 0.7,
            particleType: ParticleType.atlas,
            variation1: 0.7,
            variation2: 0.3,
            size: 1.0,
          ),
          SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  const Text(
                    '🌟 Pluto Campout Schedule 🌟',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),

                  // Schedule for Day 1
                  _buildDaySchedule(
                    day: 'Day 1: Thursday, May 29th',
                    schedule: [
                      '3:00 PM - 5:00 PM: Open Decks',
                      '5:00 PM - 7:00 PM: Tero',
                      '7:00 PM - 9:00 PM: Celestial Dreamers',
                      '9:00 PM - 11:00 PM: Chris Felinski',
                      '11:00 PM - 1:00 AM: Just Nieman',
                      '1:00 AM - 5:00 AM: Remember Me Not',
                      '5:00 AM - 7:00 AM: Just Nieman B2B Divine Thud',
                      '7:00 AM - 9:00 AM: Dark Side of the Moon Listening Party',
                    ],
                  ),

                  // Schedule for Day 2
                  _buildDaySchedule(
                    day: 'Day 2: Friday, May 30th',
                    schedule: [
                      '3:00 PM - 5:00 PM: Divine Thud',
                      '5:00 PM - 7:00 PM: Eros',
                      '7:00 PM - 9:00 PM: Tato',
                      '9:00 PM - 11:00 PM: Herodose',
                      '11:00 PM - 1:00 AM: Just Nieman',
                      '1:00 AM - 3:00 AM: Grimmjoi',
                      '3:00 AM - 5:00 AM: Grandma Pam',
                      '5:00 AM - 7:00 AM: B2B2B',
                      '7:00 AM - 9:00 AM: Chanti',
                    ],
                  ),

                  // Schedule for Day 3
                  _buildDaySchedule(
                    day: 'Day 3: Saturday, May 31st',
                    schedule: [
                      '3:00 PM - 5:00 PM: XO sarii',
                      '5:00 PM - 7:00 PM: Rhino',
                      '7:00 PM - 9:00 PM: Citron',
                      '9:00 PM - 11:00 PM: Divine Thud',
                      '11:00 PM - 1:00 AM: Bexiee',
                      '1:00 AM - 3:00 AM: In Plain Sight',
                      '3:00 AM - 5:00 AM: Celestial Dreamers',
                      '5:00 AM - 7:00 AM: Brandon Manitoba',
                      '7:00 AM - 9:00 AM: Open Decks',
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Back Button
                  Center(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Color.fromARGB(255, 115, 60, 175),
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
        ],
      ),
    );
  }

  Widget _buildDaySchedule({required String day, required List<String> schedule}) {
  return Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 600),
      child: Card(
      elevation: 4,
      color: Colors.black.withOpacity(0.3),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              day,
              textAlign: TextAlign.left,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                shadows: [
                  Shadow(
                    color: Colors.black45,
                    offset: Offset(1, 1),
                    blurRadius: 2,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            ...schedule.map((entry) {
              final parts = entry.split(': ');
              final timePart = parts[0] + ': ';
              final artistPart = parts.length > 1 ? parts.sublist(1).join(': ') : '';
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: timePart,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w400,
                            color: Colors.white70,
                          ),
                        ),
                        if (artistPart.isNotEmpty)
                          TextSpan(
                            text: artistPart,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Divider(color: Colors.white24, height: 1),
                  const SizedBox(height: 8),
                ],
              );
            }).toList(),
          ],
        ),
      ),
      ),
    ),
  );
}
}
