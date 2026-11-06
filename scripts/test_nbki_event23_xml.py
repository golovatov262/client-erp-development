import unittest

from backend.nbki_event23_xml import _event, _require_reconciled_schedule_principal


class Cursor:
    def execute(self, query, params):
        self.query = query

    def fetchone(self):
        return None


class Event23XmlTests(unittest.TestCase):
    def test_unreconciled_schedule_principal_is_held_from_xml(self):
        with self.assertRaisesRegex(ValueError, 'удержано.*разница.*-1901.60'):
            _require_reconciled_schedule_principal({
                'principal_reconciled': False, 'principal_difference': '-1901.60'})

    def test_reconciled_schedule_principal_can_continue_to_xml_checks(self):
        _require_reconciled_schedule_principal({'principal_reconciled': True})

    def test_overdue_start_date_is_not_formatted_as_money(self):
        facts = {
            'loan_id': 1,
            'loan': {'terms': {'deal_code': '1', 'kind_code': '1', 'purpose_code': '1'},
                     'start_date': '2026-01-01', 'end_date': '2027-01-01', 'rate': '12',
                     'original_principal': '1000'},
            'payment': {'date': '2026-10-30', 'amount': '100', 'principal': '80',
                        'interest': '20', 'penalty': '0',
                        'cumulative': {'amount': '100', 'principal': '80',
                                       'interest': '20', 'penalty': '0'}},
            'uid': 'test-uid', 'contract_no': 'test-contract',
            'event_occurred_at': '2026-10-30T12:00:00+03:00',
            'source': {'source_code': 'test-source'},
        }
        debt = {'term_principal': '800', 'overdue_principal': '80',
                'overdue_interest': '20',
                'penalty_candidate': {'remaining': '0'},
                'rows': [{'due': '2026-10-15', 'overdue_principal': '80',
                          'overdue_interest': '20'}]}
        event = _event(Cursor(), facts, {}, debt, {},
                       {'remaining_interest_candidate': '10'}, {})
        start = event.find('./FL_25_26_27_28_Group/FL_27_DebtOverdue/debtOverdueStartDate')
        self.assertIsNotNone(start)
        self.assertEqual(start.text, '2026-10-15')
        self.assertEqual(event.find('./FL_25_26_27_28_Group/FL_27_DebtOverdue/debtOverdueSum').text,
                         '100.00')


if __name__ == '__main__':
    unittest.main()
