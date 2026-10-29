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


if __name__ == '__main__':
    unittest.main()
