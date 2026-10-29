import unittest
from datetime import date
from decimal import Decimal

from backend.loan_psk import calculate_psk, classify_psk, initial_cashflows


class LoanPskTests(unittest.TestCase):
    def test_crm_annuity_reconstructs_ruble_cost(self):
        result = calculate_psk(370600, 36, 60, date(2025, 5, 29), 'annuity')
        self.assertEqual(result['amount'], Decimal('432852.90'))
        self.assertEqual(result['percent'], Decimal('35.920'))
        self.assertEqual(result['flow_count'], 60)

    def test_zero_interest_has_zero_psk(self):
        result = calculate_psk(12000, 0, 12, date(2026, 1, 15), 'annuity')
        self.assertEqual(result['amount'], Decimal('0.00'))
        self.assertEqual(result['percent'], Decimal('0.000'))

    def test_end_of_term_has_only_final_principal(self):
        flows = initial_cashflows(10000, 12, 3, date(2026, 1, 15), 'end_of_term')
        self.assertTrue(all(payment == interest for _, payment, interest in flows[:-1]))
        self.assertEqual(flows[-1][1] - flows[-1][2], Decimal('10000.00'))

    def test_mismatch_keeps_review_status(self):
        result = calculate_psk(370600, 36, 60, date(2025, 5, 29), 'annuity')
        self.assertEqual(classify_psk(result, '20', '432852.48', 'source_consistent')[0], 'review')
        self.assertEqual(classify_psk(result, None, None, None)[0], 'review')


if __name__ == '__main__':
    unittest.main()
