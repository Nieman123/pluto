"""Capture real Flutter screens on an iOS simulator, in Apple's upload sizes.

The native renderer lays out each target viewport independently. Duo captures
are layout renders, not photographs or physical Duo device captures.
"""
import json
import os
import plistlib
import subprocess
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'output/app-store-screenshots'
VIEWPORTS = {'iphone-medium': (1206, 2622, 3), 'iphone': (1320, 2868, 3), 'iphone-duo-outer': (1398, 2034, 3),
             'iphone-duo-inner': (2007, 2853, 3), 'ipad': (2064, 2752, 2)}
SCREENS = [('01-home', '/', 0, False, 'Welcome back'),
           ('02-upcoming-events', '/', 'bottom', False, 'Into the Orbit'),
           ('03-ticket-wallet', '/tickets', 120, False, 'Manafest'),
           ('04-admission-qr', '/tickets', 120, True, 'PLUTO'),
           ('05-rewards', '/shop', 0, False, 'Pluto sticker pack'),
           ('06-profile', '/profile', 0, False, 'Alex')]


def request(path, data=None):
    req = urllib.request.Request('http://127.0.0.1:4174' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=10))


def main():
    if os.uname().sysname != 'Darwin':
        raise RuntimeError('iOS screenshots require the macOS workflow.')
    (ROOT / 'tmp').mkdir(parents=True, exist_ok=True)
    subprocess.run(['node', '--check', 'scripts/store/seed.cjs'], check=True)
    marker = ROOT / 'tmp/store-capture-ready'
    marker.unlink(missing_ok=True)
    server = subprocess.Popen(['node', 'scripts/store/server.mjs'], cwd=ROOT)
    udid = None
    launch = None
    log = None
    try:
        for _ in range(120):
            if marker.exists(): break
            if server.poll() is not None: raise RuntimeError('Capture server failed')
            time.sleep(1)
        else: raise RuntimeError('Emulator seed did not finish')
        devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j']))
        choices = [device for group in devices['devices'].values() for device in group
                   if device.get('isAvailable') and 'iPhone' in device['name'] and 'Pro Max' in device['name']]
        if not choices: raise RuntimeError('No iPhone simulator runtime installed')
        udid = choices[-1]['udid']
        subprocess.run(['xcrun', 'simctl', 'boot', udid], check=True)
        subprocess.run(['xcrun', 'simctl', 'bootstatus', udid, '-b'], check=True)
        app = ROOT / 'build/ios/iphonesimulator/Runner.app'
        # FlutterFire's iOS plugin initializes its default app from this resource
        # before Dart runs. Substitute demo options in the simulator artifact,
        # not the checked-in Firebase configuration or any release archive.
        demo_plist = {
            'API_KEY': 'AIzaSy000000000000000000000000000000000',
            'GOOGLE_APP_ID': '1:123:ios:abcdef', 'GCM_SENDER_ID': '123',
            'PROJECT_ID': 'demo-pluto-ticketing',
            'STORAGE_BUCKET': 'demo-pluto-ticketing.appspot.com',
            'BUNDLE_ID': 'events.pluto.app.staging', 'PLIST_VERSION': '1',
            'IS_ADS_ENABLED': False, 'IS_ANALYTICS_ENABLED': False,
            'IS_GCM_ENABLED': False, 'IS_SIGNIN_ENABLED': False,
        }
        (app / 'GoogleService-Info.plist').write_bytes(plistlib.dumps(demo_plist))
        plist_path = app / 'Info.plist'
        plist = plistlib.loads(plist_path.read_bytes())
        # The capture-only simulator artifact talks to its host's local emulators.
        plist['NSAppTransportSecurity'] = {'NSAllowsArbitraryLoads': True}
        plist_path.write_bytes(plistlib.dumps(plist))
        subprocess.run(['codesign', '--force', '--sign', '-',
                        str(app / 'Frameworks/App.framework')], check=True)
        subprocess.run(['codesign', '--force', '--sign', '-',
                        '--preserve-metadata=entitlements', str(app)], check=True)
        subprocess.run(['xcrun', 'simctl', 'install', udid, str(app)], check=True)
        log = open(ROOT / 'tmp/store-capture-app.log', 'w')
        launch = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console-pty', udid,
                        'events.pluto.app.staging'], stdout=log, stderr=subprocess.STDOUT)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        manifest = {'source': 'Native iOS Flutter simulator renderer; fictional emulator data',
                    'systemChrome': False, 'viewports': VIEWPORTS, 'captures': []}
        for device, (width, height, scale) in VIEWPORTS.items():
            for name, route, scroll, qr, expected in SCREENS:
                identity = device + '-' + name
                request('/command', {'id': identity, 'device': device, 'name': name,
                    'width': width, 'height': height, 'scale': scale, 'route': route,
                    'scroll': scroll, 'qr': qr, 'expected': expected})
                for _ in range(90):
                    state = request('/state')
                    if state.get('id') == identity:
                        if state.get('error'): raise RuntimeError(state['error'])
                        if state.get('ok'): break
                    if launch.poll() is not None: raise RuntimeError('Simulator app exited; inspect capture log')
                    time.sleep(1)
                else: raise RuntimeError('Capture timed out: ' + identity)
                file = OUTPUT / device / (name + '.png')
                if not file.is_file(): raise RuntimeError('Capture file missing')
                manifest['captures'].append({'path': str(file.relative_to(OUTPUT)),
                                             'width': width, 'height': height})
                print('Captured ' + identity, flush=True)
        (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        (OUTPUT / 'README.md').write_text(
            'Use iphone-medium for the 6.1/6.3-inch slot (1206 x 2622), '
            'iphone for the large 6.9-inch slot (1320 x 2868), '
            'and the matching iphone-duo-outer, iphone-duo-inner and ipad folders.\n\n'
            'These are real Flutter screens rendered by the native iOS simulator app '
            'at each target viewport, without system status bars or device frames. '
            'Duo images are viewport layout renders, not physical-device captures. '
            'The UI reflows independently at each size; no screenshot is stretched. '
            'All member/order content is fictional and QR keys are emulator-only.\n')
        with zipfile.ZipFile(OUTPUT / 'pluto-app-store-screenshots.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(OUTPUT.rglob('*')):
                if file.is_file() and file.suffix != '.zip': archive.write(file, file.relative_to(OUTPUT))
        request('/preview', {})
        print('Generated screenshot review preview.', flush=True)
    finally:
        if launch: launch.terminate()
        if udid: subprocess.run(['xcrun', 'simctl', 'shutdown', udid], check=False)
        server.terminate()
        server.wait(timeout=10)
        if log: log.close()


if __name__ == '__main__': main()
