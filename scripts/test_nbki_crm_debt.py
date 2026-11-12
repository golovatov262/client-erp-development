import unittest
import hashlib
import json
from datetime import date
from decimal import Decimal

from backend.nbki_crm_debt import (split_latest_crm_debt,
                                   split_posting_snapshot_debt, estimate_current_interest)
from backend.nbki_crm_debt import estimate_posting_snapshot_interest


class Cursor:
    def __init__(self, later, rows, replaced=False, penalty_decision=None,
                effective_latest_decision=None, later_touches_relevant_row=True):
        self.later = later
        self.rows = rows
        self.replaced = replaced
        self.penalty_decision = penalty_decision
        self.effective_latest_decision = effective_latest_decision
        self.later_touches_relevant_row = later_touches_relevant_row
        self.query = ''

    def execute(self, query, params):
        self.query = query

    def fetchone(self):
        if 'SELECT end_date,schedule_type,status' in self.query:
            return (date(2030, 1, 31), 'annuity', 'active')
        if 'approved_loan_schedule_replacements' in self.query:
            return (self.replaced,)
        if 'SUM(penalty_amount)' in self.query:
            return (Decimal('0'), date(2030, 1, 31))
        if 'SUM(penalty_part)' in self.query:
            return (Decimal('0'),)
        if 'nbki_penalty_reconciliation_decisions' in self.query:
            return self.penalty_decision
        if 'nbki_effective_latest_payment_decisions' in self.query:
            return (1,) if self.effective_latest_decision else None
        if 'loan_payment_allocations a' in self.query and 'JOIN loan_schedule s' in self.query:
            return (self.later_touches_relevant_row,)
        return (self.later,)

    def fetchall(self):
        return self.rows


class DebtTest(unittest.TestCase):
    def test_paid_late_row_has_no_remaining_overdue(self):
        cur = Cursor(0, [(10, date(2026, 9, 30), Decimal('3540.14'),
                          Decimal('9847.26'), Decimal('13387.40'),
                          Decimal('8159.13'), Decimal('3540.14'),
                          Decimal('11699.27'), 'paid')])
        result = split_latest_crm_debt(cur, 87, 2649, date(2026, 10, 26), '321425.56')
        self.assertEqual(result['overdue_principal'], '0.00')
        self.assertEqual(result['overdue_interest'], '0.00')
        self.assertEqual(result['term_principal'], '321425.56')
        self.assertIsNone(result['interest_debt'])

    def test_partial_due_row_separates_principal_and_interest(self):
        cur = Cursor(0, [(10, date(2026, 9, 30), Decimal('100'), Decimal('50'),
                          Decimal('90'), Decimal('10'), Decimal('40'), Decimal('50'), 'partial')])
        result = split_latest_crm_debt(cur, 1, 2, date(2026, 10, 1), '900')
        self.assertEqual(result['overdue_principal'], '60.00')
        self.assertEqual(result['overdue_interest'], '0.00')
        self.assertEqual(result['term_principal'], '840.00')

    def test_paid_legacy_row_does_not_become_overdue_for_rounding_cents(self):
        cur = Cursor(0, [(11, date(2026, 9, 30), Decimal('0.09'), Decimal('0'),
                          Decimal('0'), Decimal('0'), Decimal('0'), Decimal('0'), 'paid')])
        result = split_latest_crm_debt(cur, 1, 2, date(2026, 10, 1), '100.00')
        self.assertEqual(result['overdue_principal'], '0.00')
        self.assertEqual(result['term_principal'], '100.00')

    def test_later_payment_fails_closed(self):
        result = split_latest_crm_debt(Cursor(1, []), 1, 2, date(2026, 10, 1), '900')
        self.assertEqual(result['status'], 'unavailable')
        self.assertIsNone(result['overdue_principal'])

    def test_authorized_later_payment_proven_irrelevant_is_treated_as_latest(self):
        cur = Cursor(1, [], effective_latest_decision=True, later_touches_relevant_row=False)
        result = split_latest_crm_debt(cur, 63, 2652, date(2026, 10, 27), '900')
        self.assertEqual(result['status'], 'calculated_from_current_crm')
        self.assertEqual(result['overdue_principal'], '0.00')
        self.assertEqual(result['term_principal'], '900.00')

    def test_authorized_later_payment_that_touches_relevant_row_stays_blocked(self):
        cur = Cursor(1, [], effective_latest_decision=True, later_touches_relevant_row=True)
        result = split_latest_crm_debt(cur, 63, 2652, date(2026, 10, 27), '900')
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

    def test_paid_exceeding_assessed_penalty_stays_review_without_decision(self):
        class OverpaidPenaltyCursor(Cursor):
            def fetchone(self):
                if 'SUM(penalty_amount)' in self.query:
                    return (Decimal('209.63'), date(2029, 1, 30))
                if 'SUM(penalty_part)' in self.query:
                    return (Decimal('214.64'),)
                return super().fetchone()

        result = split_latest_crm_debt(OverpaidPenaltyCursor(0, []), 110, 2653,
                                       date(2026, 10, 27), '456128.83')
        self.assertEqual(result['status'], 'review')
        self.assertIsNone(result['penalty_candidate'])

    def test_paid_exceeding_assessed_penalty_accepted_within_confirmed_variance(self):
        class OverpaidPenaltyCursor(Cursor):
            def fetchone(self):
                if 'SUM(penalty_amount)' in self.query:
                    return (Decimal('209.63'), date(2029, 1, 30))
                if 'SUM(penalty_part)' in self.query:
                    return (Decimal('214.64'),)
                return super().fetchone()

        result = split_latest_crm_debt(
            OverpaidPenaltyCursor(0, [], penalty_decision=(Decimal('5.01'), 'известный исторический пробел')),
            110, 2653, date(2026, 10, 27), '456128.83')
        self.assertEqual(result['status'], 'calculated_from_current_crm')
        self.assertEqual(result['penalty_candidate']['remaining'], '0.00')
        self.assertEqual(result['penalty_candidate']['reconciliation_note'], 'известный исторический пробел')

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
                                            'penalty_amount': '0.00', 'status': 'pending'},
                                           {'id': 12, 'payment_date': '2026-09-30',
                                            'principal_amount': '0.09', 'interest_amount': '0.00',
                                            'paid_amount': '0.00', 'covered_interest_v2': '0.00',
                                            'covered_principal_v2': '0.00', 'covered_total_v2': '0.00',
                                            'penalty_amount': '0.00', 'status': 'paid'}]}}
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
                if 'FROM loan_payment_allocations a' in self.query:
                    return (0,)
                if 'FROM loans WHERE' in self.query:
                    return (Decimal('370600'), Decimal('36'), 'annuity', date(2025, 5, 29), 'active', date(2030, 1, 31))
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

    def test_interest_preview_refuses_interest_allocated_to_overdue_row(self):
        class OverdueInterestCursor:
            def execute(self, query, params):
                self.query = query

            def fetchone(self):
                if 'approved_loan_schedule_replacements' in self.query:
                    return (False,)
                if 'FROM loans WHERE' in self.query:
                    return (Decimal('370600'), Decimal('36'), 'annuity', date(2025, 5, 29), 'active', date(2030, 1, 31))
                if 'MAX(payment_date)' in self.query:
                    return (date(2026, 9, 30),)
                if 'FROM loan_schedule s LEFT JOIN loan_payment_allocations a' in self.query:
                    return (143567, Decimal('0'), Decimal('0'), Decimal('1'), Decimal('1'))
                if 'FROM loan_payment_allocations a' in self.query:
                    return (1,)
                raise AssertionError(self.query)

        result = estimate_current_interest(OverdueInterestCursor(), 87, 2649,
                                           date(2026, 10, 26), latest_payment=True)
        self.assertEqual(result['status'], 'review')
        self.assertIsNone(result['remaining_interest_candidate'])

    def test_interest_preview_refuses_overcoverage(self):
        class OvercoverageCursor:
            def execute(self, query, params):
                self.query = query

            def fetchone(self):
                if 'approved_loan_schedule_replacements' in self.query:
                    return (False,)
                if 'FROM loans WHERE' in self.query:
                    return (Decimal('100000'), Decimal('12'), 'annuity', date(2025, 1, 1), 'active', date(2030, 1, 31))
                if 'MAX(payment_date)' in self.query:
                    return (date(2026, 9, 30),)
                if 'FROM loan_payment_allocations a' in self.query:
                    return (0,)
                if 'FROM loan_schedule s LEFT JOIN loan_payment_allocations a' in self.query:
                    return (10, Decimal('5000'), Decimal('0'), Decimal('5001'), Decimal('5001'))
                return (10, Decimal('5000'), Decimal('5000'), Decimal('0'), Decimal('0'))

            def fetchall(self):
                return [(1, date(2026, 10, 1), Decimal('0')),
                        (2, date(2026, 10, 28), Decimal('0'))]

        result = estimate_current_interest(OvercoverageCursor(), 1, 2,
                                           date(2026, 10, 28), latest_payment=True)
        self.assertEqual(result['status'], 'review')
        self.assertIsNone(result['remaining_interest_candidate'])

    def test_interest_preview_refuses_older_payment(self):
        result = estimate_current_interest(Cursor(1, []), 1, 2,
                                           date(2026, 10, 1), latest_payment=False)
        self.assertEqual(result['status'], 'unavailable')

    def test_interest_preview_accepts_authorized_irrelevant_later_payment(self):
        class AuthorizedLaterCursor:
            def execute(self, query, params):
                self.query = query

            def fetchone(self):
                if 'nbki_effective_latest_payment_decisions' in self.query:
                    return (1,)
                if 'JOIN loan_payments p ON p.id=a.payment_id' in self.query:
                    return (False,)
                if 'approved_loan_schedule_replacements' in self.query:
                    return (False,)
                if 'FROM loan_payment_allocations a' in self.query:
                    return (0,)
                if 'FROM loans WHERE' in self.query:
                    return (Decimal('370600'), Decimal('36'), 'annuity', date(2025, 5, 29), 'active', date(2030, 1, 31))
                if 'MAX(payment_date)' in self.query:
                    return (date(2026, 9, 30),)
                return (143567, Decimal('9642.77'), Decimal('0'), Decimal('0'), Decimal('0'))

            def fetchall(self):
                return [(100, date(2026, 9, 30), Decimal('43732.70')),
                        (2649, date(2026, 10, 26), Decimal('5441.74'))]

        # Same fixture as the latest_payment=True case above, reached instead
        # through the authorized-later-payment bypass; the result must match.
        result = estimate_current_interest(AuthorizedLaterCursor(), 87, 2649,
                                           date(2026, 10, 26), latest_payment=False)
        self.assertEqual(result['status'], 'candidate_from_crm_formula')
        self.assertEqual(result['accrued_before_payment'], '8382.13')

    def test_interest_preview_keeps_refusing_when_later_payment_touches_row(self):
        result = estimate_current_interest(Cursor(1, [], effective_latest_decision=True,
                                                   later_touches_relevant_row=True),
                                           1, 2, date(2026, 10, 1), latest_payment=False)
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('Есть более поздние платежи', result['issues'][0])

    def test_interest_preview_refuses_replaced_schedule(self):
        result = estimate_current_interest(Cursor(0, [], replaced=True), 90, 2417,
                                           date(2026, 9, 16), latest_payment=True)
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('новый график', result['issues'][0])

    def test_snapshot_interest_reconstructs_historical_event(self):
        evidence = {'loan_id': 1, 'payment_id': 2, 'payment_date': '2026-10-26',
                    'before': {'loan': {'balance': '1000.00', 'rate': '36'}},
                    'after': {'loan': {'balance': '900.00', 'rate': '36',
                                       'amount': '1100.00', 'start_date': '2026-01-01',
                                       'end_date': '2027-01-31', 'schedule_type': 'annuity',
                                       'status': 'active'},
                              'schedule': [
                                  {'id': 10, 'payment_date': '2026-10-01', 'status': 'paid'},
                                  {'id': 11, 'payment_date': '2026-11-01',
                                   'status': 'pending', 'interest_amount': '50.00',
                                   'paid_amount': '0.00', 'covered_interest_v2': '0.00',
                                   'covered_total_v2': '0.00'}]}}
        digest = hashlib.sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                                           separators=(',', ':')).encode()).hexdigest()

        class SnapshotCursor:
            def execute(self, query, params):
                self.query = query

            def fetchone(self):
                return (Decimal('100.00'),)

            def fetchall(self):
                return [(2, date(2026, 10, 26), Decimal('100'), digest, evidence)]

        result = estimate_posting_snapshot_interest(
            SnapshotCursor(), evidence, digest, 1, 2, date(2026, 10, 26))
        self.assertEqual(result['status'], 'candidate_from_posting_snapshot_formula')
        self.assertEqual(result['period_start'], '2026-10-01')
        self.assertEqual(result['accrued_before_payment'], '24.66')
        self.assertEqual(result['remaining_interest_candidate'], '24.66')

    def test_authorized_payment_reconstructs_missing_intermediate_snapshot(self):
        evidence = {'loan_id': 1, 'payment_id': 6, 'payment_date': '2026-10-20',
                    'before': {'loan': {'balance': '950.00', 'rate': '36'}},
                    'after': {'loan': {'balance': '900.00', 'rate': '36',
                                       'amount': '1100.00', 'start_date': '2026-01-01',
                                       'end_date': '2027-01-31', 'schedule_type': 'annuity',
                                       'status': 'active'},
                              'schedule': [
                                  {'id': 10, 'payment_date': '2026-10-01', 'status': 'paid'},
                                  {'id': 11, 'payment_date': '2026-11-01',
                                   'status': 'pending', 'interest_amount': '50.00',
                                   'paid_amount': '0.00', 'covered_interest_v2': '0.00',
                                   'covered_total_v2': '0.00'}]}}
        digest = hashlib.sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                                           separators=(',', ':')).encode()).hexdigest()

        class ReconstructCursor:
            def execute(self, query, params):
                self.query, self.params = query, params

            def fetchone(self):
                if 'nbki_payment_ledger_reconstruction_decisions' in self.query:
                    return (1,) if self.params[0] == 5 else None
                if 'nbki_loan_terms_versions' in self.query:
                    return (False,)
                if 'SUM(principal_part)' in self.query:
                    return (Decimal('100.00'),)
                raise AssertionError(self.query)

            def fetchall(self):
                return [(5, date(2026, 10, 10), Decimal('50'), None, None),
                        (6, date(2026, 10, 20), Decimal('50'), digest, evidence)]

        result = estimate_posting_snapshot_interest(
            ReconstructCursor(), evidence, digest, 1, 6, date(2026, 10, 20))
        self.assertEqual(result['status'], 'candidate_from_posting_snapshot_formula')
        self.assertEqual(result['accrued_before_payment'], '18.25')
        self.assertEqual(result['remaining_interest_candidate'], '18.25')

    def test_unauthorized_missing_intermediate_snapshot_stays_review(self):
        evidence = {'loan_id': 1, 'payment_id': 6, 'payment_date': '2026-10-20',
                    'before': {'loan': {'balance': '950.00', 'rate': '36'}},
                    'after': {'loan': {'balance': '900.00', 'rate': '36',
                                       'amount': '1100.00', 'start_date': '2026-01-01',
                                       'end_date': '2027-01-31', 'schedule_type': 'annuity',
                                       'status': 'active'},
                              'schedule': [
                                  {'id': 10, 'payment_date': '2026-10-01', 'status': 'paid'},
                                  {'id': 11, 'payment_date': '2026-11-01',
                                   'status': 'pending', 'interest_amount': '50.00',
                                   'paid_amount': '0.00', 'covered_interest_v2': '0.00',
                                   'covered_total_v2': '0.00'}]}}
        digest = hashlib.sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                                           separators=(',', ':')).encode()).hexdigest()

        class NoDecisionCursor:
            def execute(self, query, params):
                self.query, self.params = query, params

            def fetchone(self):
                if 'nbki_payment_ledger_reconstruction_decisions' in self.query:
                    return None
                if 'SUM(principal_part)' in self.query:
                    return (Decimal('100.00'),)
                raise AssertionError(self.query)

            def fetchall(self):
                return [(5, date(2026, 10, 10), Decimal('50'), None, None),
                        (6, date(2026, 10, 20), Decimal('50'), digest, evidence)]

        result = estimate_posting_snapshot_interest(
            NoDecisionCursor(), evidence, digest, 1, 6, date(2026, 10, 20))
        self.assertEqual(result['status'], 'review')
        self.assertIn('нет неизменяемого снимка CRM', result['issues'][0])


if __name__ == '__main__':
    unittest.main()
