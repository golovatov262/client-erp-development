import unittest
from datetime import date
from decimal import Decimal

from scripts.nbki_calculate_psk import run


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchall(self):
        return self.rows


class CalculatePskManualDecisionsTests(unittest.TestCase):
    def test_override_origination_term_matches_historical_1c(self):
        # Loan 51: current term_months=25 (post-restructuring), but the
        # confirmed origination term is 24 - using it should reproduce the
        # historical 1C figures almost exactly.
        rows = [(51, '48601810000100-000000122052024', Decimal('89392.14'), Decimal('36'),
                 25, date(2024, 5, 22), 'annuity', Decimal('35.113'), Decimal('37288.87'),
                 'source_consistent', None, None,
                 'override_origination_term', 24, 'срок продлён легитимно')]
        cur = FakeCursor(rows)
        report = run(cur, 2)
        row = report['rows'][0]
        self.assertEqual(row['status'], 'cross_checked')
        self.assertIn('срок продлён легитимно', row['note'])

    def test_trust_crm_rate_overrides_review_from_rate_mismatch(self):
        # Loans 44/60/81: historical 1C rate differs from CRM's current rate,
        # but the operator confirmed the CRM rate as authoritative.
        rows = [(44, '100-000003614022024', Decimal('1250000.00'), Decimal('20'),
                 180, date(2024, 2, 14), 'annuity', Decimal('16.845'), Decimal('2296417.06'),
                 'source_consistent', None, None,
                 'trust_crm_rate', None, 'ставка CRM принята как верная')]
        cur = FakeCursor(rows)
        report = run(cur, 2)
        row = report['rows'][0]
        self.assertEqual(row['status'], 'cross_checked')
        self.assertEqual(row['note'], 'ставка CRM принята как верная')

    def test_no_decision_keeps_default_classification(self):
        rows = [(999, 'X', Decimal('100000'), Decimal('20'), 12, date(2026, 1, 1),
                 'annuity', None, None, None, None, None, None, None, None)]
        cur = FakeCursor(rows)
        report = run(cur, 2)
        self.assertEqual(report['rows'][0]['status'], 'review')


if __name__ == '__main__':
    unittest.main()
