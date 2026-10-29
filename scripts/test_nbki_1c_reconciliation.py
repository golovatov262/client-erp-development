import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_1c_reconciliation import apply_crm_decision, compare_fact, parse_money
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


if __name__ == '__main__':
    unittest.main()
