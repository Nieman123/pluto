import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher_string.dart';

import '../current_events_repository.dart';
import '../src/custom/custom_text.dart';

class Event extends StatelessWidget {
  const Event({Key? key}) : super(key: key);

  static const String _fallbackTitle = 'ManaFest 2026';
  static const String _fallbackDetails = 'Live music + community gathering';
  static const String _fallbackTicketUrl = 'https://posh.vip/e/manafest-2026';
  static const String _galleryBaseUrl = String.fromEnvironment(
    'GALLERY_BASE_URL',
    defaultValue: '/gallery/',
  );

  static const List<List<String>> _imageList = <List<String>>[
    <String>['2.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-10.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-12.webp', 'Photo by @tatehunna.photography'],
    <String>['15.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-3.webp', 'Photo by @tatehunna.photography'],
    <String>['4.webp', 'Photo by @nickyg.photos'],
    <String>['elysium-11.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-9.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-8.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-1.webp', 'Photo by @tatehunna.photography'],
    <String>['11.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-2.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-7.webp', 'Photo by @tatehunna.photography'],
    <String>['10.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-6.webp', 'Photo by @tatehunna.photography'],
    <String>['elysium-4.webp', 'Photo by @tatehunna.photography'],
    <String>['14.webp', 'Photo by @tatehunna.photography'],
    <String>['1.webp', 'Pluto at the Full Moon Gathering'],
  ];

  static final CurrentEventsRepository _eventsRepository =
      CurrentEventsRepository();

  Future<void> _openLink(String url) async {
    if (url.trim().isEmpty) {
      return;
    }
    await launchUrlString(url, webOnlyWindowName: '_blank');
  }

  String _galleryUrl(String fileName) {
    return '$_galleryBaseUrl$fileName';
  }

  Widget _buildFlyer({
    required BuildContext context,
    required CurrentEvent event,
  }) {
    if (event.flyerBytes != null) {
      return Image.memory(
        event.flyerBytes!,
        fit: BoxFit.cover,
      );
    }

    return Container(
      color: Colors.white10,
      alignment: Alignment.center,
      child: const Padding(
        padding: EdgeInsets.symmetric(vertical: 28, horizontal: 16),
        child: Text(
          'No flyer image uploaded yet',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white70),
        ),
      ),
    );
  }

  Widget _buildEventCard(
    BuildContext context, {
    required String title,
    required String details,
    required String ticketUrl,
    required Widget flyer,
  }) {
    final Color textColor =
        Theme.of(context).primaryColorLight.withValues(alpha: 0.9);

    return Card(
      color: Colors.black.withValues(alpha: 0.35),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              title,
              style: const TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            if (details.trim().isNotEmpty) ...<Widget>[
              const SizedBox(height: 6),
              Text(
                details,
                style: TextStyle(fontSize: 18, color: textColor),
              ),
            ],
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: flyer,
            ),
            const SizedBox(height: 10),
            Center(
              child: Wrap(
                alignment: WrapAlignment.center,
                spacing: 10,
                runSpacing: 10,
                children: <Widget>[
                  if (ticketUrl.trim().isNotEmpty)
                    ElevatedButton(
                      onPressed: () => _openLink(ticketUrl),
                      child: const Text('Click For Tickets'),
                    ),
                  OutlinedButton(
                    onPressed: () => context.go('/manafest'),
                    child: const Text('ManaFest Details'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEventsContent(BuildContext context, List<CurrentEvent> events) {
    if (events.isEmpty) {
      return _buildEventCard(
        context,
        title: _fallbackTitle,
        details: _fallbackDetails,
        ticketUrl: _fallbackTicketUrl,
        flyer: Image.asset(
          'assets/events/Mana-Fest-2026-Flyer-half.webp',
          fit: BoxFit.cover,
        ),
      );
    }

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final bool isCompact = constraints.maxWidth < 1000;
        final double cardWidth =
            isCompact ? constraints.maxWidth : constraints.maxWidth * 0.45;

        return Wrap(
          alignment: WrapAlignment.center,
          spacing: 16,
          runSpacing: 16,
          children: events
              .map((CurrentEvent event) => SizedBox(
                    width: cardWidth,
                    child: _buildEventCard(
                      context,
                      title: event.title,
                      details: event.details,
                      ticketUrl: event.ticketUrl,
                      flyer: _buildFlyer(context: context, event: event),
                    ),
                  ))
              .toList(),
        );
      },
    );
  }

  Widget _buildGalleryCarousel(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: AspectRatio(
        aspectRatio: 1,
        child: PageView.builder(
          itemCount: _imageList.length,
          itemBuilder: (BuildContext context, int index) {
            final List<String> item = _imageList[index];
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 5),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  fit: StackFit.expand,
                  children: <Widget>[
                    Image.network(
                      _galleryUrl(item[0]),
                      fit: BoxFit.cover,
                      loadingBuilder: (
                        BuildContext context,
                        Widget child,
                        ImageChunkEvent? loadingProgress,
                      ) {
                        if (loadingProgress == null) {
                          return child;
                        }
                        return const ColoredBox(
                          color: Colors.black12,
                          child: Center(child: CircularProgressIndicator()),
                        );
                      },
                      errorBuilder: (
                        BuildContext context,
                        Object error,
                        StackTrace? stackTrace,
                      ) {
                        return const ColoredBox(
                          color: Colors.black12,
                          child: Center(
                            child: Icon(
                              Icons.broken_image,
                              color: Colors.white54,
                            ),
                          ),
                        );
                      },
                    ),
                    Align(
                      alignment: const Alignment(0, 0.9),
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Text(
                          item[1],
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w100,
                            backgroundColor: Colors.black54,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Column(
        children: <Widget>[
          CustomText(
            text: 'UPCOMING EVENTS',
            fontSize: 48,
            color: Theme.of(context).primaryColorLight,
          ),
          const SizedBox(height: 10),
          StreamBuilder<List<CurrentEvent>>(
            stream: _eventsRepository.watchEvents(onlyActive: true),
            builder: (BuildContext context,
                AsyncSnapshot<List<CurrentEvent>> snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(),
                );
              }

              if (snapshot.hasError) {
                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'Unable to load events right now: ${snapshot.error}',
                    style: const TextStyle(color: Colors.white70),
                  ),
                );
              }

              return _buildEventsContent(
                context,
                snapshot.data ?? <CurrentEvent>[],
              );
            },
          ),
          const SizedBox(height: 14),
          _buildGalleryCarousel(context),
        ],
      ),
    );
  }
}
