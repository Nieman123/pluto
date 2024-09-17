import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';
import 'link_box.dart';

class LinksPage extends StatelessWidget {
  const LinksPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(children: [
        const PlasmaRenderer(
          color: Color.fromARGB(68, 85, 0, 165),
          blur: 0.5,
          blendMode: BlendMode.plus,
          particleType: ParticleType.atlas,
          variation1: 1,
        ),
        SingleChildScrollView(
          // Make the column scrollable
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                const SizedBox(height: 20),
                GestureDetector(
                  // Wrap the CircleAvatar with GestureDetector
                  onTap: () {
                    context.go('/');
                  },
                  child: const CircleAvatar(
                    radius: 50,
                    backgroundImage:
                        AssetImage('assets/experience/pluto-logo-small.png'),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Pluto Events',
                  style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      fontSize: 30),
                ),
                const SizedBox(height: 20),
                const LinkBox(
                    icon: Icons.airplane_ticket,
                    image: AssetImage('assets/events/getaway-elysium-2.png'),
                    text: 'ELYSIUM TICKETS',
                    isImageCircular: true,
                    url: 'https://posh.vip/f/13bf1'),
                const LinkBox(
                    icon: Icons.music_note,
                    image: AssetImage('assets/home/constant/instagram.png'),
                    text: 'INSTAGRAM',
                    url: 'https://instagram.com/pluto.events.avl/'),
                const LinkBox(
                    icon: Icons.face,
                    image: AssetImage('assets/home/constant/facebook.png'),
                    text: 'FACEBOOK',
                    url:
                        'https://www.facebook.com/people/Pluto-Events/100095100467395/'),
                const LinkBox(
                    icon: Icons.face,
                    image: AssetImage('assets/home/constant/tiktok.png'),
                    text: 'TIKTOK',
                    url: 'https://www.tiktok.com/@pluto.events'),
                const SizedBox(height: 20),
                const Text(
                  'PLUTO MEMEBERS ON INSTA',
                  style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      fontSize: 30),
                ),
                const SizedBox(height: 20),
                const LinkBox(
                    icon: Icons.face,
                    image: NetworkImage('https://i.imgur.com/5I4TqyV.jpg'),
                    text: 'JUST NIEMAN',
                    url: 'https://www.instagram.com/justnieman/'),
                const LinkBox(
                    icon: Icons.face,
                    image: NetworkImage('https://i.imgur.com/FiHtYq3.jpeg'),
                    text: 'DIVINE THUD',
                    url: 'https://www.instagram.com/divine_thud_/'),
              ],
            ),
          ),
        ),
      ]),
    );
  }
}
