import unittest
from backend.nbki_delivery import receipt_outcomes
from backend.nbki_import import parse_receipt_zip

class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.events = [dict(order_num=i,uid='U'+str(i),event_name='FL_Event_2_3',event_time=None) for i in range(1,4)]
        self.partial = dict(kind=2,status='partial',events_received=3,accepted=2,rejected=1,
                            errors=[dict(order_num=2,uid='U2',event_name='FL_Event_2_3')])

    def test_partial_and_multiple_errors_on_one_event(self):
        self.partial['errors'] *= 2
        self.assertEqual(receipt_outcomes(self.events,self.partial),{1:'accepted',2:'rejected',3:'accepted'})

    def test_incomplete_partial_receipt_cannot_accept_unknown_events(self):
        self.partial['errors']=[]
        with self.assertRaises(ValueError): receipt_outcomes(self.events,self.partial)

    def test_wrong_uid_order_or_time_cannot_apply_receipt(self):
        for field,value in [('uid','OTHER'),('order_num',99),('event_date_time','2026-01-01')]:
            receipt={**self.partial,'errors':[{**self.partial['errors'][0],field:value}]}
            with self.assertRaises(ValueError): receipt_outcomes(self.events,receipt)

    def test_counts_must_match(self):
        for field in ('events_received','accepted','rejected'):
            with self.assertRaises(ValueError):receipt_outcomes(self.events,{**self.partial,field:9})

    def test_ticket1_is_never_event_acceptance(self):
        self.assertEqual(set(receipt_outcomes(self.events,dict(kind=1,status='received')).values()),{'pending'})

    def test_full_acceptance_and_rejection(self):
        self.assertEqual(set(receipt_outcomes(self.events,{**self.partial,'accepted':3,'rejected':0,'errors':[]}).values()),{'accepted'})
        self.assertEqual(set(receipt_outcomes(self.events,{**self.partial,'accepted':0,'rejected':3,'errors':[]}).values()),{'rejected'})

    def test_plain_xml_receipt_and_wrong_source(self):
        raw=b'<NotificationOfReceipt><sourceId>QY01GG000001</sourceId><outgoingDocNumber>R</outgoingDocNumber><acceptanceStatusOK/></NotificationOfReceipt>'
        self.assertEqual(parse_receipt_zip(raw)['status'],'received')
        with self.assertRaises(ValueError):parse_receipt_zip(raw.replace(b'QY01GG000001',b'OTHER'))
        with self.assertRaises(ValueError):parse_receipt_zip(b'<broken')

class RetryGuardTests(unittest.TestCase):
    def test_identical_rejected_event_blocked_but_changed_data_allowed(self):
        import gzip
        from unittest.mock import Mock,patch
        from backend.nbki_delivery import check_delivery
        old=b'<Document><Subject_FL><Title><Name>A</Name></Title><Events><FL_Event_2_3 orderNum="20"><Value>old</Value></FL_Event_2_3></Events></Subject_FL></Document>'
        cur=Mock();cur.fetchone.return_value=(gzip.compress(old),)
        state=dict(status='rejected',file_id=1,order_num=20,errors=[])
        with patch('backend.nbki_delivery.delivery_state',return_value=state):
            same=old.replace(b'orderNum="20"',b'orderNum="1"')
            with self.assertRaisesRegex(ValueError,'не изменились'):check_delivery(cur,2,27,same)
            check_delivery(cur,2,27,same.replace(b'>old<',b'>fixed<'))
            check_delivery(cur,2,27,same.replace(b'>A<',b'>Corrected name<'))

    def test_accepted_and_pending_events_cannot_be_exported(self):
        from unittest.mock import Mock,patch
        from backend.nbki_delivery import check_delivery
        for status in ('accepted','exported'):
            with patch('backend.nbki_delivery.delivery_state',return_value={'status':status}):
                with self.assertRaises(ValueError):check_delivery(Mock(),2,27)
