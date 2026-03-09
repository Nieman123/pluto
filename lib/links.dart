import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

import 'link_box.dart';
import 'links_repository.dart';

class LinksPage extends StatelessWidget {
  const LinksPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final LinksRepository linksRepository = LinksRepository();

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
                StreamBuilder<List<LinksPageItem>>(
                  stream: linksRepository.watchItems(onlyActive: true),
                  builder: (BuildContext context,
                      AsyncSnapshot<List<LinksPageItem>> snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Padding(
                        padding: EdgeInsets.all(32),
                        child: CircularProgressIndicator(),
                      );
                    }

                    final List<LinksPageItem> items = snapshot.hasError
                        ? LinksRepository.defaultItems
                            .where((LinksPageItem item) => item.isActive)
                            .toList()
                        : (snapshot.data ?? <LinksPageItem>[]);
                    if (items.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No links are available right now.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white70),
                        ),
                      );
                    }

                    final List<Widget> children = <Widget>[];
                    String? currentSectionHeading;
                    for (final LinksPageItem item in items) {
                      if (item.sectionHeading != currentSectionHeading) {
                        currentSectionHeading = item.sectionHeading;
                        if (currentSectionHeading.isNotEmpty) {
                          children.add(const SizedBox(height: 20));
                          children.add(
                            Text(
                              currentSectionHeading,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                                fontSize: 30,
                              ),
                            ),
                          );
                          children.add(const SizedBox(height: 20));
                        }
                      }

                      children.add(
                        LinkBox(
                          icon: item.iconData,
                          image: item.imageProvider,
                          text: item.title,
                          isImageCircular: item.isImageCircular,
                          url: item.url,
                        ),
                      );
                    }

                    return Column(children: children);
                  },
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ]),
    );
  }
}
