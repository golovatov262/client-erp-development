import unittest
from datetime import date

from backend.nbki_crm_events import list_crm_events


class EventsCursor:
    def __init__(self):
        self.queries = []

    def execute(self, query, params):
        self.queries.append((query, params))

    def fetchone(self):
        return (0,)

    def fetchall(self):
        return []


class CrmEventsPeriodTests(unittest.TestCase):
    def test_period_filters_by_event_date_in_moscow(self):
        cur = EventsCursor()
        result = list_crm_events(cur, 2, date_from='2026-08-01', date_to='2026-10-31')
        self.assertEqual(result, {'total': 0, 'rows': []})
        self.assertEqual(len(cur.queries), 2)
        for query, _ in cur.queries:
            self.assertIn("e.event_occurred_at AT TIME ZONE 'Europe/Moscow'", query)
        self.assertEqual(cur.queries[0][1], (2, date(2026, 8, 1),
                                               date(2026, 8, 1),
                                               date(2026, 10, 31),
                                               date(2026, 10, 31)))

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
