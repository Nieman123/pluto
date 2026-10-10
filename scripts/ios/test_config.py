import base64
import importlib.util
import json
import os
import plistlib
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare-config.py'))
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)


class ConfigTests(unittest.TestCase):
    def test_both_real_configs(self):
        for env in ('staging', 'production'):
            defines, bundle = prepare.validate(env)
            self.assertEqual(json.loads(defines['PLUTO_FIREBASE_IOS_CONFIG'])['iosBundleId'], bundle)

    def test_rejects_crossed_and_private_configuration(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for directory in ('config', 'ios/Firebase'):
                shutil.copytree(prepare.ROOT / directory, root / directory)
            filename = root / 'config/ios/staging.json'
            original = json.loads(filename.read_text())
            changes = [{'PLUTO_API_BASE_URL': 'https://pluto.events'},
                       {'PLUTO_ENVIRONMENT': 'production'},
                       {'FIREBASE_EMULATOR_HOST': '127.0.0.1'},
                       {'PLUTO_GOOGLE_IOS_CLIENT_ID': 'wrong-client'}]
            for change in changes:
                filename.write_text(json.dumps({**original, **change}))
                with self.assertRaises(ValueError): prepare.validate('staging', root)
            firebase = json.loads(original['PLUTO_FIREBASE_IOS_CONFIG'])
            filename.write_text(json.dumps({**original, 'PLUTO_FIREBASE_IOS_CONFIG': json.dumps({**firebase, 'private_key': 'secret'})}))
            with self.assertRaises(ValueError): prepare.validate('staging', root)

    def test_xcode_stages_only_the_matching_plist_and_rejects_crossed_defines(self):
        with tempfile.TemporaryDirectory() as folder:
            defines, bundle = prepare.validate('staging')
            encoded = ','.join(base64.b64encode(f'{key}={value}'.encode()).decode() for key, value in defines.items())
            env = {'PLUTO_ENVIRONMENT': 'staging', 'PRODUCT_BUNDLE_IDENTIFIER': bundle,
                   'DART_DEFINES': encoded, 'TARGET_BUILD_DIR': folder,
                   'UNLOCALIZED_RESOURCES_FOLDER_PATH': 'Runner.app'}
            with patch.dict(os.environ, env, clear=True): prepare.main()
            plist = plistlib.loads((Path(folder) / 'Runner.app/GoogleService-Info.plist').read_bytes())
            self.assertEqual(plist['BUNDLE_ID'], bundle)
            with patch.dict(os.environ, {**env, 'DART_DEFINES': ''}, clear=True):
                with self.assertRaises(ValueError): prepare.main()
            with patch.dict(os.environ, {**env, 'PRODUCT_BUNDLE_IDENTIFIER': 'events.pluto.app'}, clear=True):
                with self.assertRaises(ValueError): prepare.main()


if __name__ == '__main__': unittest.main()
