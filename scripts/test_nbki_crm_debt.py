import unittest
import hashlib
import json
from datetime import date
from decimal import Decimal

from backend.nbki_crm_debt import (split_latest_crm_debt,
                                   split_posting_snapshot_debt, estimate_current_interest)


class Cursor:
    def __init__(self, later, rows, replaced=False):
        self.later = later
        self.rows = rows
        self.replaced = replaced
        self.query = ''

    def execute(self, query, params):
        self.query = query

    def fetchone(self):
        if 'approved_loan_schedule_replacements' in self.query:
            return (self.replaced,)
        if 'SUM(penalty_amount)' in self.query:
            return (Decimal('0'), date(2030, 1, 31))
        if 'SUM(penalty_part)' in self.query:
            return (Decimal('0'),)
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

    def test_later_approved_schedule_replacement_blocks_historical_debt(self):
        result = split_latest_crm_debt(Cursor(0, [], replaced=True), 90, 2417,
                                       date(2026, 9, 16), '33351.88')
        self.assertEqual(result['status'], 'review')
        self.assertIsNone(result['overdue_principal'])
        self.assertIsNone(result['penalty_candidate'])
        self.assertIn('График утверждён заново', result['issues'][0])

    def test_unpaid_penalty_is_due_with_final_installment(self):
        class PenaltyCursor(Cursor):
            def fetchone(self):
                if 'SUM(penalty_amount)' in self.query:
                    return (Decimal('305.73'), date(2030, 5, 31))
                if 'SUM(penalty_part)' in self.query:
                    return (Decimal('120.71'),)
                return super().fetchone()

        result = split_latest_crm_debt(PenaltyCursor(0, []), 87, 2649,
                                       date(2026, 10, 26), '321425.56')
        self.assertEqual(result['penalty_candidate']['remaining'], '185.02')
        self.assertEqual(result['penalty_candidate']['due_classification'], 'term_until_final_scheduled_payment')
        self.assertEqual(result['penalty_candidate']['due_at'], '2030-05-31')
        self.assertIsNone(result['total_debt'])

    def test_posting_snapshot_survives_future_schedule_changes(self):
        evidence = {'loan_id': 1, 'payment_id': 2, 'payment_date': '2026-10-01',
                    'after': {'loan': {'balance': '900.00'},
                              'paid_penalty_to_date': '2.00',
                              'schedule': [{'id': 10, 'payment_date': '2026-09-30',
                                            'principal_amount': '100.00', 'interest_amount': '50.00',
                                            'paid_amount': '90.00', 'covered_interest_v2': '10.00',
                                            'covered_principal_v2': '40.00', 'covered_total_v2': '50.00',
                                            'penalty_amount': '7.00', 'status': 'partial'},
                                           {'id': 11, 'payment_date': '2026-11-30',
                                            'principal_amount': '800.00', 'interest_amount': '20.00',
                                            'paid_amount': '0.00', 'covered_interest_v2': '0.00',
                                            'covered_principal_v2': '0.00', 'covered_total_v2': '0.00',
                                            'penalty_amount': '0.00', 'status': 'pending'}]}}
        digest = hashlib.sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                                           separators=(',', ':')).encode()).hexdigest()
        result = split_posting_snapshot_debt(evidence, digest, 1, 2, date(2026, 10, 1))
        self.assertEqual(result['status'], 'calculated_from_posting_snapshot')
        self.assertEqual(result['overdue_principal'], '60.00')
        self.assertEqual(result['overdue_interest'], '0.00')
        self.assertEqual(result['term_principal'], '840.00')
        self.assertEqual(result['penalty_candidate']['remaining'], '5.00')
        self.assertEqual(result['penalty_candidate']['due_at'], '2026-11-30')
        self.assertEqual(split_posting_snapshot_debt(evidence, '0' * 64, 1, 2,
                         date(2026, 10, 1))['status'], 'unavailable')

    def test_actual_period_interest_is_not_future_scheduled_interest(self):
        class InterestCursor:
            def execute(self, query, params):
                self.query = query

            def fetchone(self):
                if 'approved_loan_schedule_replacements' in self.query:
                    return (False,)
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

    def test_interest_preview_refuses_replaced_schedule(self):
        result = estimate_current_interest(Cursor(0, [], replaced=True), 90, 2417,
                                           date(2026, 9, 16), latest_payment=True)
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('новый график', result['issues'][0])


if __name__ == '__main__':
    unittest.main()
