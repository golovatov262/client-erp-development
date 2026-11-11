import unittest

from backend.nbki_event23_xml import _event


class Cursor:
    def execute(self, query, params):
        self.query = query

    def fetchone(self):
        return None


class Event23XmlTests(unittest.TestCase):
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
        # FL_28_Payment never carries ФЛ_28.10/28.11 - omitted entirely to
        # match the organization's own confirmed-accepted historical files.
        payment = event.find('./FL_25_26_27_28_Group/FL_28_Payment')
        self.assertEqual(payment.findtext('./sizeCode'), '-')
        self.assertEqual(payment.findtext('./scheduleCode'), '-')
        # Present in every real FL_25_Debt block observed.
        self.assertIsNotNone(event.find('./FL_25_26_27_28_Group/FL_25_Debt/graceUnconfExist_0'))
        # No report_blocks precedent and loan status not overdue in this fixture.
        self.assertIsNotNone(event.find('./FL_56_Participation/overdueExist_0'))
        self.assertIsNone(event.find('./FL_55_Application'))
        self.assertIsNone(event.find('./FL_22_TotalCost'))

    def _base_facts(self, **loan_overrides):
        loan = {'terms': {'deal_code': '1', 'kind_code': '1', 'purpose_code': '1'},
                'start_date': '2026-01-01', 'end_date': '2027-01-01', 'rate': '12',
                'original_principal': '1000'}
        loan.update(loan_overrides)
        return {
            'loan_id': 1, 'loan': loan,
            'payment': {'date': '2026-10-30', 'amount': '100', 'principal': '80',
                        'interest': '20', 'penalty': '0',
                        'cumulative': {'amount': '100', 'principal': '80',
                                       'interest': '20', 'penalty': '0'}},
            'uid': 'test-uid', 'contract_no': 'test-contract',
            'event_occurred_at': '2026-10-30T12:00:00+03:00',
            'source': {'source_code': 'test-source'},
        }

    def _base_debt(self):
        return {'term_principal': '800', 'overdue_principal': '0',
                'overdue_interest': '0', 'penalty_candidate': {'remaining': '0'}, 'rows': []}

    def test_overdue_loan_status_sets_participation_flag(self):
        facts = self._base_facts(status='overdue')
        event = _event(Cursor(), facts, {}, self._base_debt(), {},
                       {'remaining_interest_candidate': '10'}, {})
        self.assertIsNotNone(event.find('./FL_56_Participation/overdueExist_1'))
        self.assertIsNone(event.find('./FL_56_Participation/overdueExist_0'))

    def test_fl55_emitted_from_report_blocks_precedent(self):
        facts = self._base_facts(report_blocks={
            'include_total_cost': False, 'include_application': True,
            'application_block': {'role': '1', 'sum': '2400000.00', 'wayCode': '6'}})
        event = _event(Cursor(), facts, {}, self._base_debt(), {},
                       {'remaining_interest_candidate': '10'}, {})
        application = event.find('./FL_55_Application')
        self.assertIsNotNone(application)
        self.assertEqual([c.tag for c in application], ['role', 'sum', 'wayCode'])
        self.assertEqual(application.find('./wayCode').text, '6')

    def test_fl55_required_by_precedent_but_missing_data_raises(self):
        facts = self._base_facts(report_blocks={
            'include_total_cost': False, 'include_application': True,
            'application_block': None})
        with self.assertRaises(ValueError):
            _event(Cursor(), facts, {}, self._base_debt(), {},
                  {'remaining_interest_candidate': '10'}, {})

    def test_fl22_required_by_precedent_but_psk_not_cross_checked_raises(self):
        facts = self._base_facts(report_blocks={'include_total_cost': True,
                                                 'include_application': False},
                                 psk={'percent': '20', 'amount': '100',
                                      'calculated_on': '2026-01-01', 'status': 'review'})
        with self.assertRaises(ValueError):
            _event(Cursor(), facts, {}, self._base_debt(), {},
                  {'remaining_interest_candidate': '10'}, {})


if __name__ == '__main__':
    unittest.main()
