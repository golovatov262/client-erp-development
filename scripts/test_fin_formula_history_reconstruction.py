import copy
import unittest
from datetime import date
from decimal import Decimal as D
from scripts.reconstruct_fin_formula_nbki_history import rewind_state


class HistoricalReconstructionTests(unittest.TestCase):
    def setUp(self):
        self.day=date(2026,10,5)
        self.payments=[(1,self.day,D(110),D(100),D(10),D(0),'v2'),
                       (2,date(2026,11,5),D(110),D(100),D(10),D(0),'v2')]
        self.state={'loan_id':3,'loan':{'amount':D(1000),'balance':D(800)},
          'paid_penalty_to_date':D(0),'schedule':[{'id':10,'status':'paid','paid_date':'2026-11-05',
          'penalty_amount':D(0),'paid_amount':D(220),'covered_total_v2':D(220),
          'covered_interest_v2':D(20),'covered_principal_v2':D(200)}]}
        self.alloc={1:[(1,10,'principal',D(100),'normal',3),(2,10,'interest',D(10),'normal',3)],
                    2:[(3,10,'principal',D(100),'normal',3),(4,10,'interest',D(10),'normal',3)]}

    def test_reverses_only_later_allocations_without_changing_source(self):
        saved=copy.deepcopy(self.state)
        after=rewind_state(self.state,self.payments,self.alloc,(self.day,1))
        before=rewind_state(self.state,self.payments,self.alloc,(self.day,1),False)
        self.assertEqual(after['loan']['balance'],D(900))
        self.assertEqual(after['schedule'][0]['paid_amount'],D(110))
        self.assertEqual(after['schedule'][0]['status'],'partial')
        self.assertEqual(before['loan']['balance'],D(1000))
        self.assertEqual(before['schedule'][0]['paid_amount'],D(0))
        self.assertEqual(self.state,saved)

    def test_missing_allocations_cannot_be_guessed(self):
        self.alloc[2]=[]
        with self.assertRaisesRegex(ValueError,'Распределения последующего'):
            rewind_state(self.state,self.payments,self.alloc,(self.day,1))

    def test_unknown_penalty_dates_are_not_backdated(self):
        self.state['schedule'][0]['penalty_amount']=D(100)
        with self.assertRaisesRegex(ValueError,'даты начислений'):
            rewind_state(self.state,self.payments,self.alloc,(self.day,1))

    def test_confirmed_penalty_date_allows_only_events_on_or_after_it(self):
        self.state['schedule'][0]['penalty_amount']=D(100)
        result=rewind_state(self.state,self.payments,self.alloc,(self.day,1),penalty_accrued_on=date(2026,10,1))
        self.assertEqual(result['schedule'][0]['penalty_amount'],D(100))
        with self.assertRaisesRegex(ValueError,'даты начислений'):
            rewind_state(self.state,self.payments,self.alloc,(self.day,1),penalty_accrued_on=date(2026,10,6))

    def test_unscheduled_interest_is_projected_only_when_already_paid(self):
        self.alloc[2][1]=(4,None,'interest',D(10),'normal',None)
        self.state['schedule'][0]['paid_amount']=D(210)
        self.state['schedule'][0]['covered_total_v2']=D(210)
        self.state['schedule'][0]['covered_interest_v2']=D(10)
        self.state['schedule'][0].update(payment_date='2026-11-30',interest_amount=D(10),payment_amount=D(210))
        before=rewind_state(self.state,self.payments,self.alloc,(self.day,1),allow_rowless_interest=True)
        after=rewind_state(self.state,self.payments,self.alloc,(date(2026,11,5),2),allow_rowless_interest=True)
        self.assertEqual(before['schedule'][0]['paid_amount'],D(110))
        self.assertEqual(after['schedule'][0]['interest_amount'],D(20))
        self.assertEqual(after['schedule'][0]['paid_amount'],D(220))

    def test_current_ledger_discrepancy_is_preserved(self):
        self.state['loan']['balance']=D(799)
        with self.assertRaisesRegex(ValueError,'остаток карточки'):
            rewind_state(self.state,self.payments,self.alloc,(self.day,1))

if __name__=='__main__':unittest.main()
