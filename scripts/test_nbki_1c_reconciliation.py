import unittest
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from backend.nbki_1c_reconciliation import apply_crm_decision, apply_global_crm_policy, compare_fact, parse_money
from backend.nbki_payment_candidates import list_payment_candidates
from backend.nbki_accounting_snapshot import audit_payment_allocations, build_accounting_snapshot
from scripts.record_nbki_crm_payment_decisions import validate_targets


class ReconciliationTests(unittest.TestCase):
    def test_russian_amount(self):
        self.assertEqual(parse_money('35\u00a0000,00'), Decimal('35000.00'))

    def test_same_day_aggregates_partial_crm_payments(self):
        result = compare_fact({'111': {'value': '14.10.2026'},
                               '112': {'value': '14 150,00'}},
                              event_date=date(2026, 10, 14), crm_end_date=None,
                              payments=[(1, date(2026, 10, 14), Decimal('10000')),
                                        (2, date(2026, 10, 14), Decimal('4150'))])
        self.assertEqual(result[0]['status'], 'same')

    def test_missing_payment_is_review_signal(self):
        result = compare_fact({'111': {'value': '19.10.2026'},
                               '112': {'value': '29 425,00'}},
                              event_date=date(2026, 10, 19), crm_end_date=None,
                              payments=[])
        self.assertEqual(result[0]['status'], 'missing_in_crm')

    def test_future_payment_not_compared_with_old_event(self):
        result = compare_fact({'111': {'value': '30.10.2026'},
                               '112': {'value': '100,00'}},
                              event_date=date(2026, 10, 29), crm_end_date=None,
                              payments=[])
        self.assertEqual(result, [])

    def test_end_date_difference_is_context_not_payment_issue(self):
        result = compare_fact({'22': {'value': '26.01.2027'}},
                              event_date=date(2026, 10, 1),
                              crm_end_date=date(2027, 1, 30), payments=[])
        self.assertEqual(result[0]['status'], 'different_definition')

    def test_one_day_shift_is_candidate_not_confirmed_match(self):
        result = compare_fact({'111': {'value': '01.10.2026'},
                               '112': {'value': '4 900,00'}},
                              event_date=date(2026, 10, 1), crm_end_date=None,
                              payments=[(2493, date(2026, 9, 30), Decimal('4900'))])
        self.assertEqual(result[0]['status'], 'date_shift_candidate')
        self.assertEqual(result[0]['candidate_payments'][0]['id'], 2493)

    def test_adjacent_payments_candidate(self):
        result = compare_fact({'111': {'value': '23.10.2026'},
                               '112': {'value': '35 600,00'}},
                              event_date=date(2026, 10, 23), crm_end_date=None,
                              payments=[(2638, date(2026, 10, 22), Decimal('15600')),
                                        (2639, date(2026, 10, 23), Decimal('20000'))])
        self.assertEqual(result[0]['status'], 'adjacent_sum_candidate')
        self.assertEqual([p['id'] for p in result[0]['candidate_payments']], [2638, 2639])

    def test_ambiguous_nearby_matches_stay_unresolved(self):
        result = compare_fact({'111': {'value': '01.10.2026'},
                               '112': {'value': '4 900,00'}},
                              event_date=date(2026, 10, 1), crm_end_date=None,
                              payments=[(1, date(2026, 9, 29), Decimal('4900')),
                                        (2, date(2026, 9, 30), Decimal('4900'))])
        self.assertEqual(result[0]['status'], 'missing_in_crm')

    def test_operator_decision_applies_only_to_same_candidate_ids(self):
        checks = [{'field': 'last_payment', 'status': 'date_shift_candidate',
                   'candidate_payments': [{'id': 2493, 'date': '2026-09-30',
                                           'amount': '4900.00'}]}]
        apply_crm_decision(checks, [999], 'operator')
        self.assertEqual(checks[0]['status'], 'date_shift_candidate')
        apply_crm_decision(checks, [2493], 'operator')
        self.assertEqual(checks[0]['status'], 'resolved_crm')
        self.assertEqual(checks[0]['effective_crm_payments'][0]['date'], '2026-09-30')

    def test_seed_rejects_missing_or_changed_targets(self):
        with self.assertRaises(ValueError):
            validate_targets({'rows': []})

    def test_global_policy_uses_crm_even_when_1c_amount_differs(self):
        checks = compare_fact({'111': {'value': '13.10.2026'},
                               '112': {'value': '11 700,03'}},
                              event_date=date(2026, 10, 13), crm_end_date=None,
                              payments=[(2556, date(2026, 10, 13), Decimal('13500'))])
        apply_global_crm_policy(checks)
        self.assertEqual(checks[0]['status'], 'resolved_crm')
        self.assertEqual(checks[0]['original_status'], 'review')
        self.assertEqual(checks[0]['effective_crm_payments'][0]['amount'], '13500')

    def test_global_policy_does_not_invent_missing_crm_payment(self):
        checks = compare_fact({'111': {'value': '13.10.2026'},
                               '112': {'value': '11 700,03'}},
                              event_date=date(2026, 10, 13), crm_end_date=None,
                              payments=[])
        apply_global_crm_policy(checks)
        self.assertEqual(checks[0]['status'], 'missing_in_crm')
        self.assertEqual(checks[0]['effective_source'], 'crm')

    def test_payment_queue_keeps_code_unassigned(self):
        class Cursor:
            def execute(self, query, params):
                self.query, self.params = query, params

            def fetchall(self):
                if 'FROM loan_schedule s LEFT JOIN loan_payment_allocations a' in self.query:
                    return []
                if 'WHERE loan_id=%s ORDER BY payment_date,id' in self.query:
                    return [(2656, date(2026, 10, 28), Decimal('28888.97'),
                             Decimal('1000'), Decimal('27888.97'), Decimal('0'), 'v2')]
                if 'loan_payment_allocations a' in self.query:
                    return [(1, None, 'interest', Decimal('27888.97'), 'automatic', None),
                            (2, None, 'early_principal', Decimal('1000'), 'automatic', None)]
                return [(17, '123', 'uid', datetime(2026, 9, 30, 12), 2, 3,
                         2656, date(2026, 10, 28), Decimal('28888.97'),
                         Decimal('1000'), Decimal('27888.97'), Decimal('0'),
                         'early_partial', 'bank', None, None, None, None, None,
                         Decimal('19.487'), Decimal('1966676.01'), date(2022, 4, 4),
                         'source_consistent')]

            def fetchone(self):
                return (0,)

        cur = Cursor()
        with patch('backend.nbki_payment_candidates.inspect_loan', return_value={
                'uid': 'uid', 'checks': {'crm_issues': []},
                'readiness': {'missing_fields': ['Код события']},
                'snapshot': {'loan': {'amount': Decimal('1500'),
                                      'balance': Decimal('500')}}}):
            result = list_payment_candidates(cur, 2)
        self.assertEqual(result['total'], 1)
        self.assertIsNone(result['rows'][0]['gutdf_event_code'])
        self.assertEqual(result['rows'][0]['event_code_candidate'], '2.3')
        self.assertFalse(result['rows'][0]['event_code_confirmed'])
        self.assertIsNone(result['rows'][0]['event_occurred_at_msk'])
        self.assertIsNone(result['rows'][0]['posting_snapshot_sha256'])
        self.assertEqual(result['rows'][0]['event23_readiness']['xsd_version'], '5.1')
        self.assertFalse(result['rows'][0]['event23_readiness']['xml_ready'])
        self.assertIsNone(result['rows'][0]['event23_readiness']['debt_evidence']['total_debt'])
        self.assertFalse(result['rows'][0]['xml_ready'])
        self.assertEqual(result['rows'][0]['psk_candidate']['status'], 'source_consistent')
        self.assertIn('подписанным договором', next(block['note'] for block in
                      result['rows'][0]['event23_readiness']['blocks']
                      if block['name'] == 'FL_22_TotalCost'))
        self.assertEqual(result['rows'][0]['missing_fields'], ['Код события'])
        self.assertEqual(result['rows'][0]['accounting_snapshot']['status'], 'checked')
        self.assertEqual(result['rows'][0]['accounting_snapshot']['cumulative_crm_payments']['amount'], '28888.97')
        self.assertEqual(result['rows'][0]['allocation_audit']['status'], 'checked')

    def test_principal_snapshot_checks_payment_parts(self):
        payments = [(1, date(2026, 9, 1), Decimal('100'), Decimal('40'),
                     Decimal('60'), Decimal('0')),
                    (2, date(2026, 10, 1), Decimal('200'), Decimal('100'),
                     Decimal('90'), Decimal('0'))]
        result = build_accounting_snapshot(Decimal('1000'), Decimal('860'), payments, 2)
        self.assertEqual(result['principal_before'], '960')
        self.assertEqual(result['principal_after'], '860')
        self.assertEqual(result['status'], 'review')
        self.assertEqual(result['cumulative_crm_payments']['amount'], '300')
        self.assertIn('Сумма частей платежа', result['issues'][0])

    def test_v2_allocation_audit_detects_unapplied(self):
        payment = (1, date(2026, 10, 28), Decimal('100'), Decimal('60'),
                   Decimal('30'), Decimal('0'), 'v2')
        allocations = [(10, None, 'interest', Decimal('30'), 'automatic', None),
                       (11, None, 'early_principal', Decimal('60'), 'automatic', None),
                       (12, None, 'unapplied', Decimal('10'), 'automatic', None)]
        result = audit_payment_allocations(payment, allocations, 17)
        self.assertEqual(result['status'], 'review')
        self.assertTrue(any('нераспределённая' in item for item in result['issues']))


if __name__ == '__main__':
    unittest.main()
