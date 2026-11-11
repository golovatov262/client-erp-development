import unittest
from datetime import date

from backend.loan_payment_engine import parse_event_time_msk, resolve_edited_event_time


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


    def test_edit_date_requires_explicit_time_decision(self):
        old = parse_event_time_msk(date(2026, 11, 1), '12:00:00')
        with self.assertRaisesRegex(ValueError, 'При изменении даты'):
            resolve_edited_event_time('2026-11-01', '2026-11-02', old, 'operator_approximate', {})
        at, basis = resolve_edited_event_time('2026-11-01', '2026-11-02', old,
            'operator_approximate', {'event_time_msk': '12:00:15'})
        self.assertEqual(at.isoformat(), '2026-11-02T12:00:15+03:00')
        self.assertEqual(basis, 'operator_entered')

    def test_edit_preserves_unchanged_basis_and_supports_unknown_time(self):
        old = parse_event_time_msk(date(2026, 11, 1), '12:00:00')
        self.assertEqual(resolve_edited_event_time('2026-11-01', '2026-11-01', old,
            'operator_approximate', {'event_time_msk': '12:00'}), (old, 'operator_approximate'))
        self.assertEqual(resolve_edited_event_time('2026-11-01', '2026-11-02', old,
            'operator_entered', {'event_time_msk': ''}), (None, None))
        self.assertEqual(resolve_edited_event_time('2026-11-01', '2026-11-01', old,
            'operator_entered', {}), (old, 'operator_entered'))


if __name__ == '__main__':
    unittest.main()
