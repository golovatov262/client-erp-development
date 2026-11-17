import unittest
import xml.etree.ElementTree as ET
from unittest.mock import Mock
from backend.nbki_import import parse_source_xml, source_profile, parse_receipt_zip


def document(roles):
    root=ET.Element('Document', schemaVersion='5.1',inn='3666209530',ogrn='1163668081895',sourceID='GU01LL000001',regNumberDoc='GU01LL000001_20261006_145023',dateTimeDoc='2026-10-06T14:50:23+03:00',subjectsCount=str(len(roles)),groupBlocksCount=str(len(roles)))
    data=ET.SubElement(root,'Data')
    for n,role in enumerate(roles,1):
        subject=ET.SubElement(data,'Subject_FL');ET.SubElement(subject,'Title')
        event=ET.SubElement(ET.SubElement(subject,'Events'),'FL_Event_2_3',orderNum=str(n),eventDateTime='2026-09-20T10:00:00+03:00')
        uid=ET.SubElement(event,'FL_17_DealUid');ET.SubElement(uid,'uid').text='uid-'+str(n);ET.SubElement(uid,'num').text='SAME-NUMBER'
        deal=ET.SubElement(event,'FL_18_Deal');ET.SubElement(deal,'role').text=role
    return ET.tostring(root)

class ProfilesTests(unittest.TestCase):
    def test_wrong_source_rejected(self):
        with self.assertRaisesRegex(ValueError,'другому источнику'):parse_source_xml(document(['1']))
    def test_selected_source_and_guarantee_numbers(self):
        parsed=parse_source_xml(document(['2','2']),source_id='GU01LL000001',source_inn='3666209530')
        self.assertEqual(len(parsed['deals']),2)
    def test_borrower_uid_conflict_still_blocked(self):
        with self.assertRaisesRegex(ValueError,'несколькими УИД'):
            parse_source_xml(document(['1','1']),source_id='GU01LL000001',source_inn='3666209530')
    def test_wrong_inn_rejected_even_with_right_code(self):
        with self.assertRaisesRegex(ValueError,'другому источнику'):
            parse_source_xml(document(['1']),source_id='GU01LL000001',source_inn='4307012081')
    def test_source_lookup_is_scoped(self):
        cur=Mock(fetchone=Mock(return_value=('GU01LL000001','3666209530')))
        self.assertEqual(source_profile(cur,3)['source_id'],'GU01LL000001')
        self.assertEqual(cur.execute.call_args.args[1],(3,))

    def test_receipt_source_isolated(self):
        raw=b'<NotificationOfReceipt><sourceId>GU01LL000001</sourceId><outgoingDocNumber>GU01LL000001_20261006_145023</outgoingDocNumber><acceptanceStatusOK/></NotificationOfReceipt>'
        self.assertEqual(parse_receipt_zip(raw,source_id='GU01LL000001')['status'],'received')
        with self.assertRaisesRegex(ValueError,'другого источника'):parse_receipt_zip(raw)
