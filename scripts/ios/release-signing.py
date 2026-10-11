"""Manual App Store signing on ephemeral macOS runners; no credentials in logs."""
import base64
import datetime as dt
import hashlib
import json
import os
import plistlib
import re
import secrets
import shlex
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIGNING_CONFIG = ROOT / 'ios/Config/Signing.generated.xcconfig'


def run(*args, binary=False):
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise ValueError(f'{Path(args[0]).name} failed (exit {result.returncode}). Check the signing files and toolchain.')
    return result.stdout if binary else result.stdout.decode().strip()


def folder():
    parent = os.environ.get('RUNNER_TEMP', '')
    if not parent or not Path(parent).is_absolute():
        raise ValueError('An absolute RUNNER_TEMP is required.')
    return Path(parent).resolve() / 'pluto-ios-signing'


def settings():
    manifest = json.loads((ROOT / 'tmp/ios-release/manifest.json').read_text())
    environment = os.environ['IOS_ENVIRONMENT']
    expected = 'events.pluto.app' + ('.staging' if environment == 'staging' else '')
    build = f"{int(os.environ['GITHUB_RUN_NUMBER'])}.{int(os.environ['GITHUB_RUN_ATTEMPT'])}.0"
    if environment not in ('staging', 'production') or manifest != {
        'environment': environment, 'operation': os.environ['IOS_OPERATION'],
        'revision': os.environ['IOS_REVISION'], 'bundleId': expected, 'buildNumber': build
    }:
        raise ValueError('Prepared iOS release does not match this workflow attempt.')
    team, prefix = os.environ.get('IOS_TEAM_ID', ''), os.environ.get('IOS_APP_ID_PREFIX', '')
    if not re.fullmatch(r'[A-Z0-9]{10}', team) or not re.fullmatch(r'[A-Z0-9]{10}', prefix):
        raise ValueError('Set IOS_TEAM_ID and IOS_APP_ID_PREFIX in this GitHub environment.')
    links = json.loads((ROOT / 'functions/src/ios-links-config.json').read_text())
    if links[environment]['appIdentifierPrefix'] != prefix:
        raise ValueError('App ID prefix must match the deployed Universal Link configuration.')
    return {**manifest, 'team': team, 'prefix': prefix,
            'host': 'pluto-staging-92eb7.web.app' if environment == 'staging' else 'pluto.events'}


def validate_profile(profile, selected, certificate=None, now=None):
    ent = profile.get('Entitlements', {})
    expires = profile.get('ExpirationDate')
    now = now or dt.datetime.now(dt.timezone.utc)
    if not isinstance(expires, dt.datetime) or expires.replace(tzinfo=dt.timezone.utc) <= now:
        raise ValueError('Provisioning profile is expired or has no expiration.')
    if profile.get('TeamIdentifier') != [selected['team']] or profile.get('ApplicationIdentifierPrefix') != [selected['prefix']]:
        raise ValueError('Provisioning profile belongs to a different team or App ID prefix.')
    identifier = f"{selected['prefix']}.{selected['bundleId']}"
    if ent.get('application-identifier') != identifier or ent.get('com.apple.developer.team-identifier') != selected['team']:
        raise ValueError('Provisioning profile does not match this exact bundle ID.')
    if ent.get('get-task-allow') is not False or profile.get('ProvisionedDevices') is not None or profile.get('ProvisionsAllDevices') or ent.get('beta-reports-active') is not True:
        raise ValueError('Use an App Store Connect distribution profile, not development/ad hoc/enterprise.')
    if ent.get('com.apple.developer.applesignin') != ['Default']:
        raise ValueError('Enable Sign in with Apple before generating the profile.')
    domains = ent.get('com.apple.developer.associated-domains', [])
    if '*' not in domains and f"applinks:{selected['host']}" not in domains:
        raise ValueError('Enable Associated Domains before generating the profile.')
    groups = ent.get('keychain-access-groups', [])
    if identifier not in groups and f"{selected['prefix']}.*" not in groups:
        raise ValueError('Profile does not permit the app ticket Keychain group.')
    if not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', profile.get('UUID', '')):
        raise ValueError('Invalid provisioning profile UUID.')
    certificates = profile.get('DeveloperCertificates', [])
    if len(certificates) != 1 or (certificate is not None and certificates[0] != certificate):
        raise ValueError('The profile must contain the exact distribution certificate from the P12.')
    return profile['UUID']


def write_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as handle:
        handle.write(data)
    path.chmod(0o600)


def decode_secret(name):
    try:
        value = base64.b64decode(os.environ.get(name, '').strip(), validate=True)
    except ValueError:
        raise ValueError(f'{name} must contain base64 file contents.') from None
    if not value:
        raise ValueError(f'Configure {name} in this GitHub environment.')
    return value


def save_state(work, state):
    file = work / 'state.json'
    file.write_text(json.dumps(state), encoding='utf8')
    file.chmod(0o600)


def prepare():
    selected = settings()
    if not os.environ.get('IOS_DISTRIBUTION_P12_PASSWORD'):
        raise ValueError('Configure IOS_DISTRIBUTION_P12_PASSWORD.')
    work = folder()
    work.mkdir(parents=True, exist_ok=False)
    state = {'keychains': shlex.split(run('security', 'list-keychains', '-d', 'user'))}
    save_state(work, state)
    p12, profile = work / 'distribution.p12', work / 'profile.mobileprovision'
    write_private(p12, decode_secret('IOS_DISTRIBUTION_P12_BASE64'))
    write_private(profile, decode_secret('IOS_PROVISIONING_PROFILE_BASE64'))
    decoded = plistlib.loads(run('security', 'cms', '-D', '-i', str(profile), binary=True))
    pem = run('openssl', 'pkcs12', '-in', str(p12), '-clcerts', '-nokeys', '-passin', 'env:IOS_DISTRIBUTION_P12_PASSWORD', binary=True)
    certificate_file = work / 'distribution.pem'
    write_private(certificate_file, pem)
    certificate = run('openssl', 'x509', '-in', str(certificate_file), '-outform', 'DER', binary=True)
    profile_id = validate_profile(decoded, selected, certificate)
    subject = run('openssl', 'x509', '-in', str(certificate_file), '-noout', '-subject')
    if 'Apple Distribution:' not in subject and 'iPhone Distribution:' not in subject:
        raise ValueError('P12 must contain an Apple distribution certificate.')
    issuer = run('openssl', 'x509', '-in', str(certificate_file), '-noout', '-issuer')
    if 'Apple Worldwide Developer Relations' not in issuer or 'G3' not in issuer:
        raise ValueError('Expected an Apple Distribution certificate issued by Apple WWDR G3.')
    # The CSR/P12 can be created on Windows without exporting a Mac keychain's
    # certificate chain. Install Apple's public intermediate on the runner.
    import urllib.request
    with urllib.request.urlopen('https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer', timeout=30) as response:
        intermediate = response.read()
    chain = work / 'AppleWWDRCAG3.cer'
    write_private(chain, intermediate)
    fingerprint = hashlib.sha1(certificate).hexdigest().upper()
    keychain = work / 'distribution.keychain-db'
    state['keychain'] = str(keychain)
    save_state(work, state)
    password = secrets.token_urlsafe(32)
    run('security', 'create-keychain', '-p', password, str(keychain))
    run('security', 'set-keychain-settings', '-lut', '21600', str(keychain))
    run('security', 'unlock-keychain', '-p', password, str(keychain))
    run('security', 'import', str(chain), '-k', str(keychain))
    run('security', 'import', str(p12), '-P', os.environ['IOS_DISTRIBUTION_P12_PASSWORD'], '-k', str(keychain), '-t', 'cert', '-f', 'pkcs12', '-T', '/usr/bin/codesign', '-T', '/usr/bin/security')
    run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, str(keychain))
    run('security', 'list-keychains', '-d', 'user', '-s', str(keychain), *state['keychains'])
    if fingerprint not in run('security', 'find-identity', '-v', '-p', 'codesigning', str(keychain)):
        raise ValueError('No valid signing identity. Check the certificate expiration and matching private key.')
    installed = Path.home() / 'Library/MobileDevice/Provisioning Profiles' / f'{profile_id}.mobileprovision'
    if installed.exists():
        raise ValueError('Refusing to overwrite an existing provisioning profile.')
    state['profile'] = str(installed)
    save_state(work, state)
    write_private(installed, profile.read_bytes())
    if SIGNING_CONFIG.exists():
        raise ValueError('Refusing to overwrite an existing signing configuration.')
    state['config'] = str(SIGNING_CONFIG)
    save_state(work, state)
    SIGNING_CONFIG.write_text(f"DEVELOPMENT_TEAM = {selected['team']}\nCODE_SIGN_STYLE = Manual\nCODE_SIGN_IDENTITY = {fingerprint}\nCODE_SIGN_IDENTITY[sdk=iphoneos*] = {fingerprint}\nPROVISIONING_PROFILE_SPECIFIER = {profile_id}\n", encoding='utf8')
    export = {'method': 'app-store-connect', 'destination': 'export', 'signingStyle': 'manual',
              'teamID': selected['team'], 'signingCertificate': fingerprint,
              'provisioningProfiles': {selected['bundleId']: profile_id},
              'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True, 'stripSwiftSymbols': True}
    (work / 'ExportOptions.plist').write_bytes(plistlib.dumps(export))
    if selected['operation'] == 'upload-testflight':
        key_id, issuer = os.environ.get('ASC_KEY_ID', ''), os.environ.get('ASC_ISSUER_ID', '')
        if not re.fullmatch(r'[A-Z0-9]{10}', key_id) or not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', issuer):
            raise ValueError('Set the App Store Connect Team API key ID and issuer UUID.')
        private_key = os.environ.get('ASC_PRIVATE_KEY_P8', '').strip()
        if not private_key.startswith('-----BEGIN PRIVATE KEY-----') or not private_key.endswith('-----END PRIVATE KEY-----'):
            raise ValueError('ASC_PRIVATE_KEY_P8 must contain the downloaded App Store Connect .p8 file text.')
        key = Path.home() / '.private_keys' / f'AuthKey_{key_id}.p8'
        if key.exists():
            raise ValueError('Refusing to overwrite an existing App Store Connect API key.')
        state['apiKey'] = str(key)
        save_state(work, state)
        write_private(key, (private_key + '\n').encode())
    print(f"Prepared isolated {selected['environment']} App Store distribution signing.")


def validate_archive(info, entitlements, selected, firebase):
    version = re.search(r'^version:\s*([^+\s]+)', (ROOT / 'pubspec.yaml').read_text(), re.M)[1]
    if info.get('CFBundleIdentifier') != selected['bundleId'] or info.get('CFBundleVersion') != selected['buildNumber'] or info.get('CFBundleShortVersionString') != version:
        raise ValueError('Archive bundle ID, build number or app version does not match this release.')
    if info.get('CFBundleSupportedPlatforms') != ['iPhoneOS'] or set(info.get('UIDeviceFamily', [])) != {1, 2}:
        raise ValueError('Archive must be an iPhone/iPad device build, not a simulator.')
    sdk = re.fullmatch(r'iphoneos(\d+)(?:\.\d+)*', info.get('DTSDKName', ''))
    if not sdk or int(sdk[1]) < 26 or not re.fullmatch(r'\d{4}', info.get('DTXcode', '')) or int(info['DTXcode']) < 2600:
        raise ValueError('App Store uploads require Xcode 26 and the iOS 26 SDK or newer.')
    identifier = f"{selected['prefix']}.{selected['bundleId']}"
    if entitlements.get('application-identifier') != identifier or entitlements.get('com.apple.developer.team-identifier') != selected['team'] or entitlements.get('get-task-allow', False):
        raise ValueError('Archive signing identity or distribution entitlement is incorrect.')
    if entitlements.get('com.apple.developer.applesignin') != ['Default'] or f"applinks:{selected['host']}" not in entitlements.get('com.apple.developer.associated-domains', []) or identifier not in entitlements.get('keychain-access-groups', []):
        raise ValueError('Archive must retain Apple sign-in, native links and ticket Keychain access.')
    expected = plistlib.loads((ROOT / f"ios/Firebase/{selected['environment']}/GoogleService-Info.plist").read_bytes())
    if firebase != expected:
        raise ValueError('Archive Firebase configuration does not match this environment.')
    schemes = {s for url in info.get('CFBundleURLTypes', []) for s in url.get('CFBundleURLSchemes', [])}
    if selected['bundleId'] not in schemes or expected['REVERSED_CLIENT_ID'] not in schemes:
        raise ValueError('Archive is missing the checkout or Google sign-in URL scheme.')


def ipa_file():
    files = list((ROOT / 'build/ios/ipa').glob('*.ipa'))
    if len(files) != 1:
        raise ValueError('Expected exactly one signed IPA.')
    return files[0]


def verify():
    selected = settings()
    apps = list((ROOT / 'build/ios/archive').glob('*.xcarchive/Products/Applications/*.app'))
    if len(apps) != 1:
        raise ValueError('Expected exactly one archived iOS app.')
    app = apps[0]
    run('codesign', '--verify', '--deep', '--strict', str(app))
    ent_file = folder() / 'archive-entitlements.plist'
    run('codesign', '-d', '--entitlements', str(ent_file), str(app))
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    validate_archive(info, plistlib.loads(ent_file.read_bytes()), selected,
                     plistlib.loads((app / 'GoogleService-Info.plist').read_bytes()))
    # Verify the exported IPA as well; export may add metadata to Info.plist.
    import zipfile
    with zipfile.ZipFile(ipa_file()) as bundle:
        names = [name for name in bundle.namelist() if re.fullmatch(r'Payload/[^/]+\.app/Info.plist', name)]
        if len(names) != 1:
            raise ValueError('Expected one exported app.')
        for name in bundle.namelist():
            candidate = (folder() / 'exported' / name).resolve()
            if not candidate.is_relative_to((folder() / 'exported').resolve()):
                raise ValueError('Unsafe IPA archive path.')
        prefix = names[0][:-len('Info.plist')]
        exported_info = plistlib.loads(bundle.read(names[0]))
        exported_firebase = plistlib.loads(bundle.read(prefix + 'GoogleService-Info.plist'))
    run('ditto', '-x', '-k', str(ipa_file()), str(folder() / 'exported'))
    exported_app = folder() / 'exported' / prefix.rstrip('/')
    run('codesign', '--verify', '--deep', '--strict', str(exported_app))
    exported_entitlements = folder() / 'exported-entitlements.plist'
    run('codesign', '-d', '--entitlements', str(exported_entitlements), str(exported_app))
    validate_archive(exported_info, plistlib.loads(exported_entitlements.read_bytes()), selected, exported_firebase)
    exported_profile = plistlib.loads(run('security', 'cms', '-D', '-i', str(exported_app / 'embedded.mobileprovision'), binary=True))
    certificate = run('openssl', 'x509', '-in', str(folder() / 'distribution.pem'), '-outform', 'DER', binary=True)
    validate_profile(exported_profile, selected, certificate)
    run('codesign', '-d', '--extract-certificates', str(folder() / 'exported-certificate-'), str(exported_app))
    if (folder() / 'exported-certificate-0').read_bytes() != certificate:
        raise ValueError('Exported IPA signature uses a different signing certificate.')
    evidence = {**selected, 'ipaSha256': hashlib.sha256(ipa_file().read_bytes()).hexdigest(), 'sdk': info['DTSDKName'], 'verified': True}
    (ROOT / 'tmp/ios-release/verification.json').write_text(json.dumps(evidence, indent=2))
    print(f"Verified signed {selected['bundleId']} build {selected['buildNumber']}.")


def upload():
    selected = settings()
    evidence = json.loads((ROOT / 'tmp/ios-release/verification.json').read_text())
    if selected['operation'] != 'upload-testflight' or not evidence.get('verified') or any(evidence.get(k) != v for k, v in selected.items()) or evidence.get('ipaSha256') != hashlib.sha256(ipa_file().read_bytes()).hexdigest():
        raise ValueError('Only the exact verified IPA can be uploaded.')
    args = ['xcrun', 'altool', '--type', 'ios', '-f', str(ipa_file()), '--apiKey', os.environ['ASC_KEY_ID'], '--apiIssuer', os.environ['ASC_ISSUER_ID'], '--output-format', 'json']
    for operation in ['--validate-app', '--upload-app']:
        result = subprocess.run(args + [operation], capture_output=True, text=True)
        if result.returncode:
            print(result.stdout, file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            raise ValueError(f'Apple {operation} failed. No App Store review submission was made.')
        if operation == '--upload-app':
            (ROOT / 'tmp/ios-release/upload-result.json').write_text(json.dumps({'uploaded': True, 'buildNumber': selected['buildNumber'], 'bundleId': selected['bundleId'], 'response': result.stdout}))
    print('Upload accepted. Wait for Apple processing, then select the build in TestFlight or App Review.')


def cleanup():
    work = folder()
    state_file = work / 'state.json'
    if not state_file.exists():
        return
    state = json.loads(state_file.read_text())
    failures = []
    allowed = {'profile': Path.home() / 'Library/MobileDevice/Provisioning Profiles', 'apiKey': Path.home() / '.private_keys', 'config': SIGNING_CONFIG.parent}
    if state.get('keychain') and Path(state['keychain']).resolve() != (work / 'distribution.keychain-db').resolve():
        raise ValueError('Refusing keychain cleanup outside the signing directory.')
    files = []
    for key, parent in allowed.items():
        if key in state:
            file = Path(state[key]).resolve()
            if file.parent != parent.resolve() or (key == 'config' and file != SIGNING_CONFIG.resolve()):
                raise ValueError('Refusing credential cleanup outside the expected directory.')
            files.append(file)
    commands = [('security', 'list-keychains', '-d', 'user', '-s', *state.get('keychains', []))]
    if state.get('keychain') and Path(state['keychain']).exists():
        commands.append(('security', 'delete-keychain', state['keychain']))
    for command in commands:
        if subprocess.run(command, capture_output=True).returncode:
            failures.append('temporary keychain')
    for file in files:
        try:
            file.unlink()
        except FileNotFoundError:
            pass
    import shutil
    shutil.rmtree(work)
    if failures:
        raise ValueError('Temporary keychain cleanup failed; the ephemeral runner will be discarded.')
    print('Removed temporary signing credentials and restored the keychain search list.')


def toolchain():
    version = run('xcodebuild', '-version')
    sdk = run('xcrun', '--sdk', 'iphoneos', '--show-sdk-version')
    if not re.search(r'Xcode (2[6-9]|[3-9]\d)\.', version) or int(sdk.split('.')[0]) < 26:
        raise ValueError('Select Xcode 26 or newer with an iOS 26 or newer SDK.')


if __name__ == '__main__':
    try:
        {'prepare': prepare, 'verify': verify, 'upload': upload, 'cleanup': cleanup, 'toolchain': toolchain}[sys.argv[1]]()
    except (ValueError, KeyError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
