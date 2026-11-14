import base64,unittest
from datetime import datetime
from unittest.mock import Mock,patch
from backend.okb_exchange import BASE_URL,validate_settings
from backend.okb_xml import profile_xml
from backend.nbki_import import parse_receipt_zip
from backend.nbki_reporting_policy import paired_ids
from backend.okb_delivery import check_delivery

class OkbTests(unittest.TestCase):
 def test_configuration_never_accepts_an_arbitrary_cfb_host_or_secret(self):
  config=validate_settings({'base_url':'https://evil.invalid','password':'secret','sin':'00123'}, {'base_url':BASE_URL})
  self.assertEqual(config['base_url'],BASE_URL);self.assertNotIn('password',config)
  with self.assertRaises(ValueError):validate_settings({'sin':'123'}, {})
  with self.assertRaises(ValueError):validate_settings({'username':'a\r\nX-Evil: yes'}, {})
  with self.assertRaises(ValueError):validate_settings({'enabled':True}, {})
 def test_receipt_source_is_independent(self):
  raw=b'<NotificationOfReceipt><sourceId>00123</sourceId><outgoingDocNumber>CHP_00123_EFK_05-10_20261114120000123</outgoingDocNumber><acceptanceStatusOK/></NotificationOfReceipt>'
  self.assertEqual(parse_receipt_zip(raw,source_id='00123')['status'],'received')
  with self.assertRaises(ValueError):parse_receipt_zip(raw)
 def test_okb_rechecks_xml_and_changes_only_envelope(self):
  raw=b'<Document schemaVersion="5.1" sourceID="NBKI" regNumberDoc="OLD"><Source/><Data><Subject_FL><Title/><Events><FL_Event_2_3 eventDateTime="2026-11-13T12:00:00+03:00" orderNum="1"><amount>100.25</amount></FL_Event_2_3></Events></Subject_FL></Data></Document>'
  with patch('backend.okb_xml._validate_xsd') as validate:
   name,xml=profile_xml(raw,'00123',datetime.fromisoformat('2026-11-14T12:00:00.123+03:00'))
   self.assertEqual(name,'CHP_00123_EFK_05-10_20261114120000123.xml');self.assertIn(b'100.25',xml);self.assertIn(b'2026-11-13T12:00:00+03:00',xml)
   validate.assert_called_once_with(xml)
 def test_reporting_pairs_use_only_target_bureau_delivery(self):
  with patch('backend.nbki_reporting_policy.reporting_pairs',return_value=[(1,2)]),patch('backend.okb_delivery.delivery_state',return_value={'status':'new'}) as okb,patch('backend.nbki_delivery.delivery_state',return_value={'status':'accepted'}) as nbki:
   self.assertEqual(paired_ids(Mock(),2,[2],bureau='okb'),[1,2]);nbki.assert_not_called();self.assertEqual(okb.call_count,2)
 def test_accepted_or_inflight_okb_event_cannot_be_resent(self):
  for state in ('accepted','exported'):
   with patch('backend.okb_delivery.delivery_state',return_value={'status':state}),self.assertRaises(ValueError):check_delivery(Mock(),2,1)
 def test_rejected_unchanged_xml_is_blocked(self):
  raw=b'<Document><Data><Subject_FL><Title>A</Title><Events><Event orderNum="1"><value>1</value></Event></Events></Subject_FL></Data></Document>'
  cur=Mock();cur.fetchone.return_value=(raw,)
  with patch('backend.okb_delivery.delivery_state',return_value={'status':'rejected','package_id':1,'order_num':1}):
   with self.assertRaises(ValueError):check_delivery(cur,2,1,raw)
   check_delivery(cur,2,1,raw.replace(b'>1<',b'>2<'))

 def test_envelope_rejection_allows_retry_without_fabricating_xml_changes(self):
  with patch('backend.okb_delivery.delivery_state',return_value={'status':'rejected','receipt_kind':1}):
   self.assertEqual(check_delivery(Mock(),2,1,b'<Document/>')['status'],'rejected')
