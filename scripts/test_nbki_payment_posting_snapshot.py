import hashlib
import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_payment_posting_snapshot import (store_payment_snapshot,
                                                   record_payment_event)


class Cursor:
    def execute(self, query, params):
        self.query = query
        self.params = params


class NbkiPaymentPostingSnapshotTests(unittest.TestCase):
    def test_evidence_is_canonical_and_keeps_decimal(self):
        cur = Cursor()
        before = {'loan': {'balance': Decimal('100.00')}, 'schedule': []}
        after = {'loan': {'balance': Decimal('90.00')}, 'schedule': []}
        digest = store_payment_snapshot(cur, 1, 2, date(2026, 10, 29), before, after)
        self.assertEqual(len(digest), 64)
        self.assertEqual(digest, cur.params[3])
        self.assertEqual(cur.params[4].adapted['before']['loan']['balance'], '100.00')
        self.assertEqual(cur.params[4].adapted['after']['loan']['balance'], '90.00')
        self.assertNotEqual(digest, hashlib.sha256(b'').hexdigest())

    def test_payment_event_uses_crm_loan_and_frozen_evidence(self):
        class EventCursor:
            def __init__(self):
                self.calls = []

            def execute(self, query, params):
                self.calls.append((query, params))

            def fetchone(self):
                return (2,) if len(self.calls) == 1 else (17,)

        cur = EventCursor()
        event_id = record_payment_event(cur, 2649, 87, None, 'a' * 64)
        self.assertEqual(event_id, 17)
        self.assertEqual(cur.calls[0][1], (87,))
        self.assertEqual(cur.calls[1][1], (2, 87, 2649, None, 'a' * 64))
        self.assertIn("'loan_payment'", cur.calls[1][0])


if __name__ == '__main__':
    unittest.main()
