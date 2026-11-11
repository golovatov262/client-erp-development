import copy
import unittest
from unittest.mock import patch
from scripts.repair_nbki_snapshot_2748 import corrected_evidence, digest


class SnapshotCorrectionTests(unittest.TestCase):
    def fixture(self):
        original = {'before': {'loan': {'balance': '2010400.09'}},
                    'after': {'loan': {'balance': '1983966.78'}, 'schedule': [
                        {'id': 1, 'covered_interest_v2': '11576.69',
                         'covered_principal_v2': '2662.15', 'covered_total_v2': '14238.84'}]}}
        before = {'allocations': [
            {'schedule_id': 1, 'component': 'interest', 'amount': '11566.69'},
            {'schedule_id': 1, 'component': 'principal', 'amount': '2662.15'}]}
        after = {'payment': [{'id': 2748, 'loan_id': 60, 'payment_date': '2026-11-10',
                            'principal_part': '2818.00', 'interest_part': '35182.00', 'penalty_part': '0'}],
                 'loan': [{'balance': '2007582.09'}], 'schedule': [{'id': 1}],
                 'allocations': [
                     {'schedule_id': 1, 'component': 'interest', 'amount': '35182.00'},
                     {'schedule_id': 1, 'component': 'principal', 'amount': '2662.15'}]}
        return original, {'before_state': before, 'after_state': after, 'corrected_at': '2026-11-11'}

    def test_preserves_original_and_prior_coverage(self):
        original, audit = self.fixture(); saved = copy.deepcopy(original)
        with patch('scripts.repair_nbki_snapshot_2748.ORIGINAL_SHA', digest(original)):
            corrected = corrected_evidence(original, audit)
        self.assertEqual(original, saved)
        self.assertEqual(corrected['before'], original['before'])
        self.assertEqual(corrected['after']['loan']['balance'], '2007582.09')
        self.assertEqual(corrected['after']['schedule'][0]['covered_interest_v2'], '35192.00')
        self.assertEqual(corrected['after']['schedule'][0]['covered_total_v2'], '37854.15')
        self.assertIn('correction', corrected)

    def test_refuses_changed_original_and_unreconciled_balance(self):
        original, audit = self.fixture()
        with self.assertRaisesRegex(ValueError, 'Original snapshot changed'):
            corrected_evidence(original, audit)
        audit['after_state']['loan'][0]['balance'] = '1.00'
        with patch('scripts.repair_nbki_snapshot_2748.ORIGINAL_SHA', digest(original)):
            with self.assertRaisesRegex(ValueError, 'Principal delta'):
                corrected_evidence(original, audit)


if __name__ == '__main__':
    unittest.main()
