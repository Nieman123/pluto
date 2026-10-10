"""Validate a flavor's public iOS settings and stage Firebase's plist in its app.

Invoked by Xcode. Never reads signing credentials or writes to the source plist.
"""
import base64
import json
import os
import plistlib
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def validate(environment, root=ROOT):
    if environment not in ('staging', 'production'):
        raise ValueError('Build with --flavor staging or --flavor production.')
    defines = json.loads((root / f'config/ios/{environment}.json').read_text())
    firebase = json.loads(defines['PLUTO_FIREBASE_IOS_CONFIG'])
    plist = plistlib.loads((root / f'ios/Firebase/{environment}/GoogleService-Info.plist').read_bytes())
    staging = environment == 'staging'
    project, sender = ('pluto-staging-92eb7', '702489323300') if staging else ('pluto-9b6ca', '763906028056')
    bundle = 'events.pluto.app' + ('.staging' if staging else '')
    host = 'pluto-staging-92eb7.web.app' if staging else 'pluto.events'
    expected = {'projectId': project, 'messagingSenderId': sender, 'iosBundleId': bundle}
    mapping = {'apiKey': 'API_KEY', 'appId': 'GOOGLE_APP_ID', 'messagingSenderId': 'GCM_SENDER_ID',
               'projectId': 'PROJECT_ID', 'storageBucket': 'STORAGE_BUCKET', 'iosBundleId': 'BUNDLE_ID', 'iosClientId': 'CLIENT_ID'}
    if set(firebase) != set(mapping) or any(not isinstance(value, str) or not value for value in firebase.values()):
        raise ValueError('Only complete public Firebase iOS fields are allowed.')
    if any(firebase[key] != value for key, value in expected.items()) or any(firebase[key] != plist.get(value) for key, value in mapping.items()):
        raise ValueError('Firebase plist and Dart configuration must match the iOS flavor.')
    if not re.fullmatch(f'1:{sender}:ios:[a-f0-9]+', firebase['appId']) or firebase['storageBucket'] not in (f'{project}.appspot.com', f'{project}.firebasestorage.app'):
        raise ValueError('Invalid iOS Firebase app identity.')
    if defines.get('PLUTO_ENVIRONMENT') != environment or defines.get('PLUTO_API_BASE_URL') != f'https://{host}' or defines.get('FIREBASE_EMULATOR_HOST'):
        raise ValueError('An iOS release must use its matching HTTPS backend.')
    client_id = firebase['iosClientId']
    if not re.fullmatch(f'{sender}-[a-z0-9]+\\.apps\\.googleusercontent\\.com', client_id) or defines.get('PLUTO_GOOGLE_IOS_CLIENT_ID') != client_id:
        raise ValueError('The Google iOS client must match Firebase.')
    if plist.get('REVERSED_CLIENT_ID') != '.'.join(reversed(client_id.split('.'))):
        raise ValueError('Google sign-in requires the matching reversed URL scheme.')
    android = json.loads((root / f'config/android/{environment}.json').read_text())
    if defines.get('PLUTO_GOOGLE_SERVER_CLIENT_ID') != android['PLUTO_GOOGLE_SERVER_CLIENT_ID']:
        raise ValueError('Use this environment\'s existing Web OAuth client as the server client.')
    return defines, bundle


def main():
    environment = os.environ.get('PLUTO_ENVIRONMENT', '')
    defines, bundle = validate(environment)
    if os.environ.get('PRODUCT_BUNDLE_IDENTIFIER') != bundle:
        raise ValueError('The selected Xcode bundle ID does not match the iOS configuration.')
    raw_defines = os.environ.get('DART_DEFINES', '')
    decoded = dict(base64.b64decode(value).decode().split('=', 1) for value in raw_defines.split(',') if value)
    if any(decoded.get(key) != value for key, value in defines.items()) or decoded.get('FIREBASE_EMULATOR_HOST'):
        raise ValueError('Build via Flutter with --dart-define-from-file=config/ios/<flavor>.json.')
    app = Path(os.environ['TARGET_BUILD_DIR']) / os.environ['UNLOCALIZED_RESOURCES_FOLDER_PATH']
    app.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / f'ios/Firebase/{environment}/GoogleService-Info.plist', app / 'GoogleService-Info.plist')
    print(f'Validated {environment} iOS Firebase and Google sign-in configuration.')


if __name__ == '__main__':
    main()
