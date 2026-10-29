import importlib.util
from datetime import date
from decimal import Decimal
from pathlib import Path
import unittest


path = Path(__file__).resolve().parents[1] / 'backend' / 'cron-accrue' / 'index.py'
spec = importlib.util.spec_from_file_location('daily_loan_cron_for_test', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StubCursor:
    def __init__(self):
        self.statements = []

    def execute(self, query, params=None):
        self.statements.append((query, params))

    def fetchall(self):
        return [(138297, 90, Decimal('1930.29'), Decimal('865.35'),
                 Decimal('2000.00'), Decimal('75.17'), date(2026, 7, 30),
                 Decimal('1262.01'), Decimal('2000.00'))]


class DailyLedgerTest(unittest.TestCase):
    def test_exact_allocations_are_written_before_schedule_total(self):
        cur = StubCursor()
        result = module.accrue_penalties(cur, date(2026, 10, 30))
        self.assertEqual(result['schedules_penalized'], 1)
        self.assertEqual(result['total_daily_penalty'], 0.37)
        self.assertEqual(len(cur.statements), 3)
        insert, params = cur.statements[1]
        self.assertIn('INSERT INTO loan_penalty_daily_accruals', insert)
        self.assertEqual(params, (90, 138297, date(2026, 10, 30),
                                  date(2026, 7, 30), Decimal('668.28'),
                                  Decimal('0.000547'), Decimal('0.37'),
                                  Decimal('75.17'), Decimal('75.54')))
        update, update_params = cur.statements[2]
        self.assertIn('UPDATE loan_schedule SET penalty_amount', update)
        self.assertEqual(update_params, (Decimal('75.54'), 138297))


if __name__ == '__main__':
    unittest.main()
