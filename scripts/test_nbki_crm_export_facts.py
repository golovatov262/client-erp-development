import unittest
from datetime import datetime, timezone

from backend.nbki_crm_export_facts import _loan_terms_for_event


class TermsCursor:
    def __init__(self, version=None, current=None):
        self.version = version
        self.current = current
        self.query = ''

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchone(self):
        if 'nbki_loan_terms_versions' in self.query:
            return self.version
        return self.current


class CrmEventTermsTests(unittest.TestCase):
    def test_uses_dated_crm_version_when_present(self):
        version = ('3', '2', '15', 365, '22.5', datetime(2026, 1, 1, tzinfo=timezone.utc), 'dated CRM')
        cur = TermsCursor(version=version, current=('9', '9', '99'))
        result = _loan_terms_for_event(cur, 2, 42, datetime(2026, 10, 29, tzinfo=timezone.utc))
        self.assertEqual(result, version)
        self.assertEqual(cur.params, (42, datetime(2026, 10, 29, tzinfo=timezone.utc),
                                      datetime(2026, 10, 29, tzinfo=timezone.utc)))

    def test_falls_back_to_shared_current_crm_card_when_no_dated_version(self):
        cur = TermsCursor(current=('21', '2', '17'))
        result = _loan_terms_for_event(cur, 2, 42, datetime(2026, 10, 29, tzinfo=timezone.utc))
        self.assertEqual(result, ('21', '2', '17', 365, None, None,
                                  'current shared CRM BKI card; no dated version'))
        self.assertIn('loan_bki_fields', cur.query)
        self.assertEqual(cur.params, (2, 42))

    def test_uses_current_crm_card_when_event_time_missing(self):
        cur = TermsCursor(current=('21', '2', '17'))
        result = _loan_terms_for_event(cur, 2, 42, None)
        self.assertEqual(result[:3], ('21', '2', '17'))
        self.assertIn('loan_bki_fields', cur.query)

    def test_returns_none_when_crm_has_no_codes(self):
        cur = TermsCursor()
        self.assertIsNone(_loan_terms_for_event(cur, 2, 42, None))


if __name__ == '__main__':
    unittest.main()
