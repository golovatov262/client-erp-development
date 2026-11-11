import copy
import unittest
from unittest.mock import patch
import base64
from pathlib import Path
import xml.etree.ElementTree as ET
from lxml import etree
from backend.nbki_lifecycle import (obligation_event, collateral_event, references,
    prepare_guarantor_payload, validate_guarantor_accounting, checksum, ScheduleCursor)
from scripts import test_nbki_event23_xml as payment_fixtures


class LifecycleTests(unittest.TestCase):
    def payload(self, name='FL_Event_2_5'):
        f = payment_fixtures.Event23XmlTests()._base_facts()
        f['loan']['terms']['kind_code'] = '8'
        f['uid'] = '12345678-1234-1234-a234-123456789012-1'
        f['contract_no'] = 'TEST-001'
        f['source'] = {'source_code':'3'}
        f['payment']['last_payment_date'] = '2026-10-29'
        return {'snapshot':{'schedule':[],'occurred_at':f['event_occurred_at'], 'loan':dict(f['loan'],contract_no=f['contract_no']),
                            'uid':f['uid'],'collateral':[]},'facts':f,'event_name':name,'reason_code':'1',
                'changes':{'code':'1','specialCode':'99'},'basis':'Дополнительное соглашение',
                'debt_evidence':{'accounting':{},'debt':{'term_principal':'0','overdue_principal':'0','overdue_interest':'0',
                       'penalty_candidate':{'remaining':'0'},'rows':[]},'preview':{},'interest':{'remaining_interest_candidate':'0'},'smp':{}}}

    def assert_schema(self,event):
        main=(Path(__file__).parents[1]/'backend/nbki_xsd/5.1/Main.xsd').resolve()
        schema=etree.XMLSchema(etree.fromstring(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="{main}"/><xs:element name="{event.tag}" type="{event.tag}_Type"/></xs:schema>'))
        self.assertTrue(schema.validate(etree.fromstring(ET.tostring(event))),str(schema.error_log))

    def test_zero_debt_closure_matches_official_xsd(self):
        ev=obligation_event(self.payload())
        self.assert_schema(ev)
        self.assertEqual(ev.findtext('FL_38_ContractEnd/date'),'2026-10-30')
        self.assertEqual(ev.findtext('FL_38_ContractEnd/code'),'1')
        self.assertIsNotNone(ev.find('FL_56_Participation/stopExist_1'))
        self.assertIsNone(ev.find('FL_25_26_27_28_Group/FL_26_DebtDue'))
        self.assertEqual(ev.findtext('FL_25_26_27_28_Group/FL_28_Payment/date'),'2026-10-29')

    def test_terms_change_xsd_and_required_codes(self):
        p=self.payload('FL_Event_2_1')
        self.assert_schema(obligation_event(p))
        p['changes']={}
        with self.assertRaisesRegex(ValueError,'вид и специальный код'):
            obligation_event(p)

    def test_debt_change_does_not_invent_payment(self):
        p=self.payload('FL_Event_2_3')
        ev=obligation_event(p)
        self.assert_schema(ev)
        self.assertEqual(ev.findtext('FL_25_26_27_28_Group/calcDate'),'2026-10-30')
        self.assertEqual(ev.findtext('FL_25_26_27_28_Group/FL_28_Payment/date'),'2026-10-29')
        self.assertEqual(ev.findtext('FL_25_26_27_28_Group/FL_28_Payment/paymentSum'),'100.00')

    def test_collateral_closure_reports_terminated_warranty(self):
        s=self.payload()['snapshot']
        s['collateral']=[{'id':1,'collateral_type':'Поручительство','nbki_guarantee_uid':s['uid'],
                          'nbki_guarantee_amount':'1000.00','nbki_guarantee_currency':'RUB',
                          'nbki_guarantee_start':'2026-01-01','nbki_guarantee_end':'2027-01-01'}]
        ev=collateral_event(s,'1')
        self.assert_schema(ev)
        self.assertEqual(ev.findtext('FL_33_Warranty/factEndDate'),'2026-10-30')
        self.assertEqual(ev.findtext('FL_33_Warranty/endCode'),'1')

    def test_pledge_flags_must_be_confirmed(self):
        s=self.payload()['snapshot']
        row={'id':2,'collateral_type':'Залог движимого имущества','identifier':'TEST123456789',
             'nbki_collateral_code':'2','nbki_collateral_start':'2026-01-01','nbki_collateral_sum':'1000.00',
             'nbki_collateral_currency':'RUB','nbki_price_code':'1','nbki_contract_total_sum':'1000.00','nbki_contract_count':1}
        s['collateral']=[row]
        with self.assertRaisesRegex(ValueError,'подтвердите признак'):
            collateral_event(s,'1')
        row.update(nbki_acquired=False,nbki_inhabited=False,nbki_insured=False)
        ev=collateral_event(s,'1')
        self.assert_schema(ev)
        self.assertEqual(ev.findtext('FL_32_35_Group/FL_32_Collateral/endReason'),'1')

    def test_guarantor_never_inherits_borrower_payments(self):
        p=self.payload()
        p['guarantor']={'nbki_guarantee_no_payments':True}
        converted=prepare_guarantor_payload(p)
        self.assertEqual(converted['facts']['payment']['cumulative']['amount'],'0.00')
        self.assertEqual(converted['facts']['payment']['last_payment_date'],'-')
        self.assertEqual(p['facts']['payment']['amount'],'100')
        del p['guarantor']['nbki_guarantee_no_payments']
        with self.assertRaisesRegex(ValueError,'учёт платежей поручителя'):
            prepare_guarantor_payload(p)

    def test_guarantor_own_debt_confirmation_for_changes(self):
        p=self.payload('FL_Event_2_1')
        p['guarantor']={'nbki_guarantee_no_payments':True}
        with self.assertRaisesRegex(ValueError,'отсутствие долга'):
            prepare_guarantor_payload(p)
        p['guarantor']['nbki_guarantee_no_debt']=True
        self.assert_schema(obligation_event(prepare_guarantor_payload(p)))

    def test_guarantor_accounting_amounts_checked(self):
        a={'basis':'Акт','date':'2026-10-30','payment':dict(amount='10',principal='8',interest='2',penalty='0',date='2026-10-29'),
           'cumulative':dict(amount='10',principal='8',interest='2',penalty='0'),
           'debt':dict(term_principal='10',overdue_principal='0',term_interest='0',overdue_interest='0',penalty='0')}
        validate_guarantor_accounting(a)
        a['cumulative']['amount']='11'
        with self.assertRaisesRegex(ValueError,'составляющим'):
            validate_guarantor_accounting(a)

    def test_reference_codes_and_checksum(self):
        self.assertIn('18',{r['code'] for r in references()['closure']})
        self.assertEqual({r['code'] for r in references()['collateral']},{'1','2','3','4','99'})
        a=self.payload()
        changed=copy.deepcopy(a); changed['reason_code']='99'
        self.assertNotEqual(checksum(a),checksum(changed))

    def test_complete_guarantor_closure_validates_and_has_own_title(self):
        from backend.nbki_lifecycle import build_lifecycle_xml
        p=self.payload()
        p['snapshot']['loan']['amount']='1000.00'
        p['facts']['source']={'inn':'4307012081','ogrn':'1084307001041','name':'ПККО ЭКСПЕРТ ФИНАНС',
            'short_name':'ПККО ЭКСПЕРТ ФИНАНС','source_id':'QY01GG000001','source_code':'3',
            'registration_date':'2008-11-20','registration_number':'1084307001041'}
        subject={'last_name':'ПЕТРОВ','first_name':'ПЕТР','birth_date':'1990-01-01',
            'passport_series':'1234','passport_number':'123456','passport_issue_date':'2020-01-01',
            'passport_issued_by':'МВД РОССИИ','inn':'123456789012'}
        p['guarantor']={'subject':subject,'nbki_guarantee_no_payments':True,
            'nbki_guarantee_uid':'22345678-1234-1234-a234-123456789012-1','nbki_guarantee_contract_no':'TEST-002',
            'nbki_guarantee_start':'2026-01-01','nbki_guarantee_end':'2027-01-01',
            'nbki_guarantee_amount':'1000.00','nbki_guarantee_currency':'RUB'}
        p['reason_code']='18'
        with patch('backend.nbki_delivery.check_delivery'):
            result=build_lifecycle_xml(None,2,1,(p,checksum(p)))
        self.assertTrue(result['xsd_valid'])
        root=ET.fromstring(base64.b64decode(result['content_base64']))
        self.assertEqual(root.findtext('.//FL_1_Name/lastName'),'ПЕТРОВ')
        self.assertEqual(root.findtext('.//FL_18_Deal/role'),'2')
        self.assertEqual(root.findtext('.//FL_38_ContractEnd/code'),'18')
        self.assertEqual(root.findtext('.//FL_28_Payment/totalSum'),'0.00')
        self.assertIsNone(root.find('.//FL_28_Payment/date'))
        self.assertEqual(root.findtext('.//FL_19_1_AmountInfo/securityUid'),p['facts']['uid'])

    def test_frozen_schedule_survives_live_changes(self):
        s={'schedule':[dict(payment_date='2026-11-01',principal_amount='100',interest_amount='10',payment_amount='110',paid_amount='0',status='pending')]}
        cur=ScheduleCursor(s)
        cur.execute('SELECT FROM loan_schedule LIMIT 1',(1,'2026-10-30'))
        self.assertEqual(str(cur.fetchone()[0]),'2026-11-01')


if __name__=='__main__':
    unittest.main()
