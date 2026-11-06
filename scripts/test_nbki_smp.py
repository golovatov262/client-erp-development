import unittest
import hashlib
import json
from datetime import date
from decimal import Decimal

from backend.nbki_smp import (preview_smp, preview_smp_from_posting_snapshot,
                               remaining_months)


class Cursor:
    def __init__(self, rows, end_date=date(2027, 1, 31)):
        self.rows = rows
        self.end_date = end_date

    def execute(self, query, params):
        self.query = query

    def fetchone(self):
        return self.end_date, 'active'

    def fetchall(self):
        return self.rows


class SmpTest(unittest.TestCase):
    def test_months_follow_cbr_calendar_formula(self):
        self.assertEqual(remaining_months(date(2026, 10, 26), date(2030, 5, 31)), 44)
        self.assertEqual(remaining_months(date(2026, 10, 31), date(2026, 11, 30)), 1)
        self.assertEqual(remaining_months(date(2026, 10, 31), date(2026, 10, 31)), 0)

    def test_schedule_candidate_separates_penalty_scenarios(self):
        rows = [(1, date(2026, 11, 30), Decimal('550'), Decimal('500'),
                 Decimal('50'), Decimal('0'), Decimal('0'), Decimal('0'), Decimal('0')),
                (2, date(2027, 1, 31), Decimal('440'), Decimal('400'),
                 Decimal('40'), Decimal('0'), Decimal('0'), Decimal('0'), Decimal('0'))]
        debt = {'status': 'calculated_from_current_crm', 'term_principal': '900',
                'overdue_principal': '0', 'overdue_interest': '0',
                'penalty_candidate': {'remaining': '10.00'}}
        result = preview_smp(Cursor(rows), 1, date(2026, 10, 26), debt)
        self.assertEqual(result['status'], 'candidate_from_crm_schedule')
        self.assertEqual(result['months_uncapped'], 4)
        self.assertEqual(result['value_without_penalty_uncapped'], 248)
        self.assertEqual(result['value_with_penalty_uncapped'], 250)
        self.assertTrue(result['principal_reconciled'])

    def test_principal_mismatch_blocks_candidate(self):
        rows = [(2, date(2027, 1, 31), Decimal('440'), Decimal('400'),
                 Decimal('40'), Decimal('0'), Decimal('0'), Decimal('0'), Decimal('0'))]
        debt = {'status': 'calculated_from_current_crm', 'term_principal': '900',
                'overdue_principal': '0', 'overdue_interest': '0',
                'penalty_candidate': None}
        result = preview_smp(Cursor(rows), 1, date(2026, 10, 26), debt)
        self.assertEqual(result['status'], 'review')
        self.assertFalse(result['principal_reconciled'])
        self.assertEqual(result['remaining_schedule_principal'], '400.00')
        self.assertEqual(result['expected_term_principal'], '900.00')
        self.assertEqual(result['principal_difference'], '-500.00')

    def test_snapshot_candidate_uses_frozen_schedule(self):
        evidence = {'loan_id': 1, 'payment_id': 2, 'payment_date': '2026-10-26',
                    'after': {'loan': {'end_date': '2027-01-31'},
                              'schedule': [
                                  {'id': 10, 'payment_date': '2026-11-30',
                                   'payment_amount': '550', 'principal_amount': '500',
                                   'interest_amount': '50', 'paid_amount': '0',
                                   'covered_interest_v2': '0', 'covered_principal_v2': '0',
                                   'covered_total_v2': '0', 'status': 'pending'},
                                  {'id': 11, 'payment_date': '2027-01-31',
                                   'payment_amount': '440', 'principal_amount': '400',
                                   'interest_amount': '40', 'paid_amount': '0',
                                   'covered_interest_v2': '0', 'covered_principal_v2': '0',
                                   'covered_total_v2': '0', 'status': 'pending'}]}}
        digest = hashlib.sha256(json.dumps(
            evidence, ensure_ascii=False, sort_keys=True,
            separators=(',', ':')).encode()).hexdigest()
        debt = {'status': 'calculated_from_posting_snapshot',
                'term_principal': '900', 'overdue_principal': '0',
                'overdue_interest': '0',
                'penalty_candidate': {'remaining': '10.00'}}
        result = preview_smp_from_posting_snapshot(
            evidence, digest, 1, 2, date(2026, 10, 26), debt)
        self.assertEqual(result['status'], 'candidate_from_posting_snapshot_schedule')
        self.assertEqual(result['remaining_schedule_payments'], '990.00')
        self.assertEqual(result['value_without_penalty_uncapped'], 248)
        self.assertEqual(result['value_with_penalty_uncapped'], 250)
        self.assertTrue(result['principal_reconciled'])

    def test_snapshot_candidate_rejects_invalid_digest(self):
        result = preview_smp_from_posting_snapshot(
            {'loan_id': 1}, '0' * 64, 1, 2, date(2026, 10, 26), {})
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('Контрольная сумма', result['issues'][0])


if __name__ == '__main__':
    unittest.main()
