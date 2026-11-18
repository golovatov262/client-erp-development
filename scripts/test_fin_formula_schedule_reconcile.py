import unittest
from datetime import date
from decimal import Decimal as D
from scripts.reconcile_fin_formula_loan106 import future_plan,allocate_legacy


class ScheduleReconciliationTests(unittest.TestCase):
    def test_fixed_installment_preserves_principal_and_final_date(self):
        dates=[date(2027,1,31),date(2027,2,28),date(2027,3,28)]
        rows=future_plan(D('1000'),D('12'),D('340'),dates)
        self.assertEqual(sum(r['principal_amount'] for r in rows),D('1000'))
        self.assertEqual(rows[-1]['balance_after'],0)
        self.assertEqual([r['payment_date'] for r in rows],[str(d) for d in dates])
        self.assertEqual([r['payment_amount'] for r in rows[:2]],[D('340'),D('340')])
        self.assertEqual(rows[-1]['payment_amount'],D('340.07'))

    def test_fifo_keeps_each_receipt_and_component_without_fake_payments(self):
        payments=[(1,date(2026,1,1),D('130'),D('100'),D('25'),D('5'),'legacy'),
                  (2,date(2026,2,1),D('80'),D('70'),D('10'),D('0'),'legacy')]
        rows=[{'id':10,'principal_amount':D('120'),'interest_amount':D('20')},
              {'id':11,'principal_amount':D('100'),'interest_amount':D('30')}]
        allocations=allocate_legacy(payments,rows)
        for p in payments:
            for component,pos in [('principal',3),('interest',4),('penalty',5)]:
                self.assertEqual(sum(a[3] for a in allocations if a[0]==p[0] and a[2]==component),p[pos])
        self.assertIn((1,11,'interest',D('5')),allocations)
        self.assertIn((2,10,'principal',D('20')),allocations)
        self.assertIn((2,11,'principal',D('50')),allocations)

    def test_unallocatable_receipt_is_not_silently_discarded(self):
        with self.assertRaises(ValueError):
            allocate_legacy([(1,date(2026,1,1),D('200'),D('200'),D(0),D(0),'legacy')],
                            [{'id':10,'principal_amount':D(100),'interest_amount':D(20)}])

    def test_insufficient_monthly_payment_fails(self):
        with self.assertRaises(ValueError):
            future_plan(D('1000'),D('24'),D('10'),[date(2026,1,31),date(2026,2,28)])

if __name__=='__main__':unittest.main()
