import copy
import unittest
from datetime import date,datetime,timedelta
from unittest.mock import Mock,patch
from backend.nbki_reporting_policy import reasons,observation,paired_ids,bind_payment_time
from backend.nbki_lifecycle import ScheduleCursor


class ReportingPolicyTests(unittest.TestCase):
    def setUp(self):
        self.s={'schedule':[{'payment_date':'2026-11-30','status':'pending','payment_amount':'110'}]}
        self.e={'as_of':'2026-11-12','debt':{'rows':[]}}

    def test_daily_interest_change_alone_never_queues(self):
        self.e['interest']={'remaining_interest_candidate':'999'}
        self.assertEqual(reasons(self.s,self.e,{},date(2026,11,1)),[])

    def test_31_day_boundary_and_reset_by_payment(self):
        for days,kind in [(30,[]),(31,['periodic']),(32,['periodic'])]:
            last=date(2026,11,12)-timedelta(days=days)
            self.assertEqual([r[0] for r in reasons(self.s,self.e,{},last)],kind)
        self.assertEqual(reasons(self.s,self.e,{},date(2026,11,12)),[])

    def test_due_day_has_accrual_and_due_event_without_extra_periodic(self):
        self.e['as_of']='2026-11-30'
        result=reasons(self.s,self.e,{},date(2026,9,1))
        self.assertEqual([r[0] for r in result],['due_accrual','payment_due'])

    def test_holiday_schedule_is_not_a_due_trigger(self):
        self.s['schedule'][0]['status']='holiday'
        self.e['as_of']='2026-11-30'
        self.assertEqual(reasons(self.s,self.e,{},date(2026,11,29)),[])

    def test_new_arrears_once_not_every_day_with_old_arrears(self):
        self.e['debt']['rows']=[{'due':'2026-11-11','overdue_principal':'10','overdue_interest':'1'}]
        self.assertEqual(reasons(self.s,self.e,{'overdue_dates':[]},date(2026,11,11))[0][0],'overdue')
        prev=observation(self.e)
        self.e['as_of']='2026-11-13'
        self.assertEqual(reasons(self.s,self.e,prev,date(2026,11,12)),[])

    def test_first_observation_does_not_fabricate_old_arrears(self):
        self.e['debt']['rows']=[{'due':'2026-01-01','overdue_principal':'10','overdue_interest':'1'}]
        self.assertEqual(reasons(self.s,self.e,None,date(2026,11,11)),[])

    def test_over90_transition_only_once(self):
        self.e['debt']['rows']=[{'due':'2026-08-13','overdue_principal':'10','overdue_interest':'1'}]
        self.assertEqual(reasons(self.s,self.e,{'overdue_dates':['2026-08-13'],'over90':False},date(2026,11,11))[0][0],'overdue')
        self.assertEqual(reasons(self.s,self.e,observation(self.e),date(2026,11,11)),[])

    def test_pair_expands_before_payment_and_skips_accepted_part(self):
        c=Mock();c.fetchall.return_value=[(2,1)]
        with patch('backend.nbki_delivery.delivery_state',return_value={'status':'new'}):
            self.assertEqual(paired_ids(c,2,[1]),[2,1])
        with patch('backend.nbki_delivery.delivery_state',side_effect=[{'status':'accepted'},{'status':'new'}]):
            self.assertEqual(paired_ids(c,2,[1]),[1])

    def test_accrual_keeps_today_terms_before_due_event_advances_them(self):
        row=dict(payment_date='2026-11-12',principal_amount='10',interest_amount='1',payment_amount='11',paid_amount='0',status='pending')
        s={'schedule':[row]}
        for include,exists in [(True,True),(False,False)]:
            c=ScheduleCursor(s,include);c.execute('SELECT FROM loan_schedule LIMIT 1',(1,'2026-11-12'))
            self.assertEqual(c.fetchone() is not None,exists)



class PairIntegrityTests(unittest.TestCase):
    def test_invalid_accrual_never_leaks_payment_only_batch(self):
        from backend.nbki_event23_xml import build_event23_batch_xml
        from scripts.test_nbki_event23_batch import individual
        def build(c,o,e,**kw):
            if e==2:raise ValueError('Начисления не проверены')
            return individual(1)
        with patch('backend.nbki_reporting_policy.paired_ids',return_value=[2,1]), \
             patch('backend.nbki_reporting_policy.reporting_pairs',return_value=[(2,1)]), \
             patch('backend.nbki_event23_xml.build_event23_xml',side_effect=build):
            with self.assertRaisesRegex(ValueError,'Нет готовых'):
                build_event23_batch_xml(Mock(),2,[1])

    def test_missed_due_date_never_fabricated_from_today(self):
        s={'schedule':[{'payment_date':'2026-11-11','status':'pending','payment_amount':'100'}]}
        e={'as_of':'2026-11-12','debt':{'rows':[]}}
        with self.assertRaisesRegex(ValueError,'исторический снимок'):
            reasons(s,e,{'as_of':'2026-11-10'},date(2026,11,10))

if __name__=='__main__':unittest.main()
