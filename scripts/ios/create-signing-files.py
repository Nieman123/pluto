"""Create an encrypted CSR key and distribution P12 on Windows, Linux or macOS."""
import argparse
import base64
import getpass
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'ios-credentials'


def openssl():
    found = shutil.which('openssl')
    if found:
        return found
    git = Path('C:/Program Files/Git/usr/bin/openssl.exe')
    if git.exists():
        return str(git)
    raise ValueError('Install OpenSSL (Git for Windows includes it), then retry.')


def run(*args, env=None):
    result = subprocess.run([openssl(), *args], capture_output=True, env=env)
    if result.returncode:
        raise ValueError('OpenSSL failed. Check the certificate/key and passwords; existing files were not replaced.')


def password(label):
    value = getpass.getpass(label)
    if len(value) < 12 or any(c in value for c in '\r\n\0'):
        raise ValueError('Use at least 12 characters without newlines.')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['csr', 'p12', 'encode'])
    parser.add_argument('--certificate', type=Path)
    parser.add_argument('--file', type=Path)
    args = parser.parse_args()
    FOLDER.mkdir(exist_ok=True)
    if args.operation == 'encode':
        if not args.file or not args.file.is_file():
            raise ValueError('Provide --file with the P12 or provisioning profile.')
        destination = FOLDER / (args.file.name + '.base64.txt')
        if destination.exists():
            raise ValueError('Base64 output exists already; move it before encoding again.')
        destination.write_text(base64.b64encode(args.file.read_bytes()).decode(), encoding='ascii')
        destination.chmod(0o600)
        print(f'Paste the contents of {destination} into the matching GitHub environment secret.')
        return
    key, csr, p12 = FOLDER / 'distribution-private.key', FOLDER / 'distribution.csr', FOLDER / 'distribution.p12'
    if args.operation == 'csr':
        if key.exists() or csr.exists():
            raise ValueError('A CSR/key exists already. Keep and reuse that matching private key.')
        secret = password('Choose a password for the local private key: ')
        if secret != getpass.getpass('Confirm private-key password: '):
            raise ValueError('Passwords do not match.')
        with tempfile.TemporaryDirectory(dir=str(FOLDER)) as temporary:
            temp_key, temp_csr = Path(temporary) / 'private.key', Path(temporary) / 'request.csr'
            run('req', '-new', '-newkey', 'rsa:2048', '-keyout', str(temp_key), '-out', str(temp_csr), '-passout', 'env:PLUTO_LOCAL_KEY_PASSWORD',
                '-subj', '/CN=Pluto Events LLC/emailAddress=contact@pluto.events', env={**os.environ, 'PLUTO_LOCAL_KEY_PASSWORD': secret})
            with key.open('xb') as output:
                output.write(temp_key.read_bytes())
            with csr.open('xb') as output:
                output.write(temp_csr.read_bytes())
        key.chmod(0o600)
        print(f'Upload only {csr} when Apple asks for a CSR. Keep the encrypted private key and its password.')
    else:
        if not args.certificate or not args.certificate.is_file() or not key.exists():
            raise ValueError('Provide --certificate with Apple\'s downloaded .cer and keep the original CSR private key.')
        if p12.exists():
            raise ValueError('Distribution P12 already exists; refusing to replace it.')
        key_password = password('Password chosen when creating the CSR private key: ')
        p12_password = password('Choose a new P12 password for GitHub: ')
        if p12_password != getpass.getpass('Confirm P12 password: '):
            raise ValueError('Passwords do not match.')
        with tempfile.TemporaryDirectory(dir=str(FOLDER)) as temporary:
            pem, temp_p12 = Path(temporary) / 'certificate.pem', Path(temporary) / 'distribution.p12'
            run('x509', '-inform', 'DER', '-in', str(args.certificate.resolve()), '-out', str(pem))
            run('pkcs12', '-export', '-inkey', str(key), '-in', str(pem), '-out', str(temp_p12),
                '-passin', 'env:PLUTO_LOCAL_KEY_PASSWORD', '-passout', 'env:PLUTO_LOCAL_P12_PASSWORD',
                env={**os.environ, 'PLUTO_LOCAL_KEY_PASSWORD': key_password, 'PLUTO_LOCAL_P12_PASSWORD': p12_password})
            with p12.open('xb') as output:
                output.write(temp_p12.read_bytes())
        p12.chmod(0o600)
        print(f'Created {p12}. Use its new P12 password for IOS_DISTRIBUTION_P12_PASSWORD.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print(error)
        raise SystemExit(1)
