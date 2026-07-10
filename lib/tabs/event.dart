import 'dart:async';

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

  bool _isManaFestEvent(String title) {
    final String normalizedTitle =
        title.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    return normalizedTitle.startsWith('manafest');
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
    required bool showManaFestDetails,
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
                  if (showManaFestDetails)
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
        showManaFestDetails: true,
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
                      showManaFestDetails: _isManaFestEvent(event.title),
                    ),
                  ))
              .toList(),
        );
      },
    );
  }

  Widget _buildGalleryCarousel(BuildContext context) {
    return _GalleryCarousel(
      imageList: _imageList,
      imageUrlForFile: _galleryUrl,
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

class _GalleryCarousel extends StatefulWidget {
  const _GalleryCarousel({
    required this.imageList,
    required this.imageUrlForFile,
  });

  final List<List<String>> imageList;
  final String Function(String fileName) imageUrlForFile;

  @override
  State<_GalleryCarousel> createState() => _GalleryCarouselState();
}

class _GalleryCarouselState extends State<_GalleryCarousel> {
  static const Duration _switchInterval = Duration(seconds: 5);
  static const Duration _switchDuration = Duration(milliseconds: 450);
  static const double _desktopBreakpoint = 780;
  static const double _desktopGalleryWidth = 720;

  final PageController _pageController = PageController();
  Timer? _autoSwitchTimer;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _startAutoSwitching();
  }

  @override
  void didUpdateWidget(_GalleryCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageList.length != widget.imageList.length) {
      _currentPage = 0;
      _autoSwitchTimer?.cancel();
      _startAutoSwitching();
    }
  }

  @override
  void dispose() {
    _autoSwitchTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  void _startAutoSwitching() {
    if (widget.imageList.length <= 1) {
      return;
    }

    _autoSwitchTimer = Timer.periodic(_switchInterval, (_) {
      if (!_pageController.hasClients || widget.imageList.isEmpty) {
        return;
      }

      final int nextPage = (_currentPage + 1) % widget.imageList.length;
      _currentPage = nextPage;
      _pageController.animateToPage(
        nextPage,
        duration: _switchDuration,
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double maxGalleryWidth =
            constraints.maxWidth >= _desktopBreakpoint
                ? _desktopGalleryWidth
                : double.infinity;

        return Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxGalleryWidth),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: AspectRatio(
                aspectRatio: 1,
                child: PageView.builder(
                  controller: _pageController,
                  itemCount: widget.imageList.length,
                  onPageChanged: (int index) => _currentPage = index,
                  itemBuilder: (BuildContext context, int index) {
                    final List<String> item = widget.imageList[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Stack(
                          fit: StackFit.expand,
                          children: <Widget>[
                            Image.network(
                              widget.imageUrlForFile(item[0]),
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
                                  child: Center(
                                    child: CircularProgressIndicator(),
                                  ),
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
            ),
          ),
        );
      },
    );
  }
}
