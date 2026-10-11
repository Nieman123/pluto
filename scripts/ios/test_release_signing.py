import datetime as dt
import importlib.util
import json
import os
import plistlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('signing', Path(__file__).with_name('release-signing.py'))
signing = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(signing)


def selected(environment='production'):
    return {'environment': environment, 'bundleId': 'events.pluto.app' + ('.staging' if environment == 'staging' else ''),
            'team': 'TEAM123456', 'prefix': 'W9Z7U26894', 'buildNumber': '2.1.0',
            'host': 'pluto-staging-92eb7.web.app' if environment == 'staging' else 'pluto.events'}


def profile(value):
    identifier = f"{value['prefix']}.{value['bundleId']}"
    return {'TeamIdentifier': [value['team']], 'ApplicationIdentifierPrefix': [value['prefix']],
            'ExpirationDate': dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=60),
            'UUID': '12345678-abcd-1234-abcd-123456789abc', 'DeveloperCertificates': [b'fixture certificate'],
            'Entitlements': {'application-identifier': identifier, 'com.apple.developer.team-identifier': value['team'],
                             'get-task-allow': False, 'beta-reports-active': True,
                             'com.apple.developer.applesignin': ['Default'], 'com.apple.developer.associated-domains': ['*'],
                             'keychain-access-groups': [value['prefix'] + '.*']}}


def archive(value):
    firebase = plistlib.loads((signing.ROOT / f"ios/Firebase/{value['environment']}/GoogleService-Info.plist").read_bytes())
    info = {'CFBundleIdentifier': value['bundleId'], 'CFBundleVersion': value['buildNumber'],
            'CFBundleShortVersionString': '1.0.0', 'CFBundleSupportedPlatforms': ['iPhoneOS'], 'UIDeviceFamily': [1, 2],
            'DTSDKName': 'iphoneos26.2', 'DTXcode': '2630', 'CFBundleURLTypes': [{'CFBundleURLSchemes': [value['bundleId'], firebase['REVERSED_CLIENT_ID']]}]}
    ent = profile(value)['Entitlements']
    ent['com.apple.developer.associated-domains'] = ['applinks:' + value['host']]
    ent['keychain-access-groups'] = [value['prefix'] + '.' + value['bundleId']]
    return info, ent, firebase


class ReleaseSigningTests(unittest.TestCase):
    def test_profiles_allow_real_app_prefix_distinct_from_team_and_both_flavors(self):
        for environment in ('production', 'staging'):
            value = selected(environment)
            self.assertEqual(signing.validate_profile(profile(value), value, b'fixture certificate'), '12345678-abcd-1234-abcd-123456789abc')
            signing.validate_archive(*archive(value)[:2], value, archive(value)[2])

    def test_profiles_reject_crossed_identity_expiration_wrong_certificate_and_non_store_types(self):
        value = selected()
        for change in [{'TeamIdentifier': ['OTHER12345']}, {'ApplicationIdentifierPrefix': ['OTHER12345']},
                       {'ExpirationDate': dt.datetime(2020, 1, 1)}, {'ProvisionedDevices': ['device']},
                       {'ProvisionsAllDevices': True}, {'DeveloperCertificates': [b'wrong certificate']}]:
            with self.assertRaises(ValueError): signing.validate_profile({**profile(value), **change}, value, b'fixture certificate')
        with self.assertRaises(ValueError): signing.validate_profile(profile(selected('staging')), value)

    def test_profiles_require_all_native_capabilities_and_an_exact_app_id(self):
        value = selected()
        for key, bad in [('application-identifier', 'W9Z7U26894.*'), ('get-task-allow', True), ('beta-reports-active', False),
                         ('com.apple.developer.applesignin', []), ('com.apple.developer.associated-domains', []), ('keychain-access-groups', ['OTHER.*'])]:
            current = profile(value)
            current['Entitlements'][key] = bad
            with self.assertRaises(ValueError): signing.validate_profile(current, value)

    def test_archive_rejects_simulator_old_sdk_replaced_build_crossed_firebase_and_lost_capabilities(self):
        value = selected()
        for change in [{'CFBundleVersion': '2.2.0'}, {'CFBundleIdentifier': 'events.pluto.app.staging'},
                       {'CFBundleShortVersionString': '9.0.0'}, {'DTSDKName': 'iphoneos18.5'}, {'DTXcode': '1640'},
                       {'CFBundleSupportedPlatforms': ['iPhoneSimulator']}, {'UIDeviceFamily': [1]}, {'CFBundleURLTypes': []}]:
            info, ent, firebase = archive(value)
            with self.assertRaises(ValueError): signing.validate_archive({**info, **change}, ent, value, firebase)
        info, ent, firebase = archive(value)
        with self.assertRaises(ValueError): signing.validate_archive(info, ent, value, {**firebase, 'PROJECT_ID': 'wrong'})
        for change in [{'application-identifier': 'OTHER.events.pluto.app'}, {'get-task-allow': True},
                       {'com.apple.developer.associated-domains': []}, {'com.apple.developer.applesignin': []}, {'keychain-access-groups': []}]:
            with self.assertRaises(ValueError): signing.validate_archive(info, {**ent, **change}, value, firebase)

    def test_attempt_mismatch_is_rejected_before_signing_credentials_are_read(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'tmp/ios-release').mkdir(parents=True)
            (root / 'tmp/ios-release/manifest.json').write_text(json.dumps({'environment': 'production', 'operation': 'build-only',
                'revision': 'a' * 40, 'bundleId': 'events.pluto.app', 'buildNumber': '2.1.0'}))
            env = {'IOS_ENVIRONMENT': 'production', 'IOS_OPERATION': 'build-only', 'IOS_REVISION': 'a' * 40,
                   'GITHUB_RUN_NUMBER': '2', 'GITHUB_RUN_ATTEMPT': '2'}
            with patch.object(signing, 'ROOT', root), patch.dict(os.environ, env, clear=True):
                with self.assertRaisesRegex(ValueError, 'workflow attempt'): signing.settings()

    def test_cleanup_removes_only_owned_files_and_restores_original_keychain_list(self):
        with tempfile.TemporaryDirectory() as temp:
            root, home = Path(temp), Path(temp) / 'home'
            work = root / 'pluto-ios-signing'
            work.mkdir()
            config = root / 'config/Signing.generated.xcconfig'
            files = {'config': config, 'profile': home / 'Library/MobileDevice/Provisioning Profiles/demo.mobileprovision',
                     'apiKey': home / '.private_keys/AuthKey_1234567890.p8', 'keychain': work / 'distribution.keychain-db'}
            for file in files.values():
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('fixture')
            state = {k: str(v) for k, v in files.items()}
            state['keychains'] = ['/original/login.keychain-db']
            signing.save_state(work, state)
            with patch.dict(os.environ, {'RUNNER_TEMP': temp}), patch.object(Path, 'home', return_value=home), patch.object(signing, 'SIGNING_CONFIG', config), patch.object(signing.subprocess, 'run') as run:
                run.return_value.returncode = 0
                signing.cleanup()
                self.assertEqual(run.call_args_list[0][0][0], ('security', 'list-keychains', '-d', 'user', '-s', '/original/login.keychain-db'))
            self.assertFalse(work.exists())
            self.assertTrue(all(not file.exists() for file in files.values()))

    def test_cleanup_rejects_tampered_paths_before_deleting_anything(self):
        for key in ('keychain', 'profile', 'apiKey', 'config'):
            with tempfile.TemporaryDirectory() as temp:
                work = Path(temp) / 'pluto-ios-signing'
                work.mkdir()
                external = Path(temp) / 'keep.txt'
                external.write_text('keep')
                signing.save_state(work, {key: str(external), 'keychains': []})
                with patch.dict(os.environ, {'RUNNER_TEMP': temp}), patch.object(signing.subprocess, 'run') as run:
                    with self.assertRaises(ValueError): signing.cleanup()
                    run.assert_not_called()
                self.assertEqual(external.read_text(), 'keep')


if __name__ == '__main__': unittest.main()
