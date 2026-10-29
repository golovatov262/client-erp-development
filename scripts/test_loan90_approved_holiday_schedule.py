import importlib.util
import unittest
from decimal import Decimal
from pathlib import Path

from scripts.replace_loan90_approved_holiday_schedule import validate_approved_plan


def load_accrual_module():
    path = Path(__file__).resolve().parents[1] / 'backend' / 'cron-accrue' / 'index.py'
    spec = importlib.util.spec_from_file_location('daily_accrual_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ApprovedHolidayScheduleTests(unittest.TestCase):
    def test_operator_plan_balances(self):
        plan = validate_approved_plan()
        self.assertEqual(plan['opening_principal'], '34613.89')
        self.assertEqual(plan['total_interest'], '9944.75')
        self.assertEqual(plan['total_payments'], '44558.64')
        self.assertEqual(plan['final_interest_amount'], '2624.00')

    def test_penalty_uses_preserved_legacy_payment_split(self):
        module = load_accrual_module()
        remaining = module.remaining_principal_for_penalty(
            Decimal('1930.29'), Decimal('865.35'), Decimal('2000.00'),
            Decimal('1262.01'), Decimal('2000.00'))
        self.assertEqual(remaining, Decimal('668.28'))
        self.assertEqual(module.remaining_principal_for_penalty(
            Decimal('1930.29'), Decimal('865.35'), Decimal('2000.00')),
            Decimal('795.64'))


if __name__ == '__main__':
    unittest.main()
