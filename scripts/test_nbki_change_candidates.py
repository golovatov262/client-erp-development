"""Regression tests for CRM snapshot change detection (no NBKI event inference)."""

import copy
import unittest

from backend.nbki_outbox import event_hints, source_readiness, summarize_changes


class ChangeSummaryTests(unittest.TestCase):
    def setUp(self):
        self.before = {
            'loan': {'id': 7, 'balance': '1000', 'updated_at': '2026-10-01'},
            'member': {'member_id': 4, 'last_name': 'Иванов',
                       'member_updated_at': '2026-10-01'},
            'uid': 'uid-1',
            'payments': [{'id': 10, 'amount': '100'}],
            'schedule': [{'id': 20, 'status': 'planned'}],
            'collateral': [{'id': 30, 'description': 'Залог',
                            'updated_at': '2026-10-01'}],
        }

    def test_equal_snapshots_have_no_changes(self):
        self.assertEqual(summarize_changes(self.before, copy.deepcopy(self.before)), {})

    def test_timestamp_only_changes_are_ignored(self):
        after = copy.deepcopy(self.before)
        after['loan']['updated_at'] = '2026-10-02'
        after['member']['member_updated_at'] = '2026-10-02'
        after['collateral'][0]['updated_at'] = '2026-10-02'
        self.assertEqual(summarize_changes(self.before, after), {})

    def test_newly_tracked_snapshot_field_is_not_a_business_change(self):
        after = copy.deepcopy(self.before)
        after['loan']['monthly_payment'] = '250'
        self.assertEqual(summarize_changes(self.before, after), {})

    def test_payment_and_balance_changes_are_reported(self):
        after = copy.deepcopy(self.before)
        after['loan']['balance'] = '900'
        after['payments'].append({'id': 11, 'amount': '100'})
        self.assertEqual(summarize_changes(self.before, after), {
            'loan_fields': ['balance'],
            'payments': {'added_ids': ['11'], 'removed_ids': [], 'changed_ids': []},
        })

    def test_modified_and_removed_rows_are_reported(self):
        after = copy.deepcopy(self.before)
        after['schedule'][0]['status'] = 'paid'
        after['collateral'] = []
        self.assertEqual(summarize_changes(self.before, after), {
            'schedule': {'added_ids': [], 'removed_ids': [], 'changed_ids': ['20']},
            'collateral': {'added_ids': [], 'removed_ids': ['30'], 'changed_ids': []},
        })

    def test_hints_do_not_assign_regulatory_codes(self):
        hints = event_hints({'payments': {'added_ids': ['11']},
                             'loan_fields': ['balance']})
        self.assertEqual([hint['category'] for hint in hints], ['payment', 'loan_terms'])
        self.assertTrue(all(hint['gutdf_event_code'] is None for hint in hints))

    def test_readiness_never_claims_xml_ready(self):
        snapshot = copy.deepcopy(self.before)
        snapshot['uid'] = None
        readiness = source_readiness(snapshot, ['Нет УИД'], {'payments': True})
        self.assertFalse(readiness['xml_ready'])
        self.assertIn('Подтверждённый УИД договора', readiness['missing_fields'])
        self.assertEqual(readiness['event_hints'][0]['category'], 'payment')


if __name__ == '__main__':
    unittest.main()
