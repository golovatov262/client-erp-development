"""Expired loans retain accounting checks and export all remaining claims as overdue."""
import hashlib
import json
import unittest
from datetime import date
from decimal import Decimal
from backend.nbki_crm_debt import split_posting_snapshot_debt, estimate_posting_snapshot_interest, _maturity
from backend.nbki_debt_preview import preview_debt
from backend.nbki_smp import preview_smp_from_posting_snapshot
from scripts import test_nbki_lifecycle as fixtures
from backend.nbki_lifecycle import obligation_event


class MaturedDebtTests(unittest.TestCase):
    def evidence(self, kind='annuity'):
        return {'loan_id': 1, 'payment_id': 2, 'payment_date': '2026-11-12', 'after': {
            'loan': {'balance': '60066.28', 'end_date': '2026-06-30', 'schedule_type': kind, 'status': 'overdue'},
            'paid_penalty_to_date': '10.00', 'schedule': [{
                'id': 3, 'payment_date': '2026-06-30', 'principal_amount': '53992.46',
                'interest_amount': '6639.59', 'paid_amount': '0', 'covered_interest_v2': '0',
                'covered_principal_v2': '0', 'covered_total_v2': '0', 'penalty_amount': '100.00', 'status': 'overdue'}]}}

    def calculate(self, evidence):
        sha = hashlib.sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        day = date(2026, 11, 12)
        debt = split_posting_snapshot_debt(evidence, sha, 1, 2, day)
        interest = estimate_posting_snapshot_interest(None, evidence, sha, 1, 2, day)
        preview = preview_debt({'status': 'checked', 'principal_after': '60066.28'}, debt, interest)
        return debt, interest, preview, sha

    def test_expired_annuity_and_end_term_preserve_amounts(self):
        for kind in ('annuity', 'end_of_term'):
            with self.subTest(kind=kind):
                evidence = self.evidence(kind)
                debt, interest, preview, sha = self.calculate(evidence)
                self.assertEqual(debt['overdue_principal'], '60066.28')
                self.assertEqual(debt['rows'][-1]['overdue_principal'], '6073.82')
                self.assertEqual(preview['term_total_candidate'], '0.00')
                self.assertEqual(preview['overdue_total_candidate'], '66795.87')
                self.assertEqual(preview['overdue_other'], '90.00')
                self.assertEqual(interest['remaining_interest_candidate'], '0.00')
                smp = preview_smp_from_posting_snapshot(evidence, sha, 1, 2, date(2026,11,12), debt)
                self.assertEqual(smp['value_without_penalty_uncapped'], 66796)
                self.assertEqual(smp['remaining_schedule_payments'], '0.00')

    def test_maturity_does_not_hide_invalid_accounting(self):
        evidence = self.evidence()
        evidence['after']['paid_penalty_to_date'] = '101'
        debt, _, preview, _ = self.calculate(evidence)
        self.assertEqual(debt['status'], 'review')
        self.assertEqual(preview['status'], 'unavailable')
        evidence = self.evidence()
        evidence['after']['schedule'][0]['principal_amount'] = '70000'
        self.assertEqual(self.calculate(evidence)[0]['status'], 'review')

    def test_due_day_future_schedule_and_holiday_are_not_matured(self):
        loan = self.evidence()['after']['loan']
        self.assertIsNone(_maturity(loan, date(2026,6,30), date(2026,6,30)))
        self.assertIsNone(_maturity(loan, date(2026,12,31), date(2026,11,12)))
        loan['status'] = 'holiday'
        self.assertIsNone(_maturity(loan, date(2026,6,30), date(2026,11,12)))

    def test_expired_debt_xml_and_penalty_only_xml_validate(self):
        fixture = fixtures.LifecycleTests()
        for penalty_only in (False, True):
            p = fixture.payload('FL_Event_2_3')
            debt, interest, preview, _ = self.calculate(self.evidence())
            if penalty_only:
                debt.update(overdue_principal='0.00', overdue_interest='0.00', rows=[])
            p['debt_evidence'].update(debt=debt, interest=interest, preview=preview)
            ev = obligation_event(p)
            self.assertEqual(ev.findtext('.//debtDueExist_0'), '')
            self.assertEqual(ev.findtext('.//debtOverdueOtherSum'), '90.00')
            self.assertEqual(ev.findtext('.//debtOverdueSum'), '90.00' if penalty_only else '66795.87')
            fixture.assert_schema(ev)
