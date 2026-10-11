"""Allow reuse only of this repo's successful iOS validation with matching ABI inputs."""
import base64
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
run_id = os.environ['STORE_RUNTIME_RUN']
if not run_id.isdecimal() or run_id == '0':
    raise RuntimeError('Fresh simulator compilation requested.')
headers = {'Accept': 'application/vnd.github+json'}
token = os.environ.get('GH_TOKEN')
if token:
    headers['Authorization'] = 'Bearer ' + token
base = 'https://api.github.com/repos/Nieman123/pluto/'


def get(path):
    request = urllib.request.Request(base + path, headers=headers)
    return json.load(urllib.request.urlopen(request, timeout=30))


run = get('actions/runs/' + run_id)
if run.get('conclusion') != 'success' or run.get('path') != '.github/workflows/ios.yml':
    raise RuntimeError('Reuse requires a successful iOS validation run.')
sha = run['head_sha']
for filename in ['pubspec.yaml', 'pubspec.lock', 'ios/Podfile', 'ios/Runner/AppDelegate.swift',
                 'ios/Runner/SceneDelegate.swift', 'ios/Runner/Runner.entitlements',
                 'ios/Runner/Info.plist', 'ios/Runner/PrivacyInfo.xcprivacy',
                 'ios/Runner.xcodeproj/project.pbxproj', '.github/workflows/ios.yml']:
    file = get('contents/' + filename + '?ref=' + sha)
    old = base64.b64decode(file['content']).replace(b'\r\n', b'\n')
    current = (ROOT / filename).read_bytes().replace(b'\r\n', b'\n')
    if current != old:
        raise RuntimeError('Native runtime changed: ' + filename)
print('Native runtime matches the successful simulator validation.')
