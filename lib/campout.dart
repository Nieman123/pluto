import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';
import 'package:url_launcher/url_launcher_string.dart';

class CampoutPage extends StatelessWidget {
  const CampoutPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color.fromARGB(255, 115, 60, 175),
        titleTextStyle: const TextStyle(color: Colors.white),
        title: const Text('Pluto Campout 2025'),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          // Nature-inspired animated background
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
                    children: [
                      // Event Flyer
                      ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width > 800
                              ? 800
                              : MediaQuery.of(context).size.width * 0.9,
                          maxHeight: MediaQuery.of(context).size.height > 600
                              ? 600
                              : MediaQuery.of(context).size.height * 0.5,
                        ),
                        child: Image.asset(
                          'assets/pluto-campout-compressed.png',
                          fit: BoxFit.contain,
                        ),
                      ),

                      const SizedBox(height: 16),

                      // Section: Event Overview
                      _buildSection(
                        title: '🌲 Welcome to Pluto Campout 2025 🌲',
                        content:
                            '🚨 POSTPONED 🚨 \n\n Unfortunately we recieved an email from the Forest Service yesterday evening informing us that we need to cancel or relocate the event. \n\n We are working diligently to aquire new dates and a venue for this event. Stay tuned and we are so sorry for the inconvience. \n\nGet ready for three nights of music, community, and nature at the inaugural Pluto Campout! Join us in the Pisgah National Forest for an unforgettable weekend celebrating local talent, connection, and the beauty of the outdoors.',
                        context: context,
                      ),

                      const SizedBox(height: 24),

                      Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // Navigation Links (in a Row)
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color.fromARGB(255, 115, 60, 175),
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(
                                      200, 50), // Uniform button size
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () {
                                  launchUrlString(
                                      'https://posh.vip/e/pluto-campout');
                                },
                                child: const Text('Buy Tickets'),
                              ),
                              const SizedBox(width: 16),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color.fromARGB(255, 115, 60, 175),
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(
                                      200, 50), // Uniform button size
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () {
                                  GoRouter.of(context).go('/camping');
                                },
                                child: const Text('Camping Info'),
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          // Call to Action Buttons
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color.fromARGB(255, 115, 60, 175),
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(
                                      200, 50), // Uniform button size
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () {
                                  GoRouter.of(context).go('/schedule');
                                },
                                child: const Text('Schedule'),
                              ),
                              const SizedBox(width: 16),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color.fromARGB(255, 115, 60, 175),
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(200, 50),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () {
                                  launchUrlString(
                                      'https://instagram.com/pluto.events.avl');
                                },
                                child: const Text('Follow for Updates'),
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color.fromARGB(255, 115, 60, 175),
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(
                                      200, 50), // Uniform button size
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () {
                                  launchUrlString(
                                      'https://docs.google.com/forms/d/e/1FAIpQLSfTMKhUHXlYZ9G2POUUx09GRm83D7ZPy5ELNGcJ9t7EyO37hQ/viewform?usp=header');
                                },
                                child: const Text('Volunteer Application'),
                              ),
                            ],
                          )
                        ],
                      ),

                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 16),

                          // Section: Experience
                          _buildSection(
                            title: '🏕️ The Experience',
                            content:
                                'Local Artists, Local Vibes: Pluto Campout is a celebration of Asheville’s music communities.\n\n'
                                'Immersive Camping: Relax in nature with friends, explore hiking trails to find the waterfall, shop from local vendors, or dance under the stars. Bring your lights and pop-up canopies!\n\n'
                                'Daytime Workshops: Enjoy a variety of activities including yoga, crafting, and more to spark your creativity and help you unwind.\n\n'
                                'Festival Boutique & Trading Post: Donate or trade unique finds at our boutique, a special space for exchanging items.\n\n'
                                'Free Dinners: Savor two complimentary dinners (while supplies last) to refuel and connect with fellow campers.\n\n'
                                'Rain or Shine: The fun never stops - our event is on, no matter the weather!\n\n'
                                'All Beef Hot Dogs provided by Slinging Dawgs Worldwide, on Friday and Saturday nights.\n\n',
                            context: context,
                          ),
                          const SizedBox(height: 24),

                          // Section: Essential Info
                          _buildSection(
                            title: '🎟️ Tickets & Camping Info',
                            content:
                                'Tickets: 🎟️ \$80 Early Bird (ends March 1st) / \$100 GA\n\n'
                                'Car Pass: 🚗 \$20 (required for vehicle entry)\n\n'
                                'Amenities: 🚻 Bathrooms and water spigot available. No showers.\n\n'
                                'Tent & Vibes: ⛺ Bring your tent, your best vibes, and your best friends!\n\n'
                                'Camping: 🏕️ Free camping is included with your ticket. No RVs allowed.\n\n'
                                //'BYOB: 🍻 Bring your own beverages. NO GLASS bottles, please.\n\n'
                                'No Pets: 🐾 Please leave your furry friends at home.\n\n'
                                'Age: 🔞 18+ only.\n\n'
                                'Food: 🍽️ Please bring your own food. Slinging Dawgs will be serving hot dogs on Friday and Saturday nights.\n\n'
                                'Fires: 🔥 Fires in designated areas only.\n\n'
                                'Leave No Trace: ♻️ Pack it in, pack it out. Help keep the forest clean by taking your trash with you.\n\n'
                                'Parking: 🅿️ Limited parking available. Carpooling is encouraged.\n\n',
                            context: context,
                          ),
                          const SizedBox(height: 16),
                        ],
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

  Widget _buildSection(
      {required String title,
      required String content,
      required BuildContext context}) {
    final screenWidth = MediaQuery.of(context).size.width;

    return Column(
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: screenWidth > 800
                ? 24
                : 20, // Larger font size for wider screens
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          content,
          style: TextStyle(
            fontSize: screenWidth > 800
                ? 16
                : 14, // Adjust font size for smaller screens
            color: Colors.white70,
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}
