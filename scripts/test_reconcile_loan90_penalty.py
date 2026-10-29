from datetime import date
from decimal import Decimal
import unittest

from reconcile_loan90_penalty import daily_penalty


class PenaltyReconciliationTest(unittest.TestCase):
    def test_approved_schedule_with_exact_crm_payment_allocation(self):
        cutoff = date(2026, 10, 29)
        first, first_days = daily_penalty(
            Decimal('1930.29'), date(2026, 7, 30),
            [(date(2026, 9, 16), Decimal('1262.01'))], cutoff)
        second, second_days = daily_penalty(
            Decimal('1978.55'), date(2026, 8, 31), [], cutoff)
        third, third_days = daily_penalty(
            Decimal('2028.01'), date(2026, 9, 30), [], cutoff)
        self.assertEqual((first, first_days), (Decimal('66.79'), 91))
        self.assertEqual((second, second_days), (Decimal('63.72'), 59))
        self.assertEqual((third, third_days), (Decimal('32.19'), 29))
        self.assertEqual(first + second + third, Decimal('162.70'))


    def test_payment_reduces_principal_after_payment_date(self):
        first, _ = daily_penalty(
            Decimal('1930.29'), date(2026, 7, 30),
            [(date(2026, 9, 16), Decimal('1262.01'))], date(2026, 9, 16))
        second, _ = daily_penalty(
            Decimal('1930.29'), date(2026, 7, 30),
            [(date(2026, 9, 16), Decimal('1262.01'))], date(2026, 9, 17))
        self.assertEqual(second - first, Decimal('0.37'))


if __name__ == '__main__':
    unittest.main()
