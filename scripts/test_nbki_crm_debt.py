import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_crm_debt import split_latest_crm_debt, estimate_current_interest


class Cursor:
    def __init__(self, later, rows):
        self.later = later
        self.rows = rows
        self.query = ''

    def execute(self, query, params):
        self.query = query

    def fetchone(self):
        return (self.later,)

    def fetchall(self):
        return self.rows


class DebtTest(unittest.TestCase):
    def test_paid_late_row_has_no_remaining_overdue(self):
        cur = Cursor(0, [(10, date(2026, 9, 30), Decimal('3540.14'),
                          Decimal('9847.26'), Decimal('13387.40'),
                          Decimal('8159.13'), Decimal('3540.14'),
                          Decimal('11699.27'))])
        result = split_latest_crm_debt(cur, 87, 2649, date(2026, 10, 26), '321425.56')
        self.assertEqual(result['overdue_principal'], '0.00')
        self.assertEqual(result['overdue_interest'], '0.00')
        self.assertEqual(result['term_principal'], '321425.56')
        self.assertIsNone(result['interest_debt'])

    def test_partial_due_row_separates_principal_and_interest(self):
        cur = Cursor(0, [(10, date(2026, 9, 30), Decimal('100'), Decimal('50'),
                          Decimal('90'), Decimal('10'), Decimal('40'), Decimal('50'))])
        result = split_latest_crm_debt(cur, 1, 2, date(2026, 10, 1), '900')
        self.assertEqual(result['overdue_principal'], '60.00')
        self.assertEqual(result['overdue_interest'], '0.00')
        self.assertEqual(result['term_principal'], '840.00')

    def test_later_payment_fails_closed(self):
        result = split_latest_crm_debt(Cursor(1, []), 1, 2, date(2026, 10, 1), '900')
        self.assertEqual(result['status'], 'unavailable')
        self.assertIsNone(result['overdue_principal'])

    def test_actual_period_interest_is_not_future_scheduled_interest(self):
        class InterestCursor:
            def execute(self, query, params):
                self.query = query

            def fetchone(self):
                if 'FROM loans WHERE' in self.query:
                    return (Decimal('370600'), Decimal('36'), 'annuity', date(2025, 5, 29), 'active')
                if 'MAX(payment_date)' in self.query:
                    return (date(2026, 9, 30),)
                return (143567, Decimal('9642.77'), Decimal('0'), Decimal('0'), Decimal('0'))

            def fetchall(self):
                return [(100, date(2026, 9, 30), Decimal('43732.70')),
                        (2649, date(2026, 10, 26), Decimal('5441.74'))]

        result = estimate_current_interest(InterestCursor(), 87, 2649,
                                           date(2026, 10, 26), latest_payment=True)
        self.assertEqual(result['status'], 'candidate_from_crm_formula')
        self.assertEqual(result['accrued_before_payment'], '8382.13')
        self.assertEqual(result['remaining_interest_candidate'], '8382.13')

    def test_interest_preview_refuses_older_payment(self):
        result = estimate_current_interest(Cursor(1, []), 1, 2,
                                           date(2026, 10, 1), latest_payment=False)
        self.assertEqual(result['status'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
