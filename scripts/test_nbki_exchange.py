import base64
import io
import unittest
import zipfile
from backend.nbki_exchange import directory_url, normalize_config, thumbprint, decode, receipt_archive


class ExchangeValidationTests(unittest.TestCase):
    def test_transport_cannot_redirect_worker_to_other_hosts_or_credentials(self):
        for value in ('http://files.nbki.ru/in', 'https://nbki.ru.evil.org/in', 'https://user:secret@nbki.ru/in',
                      'https://127.0.0.1/in','https://nbki.ru/in?token=secret', 'https://nbki.ru:8443/in'):
            with self.subTest(value=value), self.assertRaises(ValueError): directory_url(value)
        self.assertEqual(directory_url('https://files.nbki.ru/in'), 'https://files.nbki.ru/in/')

    def test_profile_does_not_guess_signature_or_transport(self):
        config=normalize_config({}, {})
        self.assertEqual(config['transport'],'disabled')
        self.assertEqual(config['signature_mode'],'')
        self.assertEqual(config['package_suffix'],'')
        with self.assertRaises(ValueError): normalize_config({'transport':'webdav'}, {})
        with self.assertRaises(ValueError): normalize_config({'signature_mode':'unknown'}, {})
        self.assertNotIn('recipient',normalize_config({'recipient':{'thumbprint':'fake'}},{}))

    def test_thumbprint_and_size_limits(self):
        self.assertEqual(thumbprint('ab '*20),'AB'*20)
        with self.assertRaises(ValueError):thumbprint('certificate name')
        with self.assertRaises(ValueError):decode(base64.b64encode(b'abcd').decode(),3)
        with self.assertRaises(ValueError):decode('')

    def archive(self,entries):
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
            for name,data in entries:z.writestr(name,data)
        return output.getvalue()

    def test_receipt_archive_rejects_missing_signature_paths_and_zip_bombs(self):
        receipt_archive(self.archive([('ticket.xml',b'<x/>'),('ticket.xml.sig',b'cms')]))
        for entries in ([('ticket.xml',b'<x/>')], [('a/ticket.xml',b'<x/>'),('a/ticket.xml.sig',b'cms')],
                        [('ticket.xml',b'x'*(2*1024*1024+1)),('ticket.xml.sig',b'cms')]):
            with self.assertRaises(ValueError):receipt_archive(self.archive(entries))
