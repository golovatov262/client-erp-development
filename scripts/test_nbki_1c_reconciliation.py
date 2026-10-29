import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_1c_reconciliation import compare_fact, parse_money


class ReconciliationTests(unittest.TestCase):
    def test_russian_amount(self):
        self.assertEqual(parse_money('35\u00a0000,00'), Decimal('35000.00'))

    def test_same_day_aggregates_partial_crm_payments(self):
        result = compare_fact({'111': {'value': '14.10.2026'},
                               '112': {'value': '14 150,00'}},
                              event_date=date(2026, 10, 14), crm_end_date=None,
                              payments=[(date(2026, 10, 14), Decimal('10000')),
                                        (date(2026, 10, 14), Decimal('4150'))])
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


if __name__ == '__main__':
    unittest.main()
