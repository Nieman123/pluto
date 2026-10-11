import base64
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('files', Path(__file__).with_name('create-signing-files.py'))
files = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(files)


class SigningFileTests(unittest.TestCase):
    def test_encrypted_csr_and_p12_round_trip_with_synthetic_certificate(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            key_password, p12_password = 'test-only-key-password', 'test-only-p12-password'
            with patch.object(files, 'FOLDER', folder), patch('sys.argv', ['helper', 'csr']), patch.object(files.getpass, 'getpass', side_effect=[key_password, key_password]):
                files.main()
            key = folder / 'distribution-private.key'
            csr = folder / 'distribution.csr'
            self.assertIn(b'ENCRYPTED PRIVATE KEY', key.read_bytes())
            subprocess.run([files.openssl(), 'req', '-in', str(csr), '-verify', '-noout'], check=True, capture_output=True)
            certificate = folder / 'synthetic.cer'
            subprocess.run([files.openssl(), 'req', '-x509', '-new', '-key', str(key), '-passin', 'env:FIXTURE_KEY_PASSWORD',
                            '-out', str(certificate), '-outform', 'DER', '-days', '1', '-subj', '/CN=Synthetic signing test'],
                           env={**os.environ, 'FIXTURE_KEY_PASSWORD': key_password}, capture_output=True, check=True)
            with patch.object(files, 'FOLDER', folder), patch('sys.argv', ['helper', 'p12', '--certificate=' + str(certificate)]), patch.object(files.getpass, 'getpass', side_effect=[key_password, p12_password, p12_password]):
                files.main()
            p12 = folder / 'distribution.p12'
            result = subprocess.run([files.openssl(), 'pkcs12', '-in', str(p12), '-nokeys', '-passin', 'env:FIXTURE_P12_PASSWORD'],
                env={**os.environ, 'FIXTURE_P12_PASSWORD': p12_password}, capture_output=True, check=True)
            self.assertIn(b'Synthetic signing test', result.stdout)
            with patch.object(files, 'FOLDER', folder), patch('sys.argv', ['helper', 'encode', '--file=' + str(p12)]):
                files.main()
            self.assertEqual(base64.b64decode((folder / 'distribution.p12.base64.txt').read_text()), p12.read_bytes())

    def test_existing_private_key_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            key = folder / 'distribution-private.key'
            key.write_text('keep existing key')
            with patch.object(files, 'FOLDER', folder), patch('sys.argv', ['helper', 'csr']), patch.object(files.getpass, 'getpass') as prompt:
                with self.assertRaises(ValueError): files.main()
                prompt.assert_not_called()
            self.assertEqual(key.read_text(), 'keep existing key')

    def test_bad_certificate_or_password_does_not_leave_a_partial_p12(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / 'distribution-private.key').write_text('fixture key')
            certificate = folder / 'bad.cer'
            certificate.write_text('bad certificate')
            with patch.object(files, 'FOLDER', folder), patch('sys.argv', ['helper', 'p12', '--certificate=' + str(certificate)]), patch.object(files.getpass, 'getpass', side_effect=['test-key-password', 'test-p12-password', 'test-p12-password']):
                with self.assertRaises(ValueError): files.main()
            self.assertFalse((folder / 'distribution.p12').exists())
            self.assertEqual(sorted(p.name for p in folder.iterdir()), ['bad.cer', 'distribution-private.key'])


if __name__ == '__main__': unittest.main()
