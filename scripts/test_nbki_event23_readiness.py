import unittest
from decimal import Decimal

from backend.nbki_event23_readiness import MONETARY_BLOCKS, assess_event23


class Event23ReadinessTests(unittest.TestCase):
    def test_monetary_path_has_required_debt_group(self):
        names = [name for name, _ in MONETARY_BLOCKS]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn(('FL_25_26_27_28_Group', True), MONETARY_BLOCKS)
        self.assertIn(('FL_29_MonthlyPayment', False), MONETARY_BLOCKS)

    def test_partial_accounting_never_claims_regulatory_total(self):
        inspection = {'uid': 'uid', 'snapshot': {'loan': {
            'contract_no': '123', 'start_date': '2026-01-01',
            'amount': Decimal('1000')}}}
        accounting = {'status': 'checked', 'principal_after': '900.00',
                      'cumulative_crm_payments': {'amount': '200.00'}}
        result = assess_event23(inspection, accounting, {'status': 'checked'},
                                None, None)
        self.assertEqual(result['debt_evidence']['principal_after_crm'], '900.00')
        self.assertIsNone(result['debt_evidence']['total_debt'])
        self.assertIn('Не подтверждено фактическое время события', result['blockers'])
        self.assertFalse(result['xml_ready'])

    def test_structurally_absent_blocks_are_confirmed_without_per_event_data(self):
        inspection = {'uid': 'uid', 'snapshot': {'loan': {
            'contract_no': '123', 'start_date': '2026-01-01', 'amount': Decimal('1000')}}}
        accounting = {'status': 'checked', 'principal_after': '900.00',
                      'cumulative_crm_payments': {'amount': '200.00'}}
        result = assess_event23(inspection, accounting, {'status': 'checked'}, None, None)
        statuses = {block['name']: block['status'] for block in result['blocks']}
        for name in ('FL_20_JointDebtors', 'FL_36_1_ProvisionPaymentOffset',
                     'FL_30_NonMonetarySource', 'FL_37_WarrantyReturn',
                     'FL_19_1_AmountInfo', 'FL_54_Accounting', 'FL_29_1_DebtBurdenInfo',
                     'FL_19_Amount'):
            self.assertEqual(statuses[name], 'source_present')
        for name in ('FL_18_Deal', 'FL_56_Participation', 'FL_21_PaymentTerms',
                     'FL_22_TotalCost', 'FL_29_MonthlyPayment', 'FL_55_Application'):
            self.assertEqual(statuses[name], 'review')

    def test_fl55_and_fl22_follow_loan_report_block_precedent(self):
        inspection = {'uid': 'uid', 'snapshot': {'loan': {
            'contract_no': '123', 'start_date': '2026-01-01', 'amount': Decimal('1000')}}}
        accounting = {'status': 'checked', 'principal_after': '900.00',
                      'cumulative_crm_payments': {'amount': '200.00'}}

        never_needed = assess_event23(inspection, accounting, {'status': 'checked'}, None, None,
                                      report_blocks={'include_total_cost': False,
                                                     'include_application': False,
                                                     'application_block': None})
        statuses = {block['name']: block['status'] for block in never_needed['blocks']}
        self.assertEqual(statuses['FL_22_TotalCost'], 'source_present')
        self.assertEqual(statuses['FL_55_Application'], 'source_present')

        needed_with_data = assess_event23(inspection, accounting, {'status': 'checked'}, None, None,
                                          psk_candidate_status='cross_checked',
                                          smp_candidate={'status': 'candidate_from_crm_schedule'},
                                          report_blocks={'include_total_cost': True,
                                                         'include_application': True,
                                                         'application_block': {'role': '1'}})
        statuses = {block['name']: block['status'] for block in needed_with_data['blocks']}
        self.assertEqual(statuses['FL_22_TotalCost'], 'source_present')
        self.assertEqual(statuses['FL_55_Application'], 'source_present')

        needed_without_psk = assess_event23(inspection, accounting, {'status': 'checked'}, None, None,
                                            report_blocks={'include_total_cost': True,
                                                           'include_application': True,
                                                           'application_block': {'role': '1'}})
        statuses = {block['name']: block['status'] for block in needed_without_psk['blocks']}
        self.assertEqual(statuses['FL_22_TotalCost'], 'review')

    def test_fl19_amount_needs_loan_amount_present(self):
        inspection = {'uid': 'uid', 'snapshot': {'loan': {
            'contract_no': '123', 'start_date': '2026-01-01', 'amount': None}}}
        accounting = {'status': 'checked', 'principal_after': '900.00',
                      'cumulative_crm_payments': {'amount': '200.00'}}
        result = assess_event23(inspection, accounting, {'status': 'checked'}, None, None)
        statuses = {block['name']: block['status'] for block in result['blocks']}
        self.assertEqual(statuses['FL_19_Amount'], 'review')

    def test_computed_evidence_upgrades_group_a_blocks(self):
        inspection = {'uid': 'uid', 'snapshot': {'loan': {
            'contract_no': '123', 'start_date': '2026-01-01', 'amount': Decimal('1000')}}}
        accounting = {'status': 'checked', 'principal_after': '900.00',
                      'cumulative_crm_payments': {'amount': '200.00'}}
        loan_terms = {'deal_code': '1', 'kind_code': '99', 'purpose_code': '1'}
        result = assess_event23(inspection, accounting, {'status': 'checked'}, '2026-01-01T10:00:00',
                                'a' * 64, psk_candidate_status='cross_checked',
                                smp_candidate={'status': 'candidate_from_crm_schedule'},
                                loan_terms=loan_terms)
        statuses = {block['name']: block['status'] for block in result['blocks']}
        self.assertEqual(statuses['FL_18_Deal'], 'source_present')
        self.assertEqual(statuses['FL_56_Participation'], 'source_present')
        self.assertEqual(statuses['FL_22_TotalCost'], 'source_present')
        self.assertEqual(statuses['FL_21_PaymentTerms'], 'partial')
        self.assertEqual(statuses['FL_29_MonthlyPayment'], 'partial')


if __name__ == '__main__':
    unittest.main()
