import copy
import unittest
from unittest.mock import patch
from scripts.repair_nbki_payment_2730 import approved_rows, revised_evidence, digest


class Payment2730RepairTests(unittest.TestCase):
    def fixture(self):
        rows = [dict(id=sid, payment_date=day, payment_amount=total,
                     principal_amount=principal, interest_amount=interest)
                for sid,day,total,principal,interest in [
                    (155790,'2026-11-30','33970.00','32808.26','1161.74'),
                    (155791,'2026-12-31','33970.00','33191.02','778.98'),
                    (155792,'2027-01-30','33970.03','33578.28','391.75')]]
        return {'payment_date':'2026-11-01',
                'before': {'loan':{'balance':'130222.57'}, 'schedule':rows},
                'after': {'loan':{'balance':'95222.57'}, 'schedule':copy.deepcopy(rows)}}

    def test_restores_exact_approved_components_from_original(self):
        original=self.fixture()
        with patch('scripts.repair_nbki_payment_2730.ORIGINAL_SHA',digest(original)):
            rows=approved_rows(original)
        self.assertEqual(rows[155790]['principal_amount'],'32808.26')
        self.assertEqual(rows[155792]['payment_amount'],'33970.03')
        with self.assertRaisesRegex(ValueError,'Original snapshot changed'):
            approved_rows(original)

    def test_revision_preserves_original_and_reconciles_delta(self):
        original=self.fixture(); saved=copy.deepcopy(original)
        corrected={'loan':{'balance':'96772.08','monthly_payment':'33970.00','status':'active'},
                   'schedule':original['before']['schedule'], 'paid_penalty_to_date':'15.46'}
        result=revised_evidence(original,corrected)
        self.assertEqual(original,saved)
        self.assertEqual(result['before'],original['before'])
        self.assertEqual(result['payment_date'],'2026-11-02')
        self.assertEqual(result['after']['paid_penalty_to_date'],'15.46')
        self.assertEqual(result['after']['loan']['balance'],'96772.08')
        corrected['loan']['balance']='1.00'
        with self.assertRaisesRegex(ValueError,'principal delta'):
            revised_evidence(original,corrected)


if __name__ == '__main__':
    unittest.main()
