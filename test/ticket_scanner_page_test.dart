import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:pluto/src/scanner/scanner_pin_entry.dart';
import 'package:pluto/ticket_scanner_page.dart';

import 'ticket_scanner_test.dart' show ScannerHarness;

class _Camera extends MobileScannerPlatform {
  final frames = StreamController<BarcodeCapture?>.broadcast();
  final permission = Completer<void>();
  int stops = 0;
  @override
  Stream<BarcodeCapture?> get barcodesStream => frames.stream;
  @override
  Stream<TorchState> get torchStateStream => const Stream.empty();
  @override
  Stream<double> get zoomScaleStateStream => const Stream.empty();
  @override
  Widget buildCameraView() => const ColoredBox(color: Colors.black);
  @override
  Future<MobileScannerViewAttributes> start(StartOptions options) async {
    await permission.future;
    return const MobileScannerViewAttributes(
      cameraDirection: CameraFacing.back,
      currentTorchMode: TorchState.off,
      size: Size(640, 480),
      numberOfCameras: 2,
    );
  }

  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Future<void> dispose() async {}
}

void main() {
  testWidgets(
    'PIN entry validates locally and carries PIN outside the route URL',
    (tester) async {
      String? received;
      Uri? scannerUri;
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const Scaffold(body: ScannerPinEntry()),
          ),
          GoRoute(
            path: '/ticket-scanner',
            builder: (_, state) {
              received = state.extra as String?;
              scannerUri = state.uri;
              return const Scaffold(body: Text('Scanner opened'));
            },
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.tap(find.text('Open ticket scanner'));
      await tester.pumpAndSettle();
      expect(find.text('Enter your 8-digit scanner PIN.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), '1234 5678');
      await tester.tap(find.text('Open ticket scanner'));
      await tester.pumpAndSettle();
      expect(received, '12345678');
      expect(scannerUri.toString(), '/ticket-scanner');
      router.pop();
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
    },
  );
  testWidgets(
    'native scanner logs in without Firebase and does not auto-open the camera',
    (tester) async {
      final harness = ScannerHarness();
      await harness.setup();
      await tester.pumpWidget(
        MaterialApp(
          home: TicketScannerPage(
            scanner: harness.scanner(),
            initialPin: '12345678',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('First show'), findsOneWidget);
      expect(find.text('Start camera'), findsOneWidget);
      expect(harness.calls.first['path'], 'scanner/login');
      await tester.enterText(find.byType(TextField), harness.qr);
      await tester.tap(find.text('Check ticket'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Ticket scanned'), findsOneWidget);
      expect(find.text('Admission confirmed.'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      expect(find.text('Ticket scanned'), findsNothing);
      await tester.tap(find.text('Guest list'));
      await tester.pumpAndSettle();
      expect(find.text('Sam Taylor'), findsOneWidget);
      expect(find.text('Mark arrived'), findsOneWidget);
      await tester.tap(find.text('Mark arrived'));
      await tester.pumpAndSettle();
      expect(
        harness.calls.any((c) => c['path'] == 'staff/guestlist/arrive'),
        true,
      );
      await tester.pump(const Duration(seconds: 3));
      await tester.tap(find.text('Attendance'));
      await tester.pumpAndSettle();
      expect(find.text('First arrivals: 2'), findsOneWidget);
      await tester.tap(find.text('End session'));
      await tester.pumpAndSettle();
      expect(find.text('Ticket scanner PIN'), findsOneWidget);
      expect(find.text('First show'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'iOS entry is supported and desktop entry is hidden',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: ScannerPinEntry())),
      );
      expect(
        find.text('8-digit scanner PIN'),
        defaultTargetPlatform == TargetPlatform.iOS
            ? findsOneWidget
            : findsNothing,
      );
    },
    variant: const TargetPlatformVariant({
      TargetPlatform.iOS,
      TargetPlatform.windows,
    }),
  );
  testWidgets(
    'permission prompt keeps camera preview and continuous frames do not rescan',
    (tester) async {
      final original = MobileScannerPlatform.instance;
      final camera = _Camera();
      MobileScannerPlatform.instance = camera;
      addTearDown(() async {
        MobileScannerPlatform.instance = original;
        await camera.frames.close();
      });
      final harness = ScannerHarness();
      await harness.setup();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(
        MaterialApp(
          home: TicketScannerPage(
            scanner: harness.scanner(),
            initialPin: '12345678',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Start camera'));
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(find.byType(MobileScanner), findsOneWidget);
      expect(camera.stops, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      camera.permission.complete();
      await tester.pumpAndSettle();
      camera.frames.add(
        BarcodeCapture(barcodes: [Barcode(rawValue: harness.qr)]),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Ticket scanned'), findsOneWidget);
      for (var frame = 0; frame < 6; frame++) {
        await tester.pump(const Duration(seconds: 1));
        camera.frames.add(
          BarcodeCapture(barcodes: [Barcode(rawValue: harness.qr)]),
        );
        await tester.pump();
      }
      expect(harness.calls.where((c) => c['path'] == 'staff/scan').length, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pumpAndSettle();
      expect(find.byType(MobileScanner), findsNothing);
      expect(camera.stops, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
}
