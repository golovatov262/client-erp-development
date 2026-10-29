import hashlib
import unittest
from datetime import date
from decimal import Decimal

from backend.nbki_payment_posting_snapshot import store_payment_snapshot


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


if __name__ == '__main__':
    unittest.main()
