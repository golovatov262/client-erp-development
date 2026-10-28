"""Receipt ZIP safety and CryptoPro invocation tests."""

import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from scripts.nbki_verify_receipt import verify_receipt


class ReceiptVerificationTests(unittest.TestCase):
    def test_calls_cryptcp_for_detached_signature(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive_path = Path(temporary) / 'ticket.zip'
            with zipfile.ZipFile(archive_path, 'w') as archive:
                archive.writestr('nested/receipt.xml',
                    '<NotificationOfReceipt><outgoingDocNumber>QY01GG000001_20261006_105912</outgoingDocNumber>'
                    '<acceptanceStatusOK/><docDateTime>2026-10-06T11:00:00+03:00</docDateTime>'
                    '</NotificationOfReceipt>')
                archive.writestr('nested/receipt.xml.sig', b'nonempty-test-signature')
            with patch('scripts.nbki_verify_receipt.subprocess.run') as run:
                result = verify_receipt(archive_path)
                self.assertEqual(result['status'], 'received')
                self.assertEqual(result['reg_number'], 'QY01GG000001_20261006_105912')
                args = run.call_args.args[0]
                self.assertEqual(args[:4], ['cryptcp', '-verify', '-detached', '-verall'])
                self.assertEqual(args[-2:], ['-fext', '.sig'])
                self.assertEqual(Path(args[4]).name, 'receipt.xml')

    def test_missing_signature_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive_path = Path(temporary) / 'ticket.zip'
            with zipfile.ZipFile(archive_path, 'w') as archive:
                archive.writestr('receipt.xml', '<NotificationOfReceipt/>')
            with self.assertRaisesRegex(ValueError, 'XML квитанции и его'):
                verify_receipt(archive_path)


if __name__ == '__main__':
    unittest.main()
