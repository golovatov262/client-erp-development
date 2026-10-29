import unittest

from backend.nbki_debt_preview import preview_debt


class DebtPreviewTests(unittest.TestCase):
    def test_balances_reconcile_but_remain_candidate(self):
        result = preview_debt(
            {'status': 'checked', 'principal_after': '321425.56'},
            {'status': 'calculated_from_current_crm',
             'term_principal': '321425.56', 'overdue_principal': '0.00',
             'overdue_interest': '0.00',
             'penalty_candidate': {'remaining': '185.02',
                'due_classification': 'term_until_final_scheduled_payment'}},
            {'status': 'candidate_from_crm_formula',
             'remaining_interest_candidate': '8382.13'})
        self.assertEqual(result['status'], 'candidate_from_crm_components')
        self.assertEqual(result['total_candidate'], '329992.71')
        self.assertEqual(result['overdue_total_candidate'], '0.00')

    def test_missing_interest_or_inconsistent_principal_blocks(self):
        accounting = {'status': 'checked', 'principal_after': '100.00'}
        debt = {'status': 'calculated_from_current_crm', 'term_principal': '99.00',
                'overdue_principal': '0.00', 'overdue_interest': '0.00',
                'penalty_candidate': {'remaining': '0.00',
                    'due_classification': 'term_until_final_scheduled_payment'}}
        self.assertEqual(preview_debt(accounting, debt, {'status': 'unavailable'})['status'],
                         'unavailable')
        self.assertEqual(preview_debt(accounting, debt, {
            'status': 'candidate_from_crm_formula',
            'remaining_interest_candidate': '1.00'})['status'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
