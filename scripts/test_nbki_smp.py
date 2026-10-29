import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_smp import preview_smp, remaining_months


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


if __name__ == '__main__':
    unittest.main()
