import base64
import io
import unittest
import zipfile
from backend.nbki_exchange import directory_url, normalize_config, thumbprint, decode, receipt_archive, receipt_urls, UPLOAD_URL, upload_success


class ExchangeValidationTests(unittest.TestCase):
    def test_transport_cannot_redirect_worker_to_other_hosts_or_credentials(self):
        for value in ('http://files.nbki.ru/in', 'https://nbki.ru.evil.org/in', 'https://user:secret@nbki.ru/in',
                      'https://127.0.0.1/in','https://nbki.ru/in?token=secret', 'https://nbki.ru:8443/in'):
            with self.subTest(value=value), self.assertRaises(ValueError): directory_url(value)
        self.assertEqual(directory_url('https://files.nbki.ru/in'), 'https://files.nbki.ru/in/')

    def test_profile_does_not_guess_signature_or_transport(self):
        config=normalize_config({}, {})
        self.assertEqual(config['transport'],'disabled')
        self.assertEqual(config['signature_mode'],'detached')
        self.assertEqual(config['signature_profile'],'CAdES-T')
        self.assertEqual(config['upload_url'],UPLOAD_URL)
        self.assertEqual(config['package_suffix'],'.zip.p7m')
        with self.assertRaises(ValueError): normalize_config({'transport':'webdav'}, {})
        with self.assertRaises(ValueError): normalize_config({'package_suffix':'.zip'}, {})
        with self.assertRaises(ValueError): normalize_config({'tsp_url':'file:///key'}, {})
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

    def test_receipts_use_frozen_suffix_and_two_urls_only_for_ticket1(self):
        first=receipt_urls('ABC_20261113_120000',1,'.zip.p7m')
        self.assertEqual(len(first),2)
        self.assertTrue(first[0]['encrypted'])
        self.assertFalse(first[1]['encrypted'])
        self.assertTrue(first[1]['url'].endswith('_ticket1.zip'))
        second=receipt_urls('ABC_20261113_120000',2,'.zip.enc')
        self.assertEqual(len(second),1)
        self.assertTrue(second[0]['url'].endswith('_ticket2.zip.enc'))
        with self.assertRaises(ValueError):receipt_urls('../secret',1,'.zip.enc')

    def test_mchd_validation(self):
        with self.assertRaises(ValueError):normalize_config({'mchd_base64':base64.b64encode(b'not zip').decode()}, {})
        value=base64.b64encode(self.archive([('mchd.xml',b'xml'),('mchd.sig',b'signature')])).decode()
        self.assertEqual(normalize_config({'mchd_base64':value},{})['mchd_base64'],value)

    def test_http_200_is_not_delivery_confirmation(self):
        name='R.zip.p7m'
        self.assertTrue(upload_success('Success\r\nThe following files were successfully uploaded :\r\n'+name,name))
        for response in ('Success','The parameter pathnm is not specified.', 'Success\nThe following files were successfully uploaded :\nOTHER.zip.p7m'):
            self.assertFalse(upload_success(response,name))

    def test_unrecognized_upload_response_is_preserved_without_confirming_delivery(self):
        from unittest.mock import Mock
        from backend.nbki_exchange import agent, digest
        cur, conn = Mock(), Mock()
        cur.fetchone.side_effect = [(8, 2), ('sending', 'lease', {}, 'file.xml', b'<x/>')]
        raw = b'<html>Unrecognized server response</html>\xff'
        encoded = base64.b64encode(raw).decode()
        result = agent(cur, conn, 'test-token', 'POST', {
            'action': 'failed', 'id': 5, 'lease': 'lease',
            'error': 'Unconfirmed upload', 'response_base64': encoded})
        self.assertTrue(result['success'])
        updates = cur.execute.call_args_list
        saved = next(call.args[1][0].adapted for call in updates if 'evidence=evidence' in call.args[0])
        self.assertEqual(base64.b64decode(saved['upload_response_base64']), raw)
        self.assertEqual(saved['upload_response_sha256'], digest(raw))
        state = next(call.args[1][0] for call in updates if 'SET status=%s' in call.args[0])
        self.assertEqual(state, 'delivery_unknown')
        conn.commit.assert_called_once()
