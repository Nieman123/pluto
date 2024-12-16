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
                    '🌟 Pluto Camp Out Schedule 🌟',
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
                      '5:00 PM - 7:00 PM: DJ Tero',
                      '7:00 PM - 9:00 PM: Celestial Dreamers',
                      '9:00 PM - 11:00 PM: Rhino',
                      '11:00 PM - 1:00 AM: Just Nieman',
                      '1:00 AM - 3:00 AM: remembermeNoT',
                      '3:00 AM - 5:00 AM: remembermeNoT',
                      '5:00 AM - 7:00 AM: Just Nieman B2B Divine Thud',
                      '7:00 AM - 9:00 AM: ',
                    ],
                  ),

                  // Schedule for Day 2
                  _buildDaySchedule(
                    day: 'Day 2: Friday, May 30th',
                    schedule: [
                      '3:00 PM - 5:00 PM: Divine Thud',
                      '5:00 PM - 7:00 PM: Eros Villa',
                      '7:00 PM - 9:00 PM: Black Note',
                      '9:00 PM - 11:00 PM: Herodose',
                      '11:00 PM - 1:00 AM: Just Nieman bass set',
                      '1:00 AM - 3:00 AM: Grimmjoi',
                      '3:00 AM - 5:00 AM: B2B2B',
                      '5:00 AM - 7:00 AM: Grandma Pam',
                      '7:00 AM - 9:00 AM: ',
                    ],
                  ),

                  // Schedule for Day 3
                  _buildDaySchedule(
                    day: 'Day 3: Saturday, May 31st',
                    schedule: [
                      '3:00 PM - 5:00 PM: XOsari',
                      '5:00 PM - 7:00 PM: DJ Colé',
                      '7:00 PM - 9:00 PM: Chris Felinski',
                      '9:00 PM - 11:00 PM: Divine Thud',
                      '11:00 PM - 1:00 AM: Bexiee',
                      '1:00 AM - 3:00 AM: In Plain Sight',
                      '3:00 AM - 5:00 AM: Celestial Dreamers',
                      '5:00 AM - 7:00 AM: Brandon Manitoba',
                      '7:00 AM - 9:00 AM: Whoever’s still up B2B',
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
    return Column(
      children: [
        Text(
          day,
          style: const TextStyle(
            textBaseline: TextBaseline.ideographic,
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: schedule
              .map(
                (entry) => Text(
                  entry,
                  style: const TextStyle(
                    fontSize: 16,
                    color: Colors.white70,
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}
