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

    def test_receipt_rules_cost_currency_and_zero_interest_date(self):
        from datetime import date
        from unittest.mock import Mock
        facts = self._base_facts(report_blocks={'include_total_cost': True},
            psk={'percent': '12.345', 'amount': '100', 'calculated_on': '2026-01-01',
                 'status': 'cross_checked'})
        cur = Mock(); cur.fetchone.return_value = (date(2026, 11, 30), 100, 0, 100, 0, 'pending')
        event = _event(cur, facts, {}, self._base_debt(), {}, {'remaining_interest_candidate': '10'}, {})
        self.assertIsNone(event.find('./FL_21_PaymentTerms/percentPayDate'))
        self.assertEqual(event.findtext('./FL_21_PaymentTerms/mainPayDate'), '2026-11-30')
        self.assertIsNone(event.find('./FL_54_Accounting/unaccountedCurrency'))
        for tag in ('maxPercentCash', 'maxPercentCashless'):
            self.assertEqual(event.findtext('./FL_22_TotalCost/' + tag), '12.345')

    def test_last_missed_dates_are_separate_and_missing_evidence_blocks(self):
        debt = self._base_debt()
        debt.update(overdue_principal='20', overdue_interest='10', rows=[
            {'due': '2026-08-31', 'overdue_principal': '10', 'overdue_interest': '10'},
            {'due': '2026-09-30', 'overdue_principal': '10', 'overdue_interest': '0'}])
        event = _event(Cursor(), self._base_facts(), {}, debt, {}, {'remaining_interest_candidate': '10'}, {})
        block = event.find('./FL_25_26_27_28_Group/FL_27_DebtOverdue')
        self.assertEqual(block.findtext('mainMissDate'), '2026-09-30')
        self.assertEqual(block.findtext('percentMissDate'), '2026-08-31')
        debt['rows'] = []
        with self.assertRaisesRegex(ValueError, 'Нет подтверждённой даты'):
            _event(Cursor(), self._base_facts(), {}, debt, {}, {'remaining_interest_candidate': '10'}, {})

    def test_inconsistent_application_date_blocks_without_changing_source(self):
        block = {'stageCode': '5', 'stageDate': '2026-01-02'}
        facts = self._base_facts(report_blocks={'include_application': True, 'application_block': block})
        with self.assertRaisesRegex(ValueError, 'дата стадии'):
            _event(Cursor(), facts, {}, self._base_debt(), {}, {'remaining_interest_candidate': '10'}, {})
        self.assertEqual(block['stageDate'], '2026-01-02')

    def test_application_cannot_postdate_stage_and_equal_dates_pass(self):
        block = {'applicationDate': '2026-01-02', 'stageDate': '2026-01-01', 'stageCode': '5'}
        facts = self._base_facts(report_blocks={'include_application': True, 'application_block': block})
        with self.assertRaisesRegex(ValueError, 'ФЛ_55.5'):
            _event(Cursor(), facts, {}, self._base_debt(), {}, {'remaining_interest_candidate': '10'}, {})
        block['applicationDate'] = '2026-01-01'
        event = _event(Cursor(), facts, {}, self._base_debt(), {}, {'remaining_interest_candidate': '10'}, {})
        self.assertEqual(event.findtext('./FL_55_Application/applicationDate'), '2026-01-01')

    def test_verified_inn_is_reported(self):
        from backend.nbki_xml_builder import fl_title
        title = fl_title(dict(last_name='Тест', first_name='Тест', birth_date='1990-01-01',
            passport_series='1234', passport_number='123456', passport_issue_date='2010-01-01',
            passport_issued_by='Тест', inn='123456789012'))
        group = title.find('./FL_6_Tax/TaxNum_group_FL_6_Tax')
        self.assertEqual(group.findtext('taxCode'), '1')
        self.assertIsNotNone(group.find('innChecked_1'))
        self.assertIsNone(group.find('innChecked_0'))


if __name__ == '__main__':
    unittest.main()
