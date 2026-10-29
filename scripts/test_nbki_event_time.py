import unittest
from datetime import date

from backend.loan_payment_engine import parse_event_time_msk


class NbkiEventTimeTests(unittest.TestCase):
    def test_explicit_moscow_time(self):
        value = parse_event_time_msk(date(2026, 10, 1), '13:24:05')
        self.assertEqual(value.isoformat(), '2026-10-01T13:24:05+03:00')

    def test_missing_time_remains_unverified(self):
        self.assertIsNone(parse_event_time_msk(date(2026, 10, 1), None))

    def test_time_cannot_carry_another_timezone(self):
        with self.assertRaises(ValueError):
            parse_event_time_msk(date(2026, 10, 1), '13:24:05+03:00')

    def test_invalid_time(self):
        with self.assertRaises(ValueError):
            parse_event_time_msk(date(2026, 10, 1), '25:30')


if __name__ == '__main__':
    unittest.main()
