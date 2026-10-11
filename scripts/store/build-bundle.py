"""Build the capture UI using the same encoded defines as Flutter's Xcode phase."""
import base64
import json
import platform
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
config = json.loads((ROOT / 'config/ios/staging.json').read_text())
defines = ','.join(base64.b64encode((key + '=' + value).encode()).decode()
                   for key, value in config.items())
sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
arch = 'arm64' if platform.machine() == 'arm64' else 'x86_64'
subprocess.run(['flutter', 'assemble', '--output=build/flutter_assets',
    '-dBuildMode=debug', '-dTargetPlatform=ios', '-dConfiguration=Debug-staging',
    '-dTargetFile=scripts/store/capture.dart', '-dTrackWidgetCreation=true',
    '-dSdkRoot=' + sdk, '-dSdkName=iphonesimulator', '-dIosArchs=' + arch,
    '--DartDefines=' + defines, 'copy_flutter_bundle'], cwd=ROOT, check=True)
