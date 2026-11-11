import unittest
from datetime import date

from backend.nbki_crm_events import list_crm_events


class EventsCursor:
    def __init__(self, exported_through=None):
        self.queries = []
        self.exported_through = exported_through

    def execute(self, query, params):
        self.queries.append((query, params))

    def fetchone(self):
        return (self.exported_through,) if "SELECT MAX" in self.queries[-1][0] else (0,)

    def fetchall(self):
        return []


class CrmEventsPeriodTests(unittest.TestCase):
    def test_period_filters_by_event_date_in_moscow(self):
        cur = EventsCursor()
        result = list_crm_events(cur, 2, date_from='2026-08-01', date_to='2026-10-31')
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['period'], {'from': '2026-08-01', 'to': '2026-10-31'})
        self.assertEqual(result['debt_scan_issues'], [])
        period_queries = [(q,p) for q,p in cur.queries if "JOIN loans l ON l.id=e.loan_id" in q]
        self.assertEqual(len(period_queries), 2)
        for query, _ in period_queries:
            self.assertIn("e.event_occurred_at AT TIME ZONE 'Europe/Moscow'", query)
            self.assertIn("fe.delivery_status='accepted'", query)
        self.assertEqual(cur.queries[1][1], (2, date(2026, 10, 31), date(2026, 10, 31)))

    def test_default_starts_day_after_uploaded_events(self):
        result = list_crm_events(EventsCursor(date(2026, 11, 10)), 2)
        self.assertEqual(result['period']['from'], '2026-11-11')
        self.assertEqual(result['exported_through'], '2026-11-10')
        self.assertGreaterEqual(result['period']['to'], result['period']['from'])

    def test_rejects_reversed_period(self):
        cur = EventsCursor()
        with self.assertRaisesRegex(ValueError, 'позже'):
            list_crm_events(cur, 2, date_from='2026-11-01', date_to='2026-10-01')
        self.assertFalse(cur.queries)

    def test_rejects_non_iso_period(self):
        with self.assertRaisesRegex(ValueError, 'ГГГГ-ММ-ДД'):
            list_crm_events(EventsCursor(), 2, date_from='01.10.2026')


if __name__ == '__main__':
    unittest.main()
