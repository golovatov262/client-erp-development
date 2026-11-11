import base64
import hashlib
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch
from backend.nbki_event23_xml import build_event23_batch_xml


def individual(event_id):
    if event_id == 99:
        raise ValueError('Нет времени')
    uid = 'A' if event_id in (1, 2) else 'B'
    day = {1: '2026-11-02', 2: '2026-11-01', 3: '2026-11-03'}[event_id]
    xml = f'''<Document regNumberDoc="REG" subjectsCount="1" groupBlocksCount="1">
      <Source/><Data><Subject_FL><Title><Name>{uid}</Name></Title><Events>
      <FL_Event_2_3 orderNum="1" eventDateTime="{day}T12:00:00+03:00"/>
      </Events></Subject_FL></Data></Document>'''
    return dict(content_base64=base64.b64encode(xml.encode()).decode(), uid=uid, contract_no=uid)


class BatchTests(unittest.TestCase):
    def test_global_order_after_grouping_sorting_and_exclusion(self):
        with patch('backend.nbki_event23_xml.build_event23_xml', side_effect=lambda c,o,e: individual(e)), \
             patch('backend.nbki_event23_xml._validate_xsd', return_value={
                 'xsd_valid': False, 'xsd_status': 'accepted_deviations', 'xsd_errors': ['sizeCode']}):
            result=build_event23_batch_xml(None,2,[99,1,3,2,1])
        raw=base64.b64decode(result['content_base64']);root=ET.fromstring(raw)
        events=root.findall('.//FL_Event_2_3')
        self.assertEqual([e.get('orderNum') for e in events], ['1','2','3'])
        self.assertTrue(events[0].get('eventDateTime').startswith('2026-11-01'))
        self.assertEqual(root.get('subjectsCount'),'2')
        self.assertEqual(root.get('groupBlocksCount'),'3')
        self.assertEqual(len(result['events']),3)
        self.assertEqual(result['excluded'],[{'event_id':99,'reason':'Нет времени'}])
        self.assertTrue(raw.startswith(b'\xef\xbb\xbf<?xml version="1.0" encoding="UTF-8"?>\r\n'))
        self.assertTrue(raw.endswith(b'\r\n'))
        self.assertNotIn(b'\n',raw.replace(b'\r\n',b''))
        self.assertEqual(hashlib.sha256(raw).hexdigest(),result['sha256'])
        self.assertFalse(result['xsd_valid'])

    def test_empty_batch_does_not_produce_file(self):
        with patch('backend.nbki_event23_xml.build_event23_xml',side_effect=ValueError('Нет времени')):
            with self.assertRaisesRegex(ValueError,'Нет готовых'):
                build_event23_batch_xml(None,2,[99])


if __name__ == '__main__':
    unittest.main()
