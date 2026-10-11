"""Insert a freshly compiled Dart UI bundle into a validated simulator runtime."""
import plistlib
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
found = []
for plist in (ROOT / 'tmp/native-runtime').rglob('Info.plist'):
    try:
        data = plistlib.loads(plist.read_bytes())
        if data.get('CFBundleIdentifier') == 'events.pluto.app.staging': found.append(plist.parent)
    except (ValueError, plistlib.InvalidFileException): pass
if len(found) != 1: raise RuntimeError('Expected one staging simulator app in the artifact.')
app = ROOT / 'build/ios/iphonesimulator/Runner.app'
app.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(found[0], app, dirs_exist_ok=True)
assets = app / 'Frameworks/App.framework/flutter_assets'
shutil.rmtree(assets)
shutil.copytree(ROOT / 'build/flutter_assets', assets)
# ZIP artifacts do not preserve executable bits. Restore them for Mach-O files.
magic = {b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe',
         b'\xbe\xba\xfe\xca', b'\xce\xfa\xed\xfe', b'\xfe\xed\xfa\xce'}
for file in app.rglob('*'):
    if file.is_file():
        with file.open('rb') as stream: prefix = stream.read(4)
        if prefix in magic: file.chmod(0o755)
print('Prepared the native iOS runtime with the current screenshot UI bundle.')
