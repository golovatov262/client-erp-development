"""Contractual PSK import must stay traceable and separate from CRM accounting."""

import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_contract_costs import parse_cost_indicators, sync_cost_facts


def indicators(*, percent='35,899', cost='432 852,48', calculated='29.05.2025', amount='370 600,00'):
    values = (('ФЛ_22.1', percent), ('ФЛ_22.2', cost),
              ('ФЛ_22.3', calculated), ('ФЛ_25.2', amount))
    return {str(index): {'code': code, 'value': value}
            for index, (code, value) in enumerate(values)}


class Cursor:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []
        self.inserted = True

    def execute(self, sql, params):
        self.statements.append((sql, params))

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return (87,) if self.inserted else None


class CostFactsTest(unittest.TestCase):
    def test_consistent_values_from_1c_are_candidates(self):
        result = parse_cost_indicators(indicators(), date(2025, 5, 29), Decimal('370600.00'))
        self.assertEqual(result['psk_percent'], Decimal('35.899'))
        self.assertEqual(result['psk_amount'], Decimal('432852.48'))
        self.assertEqual(result['status'], 'source_consistent')

    def test_mismatch_requires_review(self):
        result = parse_cost_indicators(indicators(), date(2025, 5, 30), Decimal('370600.00'))
        self.assertEqual(result['status'], 'review')
        self.assertFalse(result['date_match'])

    def test_missing_or_invalid_value_is_not_imported(self):
        for values in (indicators(cost=''), indicators(percent='n/a'),
                       indicators(calculated='30.02.2025')):
            with self.subTest(values=values), self.assertRaises(ValueError):
                parse_cost_indicators(values, date(2025, 5, 29), Decimal('370600.00'))

    def test_dry_run_never_inserts(self):
        row = (87, 'uid', 3, 12, 'a' * 64, indicators(),
               date(2025, 5, 29), Decimal('370600.00'))
        cur = Cursor([row])
        report = sync_cost_facts(cur, 2)
        self.assertEqual((report['total'], report['consistent'], report['inserted']), (1, 1, 0))
        self.assertEqual(len(cur.statements), 1)

    def test_apply_inserts_once_without_updating_existing(self):
        row = (87, 'uid', 3, 12, 'a' * 64, indicators(),
               date(2025, 5, 29), Decimal('370600.00'))
        cur = Cursor([row])
        report = sync_cost_facts(cur, 2, apply=True)
        self.assertEqual(report['inserted'], 1)
        self.assertIn('ON CONFLICT (loan_id) DO NOTHING', cur.statements[1][0])


if __name__ == '__main__':
    unittest.main()
