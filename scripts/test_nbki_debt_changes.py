import gzip
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch
from backend.nbki_debt_changes import accepted_state, compare_states, money, review_debt_change, require_debt_change, evidence_state
from scripts import test_nbki_lifecycle as fixtures
from backend.nbki_lifecycle import obligation_event


class DebtComparisonTests(unittest.TestCase):
    now=datetime(2026,11,11,15,tzinfo=timezone.utc)

    def event(self):
        return obligation_event(fixtures.LifecycleTests().payload('FL_Event_2_3'))

    def test_zero_debt_explicit_branch(self):
        state=accepted_state(self.event())
        self.assertEqual(state['term_principal'],'0.00')
        self.assertEqual(state['currency'],'RUB')
        self.assertFalse(state['over90'])

    def test_positive_debt_components_must_equal_total(self):
        ev=ET.fromstring("""<FL_Event_2_3><FL_18_Deal><role>1</role></FL_18_Deal>
          <FL_25_26_27_28_Group><exist_1/><FL_25_Debt><currency>RUB</currency>
          <debtMainSum>100</debtMainSum><debtPercentSum>12</debtPercentSum><debtOtherSum>0</debtOtherSum></FL_25_Debt>
          <FL_26_DebtDue><debtDueExist_1/><debtDueMainSum>90</debtDueMainSum><debtDuePercentSum>10</debtDuePercentSum><debtDueOtherSum>0</debtDueOtherSum></FL_26_DebtDue>
          <FL_27_DebtOverdue><missFact_1/><debtOverdueMainSum>10</debtOverdueMainSum><debtOverduePercentSum>2</debtOverduePercentSum><debtOverdueOtherSum>0</debtOverdueOtherSum>
          <debtOverdueStartDate>2026-10-31</debtOverdueStartDate><mainMissDate>2026-10-31</mainMissDate><percentMissDate>2026-10-31</percentMissDate></FL_27_DebtOverdue></FL_25_26_27_28_Group></FL_Event_2_3>""")
        state=accepted_state(ev)
        self.assertEqual(state['term_interest'],'10.00')
        self.assertEqual(state['overdue_interest'],'2.00')
        ev.find('.//debtMainSum').text='101'
        with self.assertRaisesRegex(ValueError,'не сходятся'):accepted_state(ev)

    def test_missing_amounts_never_become_zero(self):
        for value in (None,'','-','NaN','Infinity','-0.01','bad'):
            with self.subTest(value=value), self.assertRaises(ValueError):money(value)
        self.assertEqual(money('12.3'),'12.30')

    def test_unchanged_date_does_not_create_event_but_31_days_does(self):
        state=accepted_state(self.event())
        for days,expected in ((1,'unchanged'),(30,'unchanged'),(31,'periodic'),(32,'periodic')):
            self.assertEqual(compare_states(state,state,self.now,self.now-timedelta(days=days))['decision'],expected)

    def test_changed_interest_and_over90_flag_are_reported(self):
        old=accepted_state(self.event())
        new=dict(old,term_interest='12.01',over90=True)
        r=compare_states(new,old,self.now,self.now-timedelta(days=1))
        self.assertEqual(r['decision'],'changed')
        self.assertEqual(set(r['changes']),{'term_interest','over90'})

    def test_newer_accepted_slice_blocks_old_event(self):
        for delta in (0,1):
            r=compare_states({'x':1},{'x':2},self.now,self.now+timedelta(seconds=delta))
            self.assertEqual(r['decision'],'stale')

    def test_missing_receipt_baseline_blocks_export(self):
        cur=Mock();cur.fetchone.return_value=None
        payload={'facts':{'uid':'UID'},'snapshot':{'occurred_at':self.now.isoformat()},'debt_evidence':{}}
        with self.assertRaisesRegex(ValueError,'Нет подтверждённого'):
            require_debt_change(cur,2,payload)
        sql=cur.execute.call_args_list[0].args[0]
        self.assertIn("fe.delivery_status='accepted'",sql)
        self.assertIn('f.archived_at IS NULL',sql)

    def test_authorized_initial_snapshot_does_not_claim_acceptance(self):
        e={'as_of':'2026-11-11','preview':dict(status='candidate_from_crm_components',term_principal='100',term_interest_candidate='1',term_other_candidate='0',overdue_principal='0',overdue_interest='0',overdue_other='0'), 'debt':{'rows':[]}}
        cur=Mock();cur.fetchone.side_effect=[None,(438,self.now,evidence_state(e),'Архив недоступен')]
        r=review_debt_change(cur,2,'UID',self.now,e)
        self.assertEqual(r['decision'],'initial_snapshot')
        self.assertNotIn('accepted',r)
        self.assertNotIn('baseline',r)
        self.assertEqual(cur.execute.call_args.args[1],(2,'UID',self.now,self.now))

    def test_initial_authorization_is_not_transferable_to_another_event(self):
        p={'facts':{'uid':'UID'},'snapshot':{'occurred_at':self.now.isoformat()},'debt_evidence':{}}
        r={'decision':'initial_snapshot','authorization':{'event_id':438}}
        with patch('backend.nbki_debt_changes.review_debt_change',return_value=r):
            self.assertEqual(require_debt_change(None,2,p,438),r)
            with self.assertRaisesRegex(ValueError,'только для подтверждённого'):
                require_debt_change(None,2,p,439)

    def test_initial_snapshot_cannot_bypass_financial_check(self):
        cur=Mock();cur.fetchone.side_effect=[None,(438,self.now,{},'Архив недоступен')]
        with self.assertRaisesRegex(ValueError,'не прошёл сверку'):
            review_debt_change(cur,2,'UID',self.now,{'preview':{'status':'blocked'},'debt':{}})

    def test_initial_snapshot_cannot_change_authorized_amounts(self):
        e={'as_of':'2026-11-11','preview':dict(status='candidate_from_crm_components',term_principal='100',term_interest_candidate='1',term_other_candidate='0',overdue_principal='0',overdue_interest='0',overdue_other='0'), 'debt':{'rows':[]}}
        cur=Mock();cur.fetchone.side_effect=[None,(438,self.now,{},'Архив недоступен')]
        with self.assertRaisesRegex(ValueError,'изменились после подтверждения'):
            review_debt_change(cur,2,'UID',self.now,e)

    def test_corrupt_accepted_xml_blocks_comparison(self):
        ev=self.event();raw=ET.tostring(ev)
        cur=Mock();cur.fetchone.return_value=(1,'REG',1,self.now,gzip.compress(raw),'0'*64,ev.tag)
        with self.assertRaisesRegex(ValueError,'Контрольная сумма'):
            review_debt_change(cur,2,'UID',self.now,{})

    def test_guarantor_cannot_be_borrower_baseline(self):
        ev=self.event();ev.find('FL_18_Deal/role').text='2'
        with self.assertRaisesRegex(ValueError,'не к заёмщику'):accepted_state(ev)

    def test_explicit_termination_blocks_new_debt(self):
        cur=Mock();cur.fetchone.return_value=(1,'REG',1,self.now,None,None,'FL_Event_2_5')
        self.assertEqual(review_debt_change(cur,2,'UID',self.now,{})['decision'],'terminated')

    def test_current_state_tracks_missed_dates_and_90_day_boundary(self):
        e={'as_of':'2026-11-11','preview':dict(status='candidate_from_crm_components',term_principal='100',term_interest_candidate='1',term_other_candidate='0',overdue_principal='10',overdue_interest='2',overdue_other='0'),
           'debt':{'rows':[{'due':'2026-08-13','overdue_principal':'10','overdue_interest':'2'}]}}
        state=evidence_state(e)
        self.assertFalse(state['over90'])
        self.assertEqual(state['main_miss_date'],'2026-08-13')
        e['as_of']='2026-11-12'
        self.assertTrue(evidence_state(e)['over90'])


if __name__=='__main__':unittest.main()
