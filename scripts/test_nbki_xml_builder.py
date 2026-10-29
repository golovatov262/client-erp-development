import unittest
import xml.etree.ElementTree as ET
from datetime import datetime

from backend.nbki_xml_builder import document_xml


class XmlBuilderTests(unittest.TestCase):
    def test_document_envelope_uses_crm_source_and_subject(self):
        source = {'inn': '4307012081', 'ogrn': '1084307001041',
                  'name': 'ПККО ЭКСПЕРТ ФИНАНС', 'short_name': 'ПККО ЭКСПЕРТ ФИНАНС',
                  'source_id': 'QY01GG000001', 'source_code': '3',
                  'registration_date': '2008-11-20',
                  'registration_number': '1084307001041'}
        subject = {'last_name': 'ИВАНОВ', 'first_name': 'ИВАН',
                   'birth_date': '1990-01-01', 'passport_series': '1234',
                   'passport_number': '123456', 'passport_issue_date': '2020-01-01',
                   'passport_issued_by': 'МВД РОССИИ', 'inn': '123456789012'}
        event = ET.Element('FL_Event_2_3', {'operationCode': 'B', 'orderNum': '1',
                                            'eventDateTime': '2026-10-29T10:42:15+03:00'})
        created = datetime.fromisoformat('2026-10-29T11:00:00+03:00')
        raw, digest = document_xml(source, [(subject, [event])],
                                   'QY01GG000001_20261029_000001', created)
        root = ET.fromstring(raw)
        self.assertEqual(root.get('schemaVersion'), '5.1')
        self.assertEqual(root.get('groupBlocksCount'), '1')
        self.assertEqual(root.findtext('./Source/FL_46_UL_36_OrgSource/sourceCode'), '3')
        self.assertEqual(root.findtext('./Data/Subject_FL/Title/FL_1_4_Group/FL_1_Name/lastName'), 'ИВАНОВ')
        self.assertEqual(len(digest), 64)
        self.assertEqual(raw, document_xml(source, [(subject, [ET.fromstring(ET.tostring(event))])],
                                           'QY01GG000001_20261029_000001', created)[0])


if __name__ == '__main__':
    unittest.main()
