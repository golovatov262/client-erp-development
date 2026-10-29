import unittest

from scripts.nbki_event23_gate_report import gate_row


class GateReportTest(unittest.TestCase):
    def test_candidate_without_posting_evidence_remains_blocked(self):
        row = {
            'loan_id': 50, 'contract_no': '100-TEST', 'payment_id': 2657,
            'payment_date': '2026-10-28', 'event_occurred_at_msk': '2026-10-28T10:47:11+03:00',
            'uid': 'some-uid', 'amount': '19300.00',
            'accounting_snapshot': {'principal_after': '451886.34', 'status': 'checked'},
            'interest_candidate': {'status': 'candidate_from_crm_formula',
                                   'remaining_interest_candidate': '0.00', 'issues': []},
            'debt_preview': {'status': 'candidate_from_crm_components',
                             'total_candidate': '451985.48', 'issues': []},
            'event23_readiness': {'blockers': ['Нет снимка графика при проведении платежа'],
                                  'xml_ready': False},
            'posting_snapshot_sha256': None, 'xml_ready': False,
        }
        result = gate_row(row)
        self.assertFalse(result['can_generate_xml'])
        self.assertFalse(result['posting_snapshot'])
        self.assertIn('Нет снимка графика', result['blockers'][0])

    def test_interest_conflict_is_always_a_blocker(self):
        row = {
            'loan_id': 87, 'contract_no': '100-TEST', 'payment_id': 2649,
            'payment_date': '2026-10-26', 'event_occurred_at_msk': None,
            'uid': 'some-uid', 'amount': '13600.87',
            'accounting_snapshot': {'principal_after': '321425.56', 'status': 'checked'},
            'interest_candidate': {'status': 'review', 'remaining_interest_candidate': None,
                                   'issues': ['Нужно сверить период']},
            'debt_preview': {'status': 'unavailable', 'total_candidate': None,
                             'issues': ['Нет полного долга']},
            'event23_readiness': {'blockers': [], 'xml_ready': True},
            'posting_snapshot_sha256': 'abc', 'xml_ready': True,
        }
        result = gate_row(row)
        self.assertFalse(result['can_generate_xml'])
        self.assertIn('Проценты: Нужно сверить период', result['blockers'])


if __name__ == '__main__':
    unittest.main()
