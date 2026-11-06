import unittest

from backend.nbki_import import Deal, _match_loan
from backend.nbki_mxl_import import _match_borrower
from backend.nbki_uid import authoritative_borrower_uid


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.sql = []

    def execute(self, sql, params=None):
        self.sql.append(sql)

    def fetchall(self):
        return list(self.rows)


class NbkiUidAuthorityTests(unittest.TestCase):
    def test_latest_file_uid_wins_without_manual_uid_comparison(self):
        cur = FakeCursor([('uid-new',), ('uid-old',)])
        uid, basis = authoritative_borrower_uid(cur, 2, 17, '100-17', 'manual-old')
        self.assertEqual((uid, basis), ('uid-new', 'nbki_file'))
        self.assertNotIn('match_status', cur.sql[0])

    def test_manual_uid_is_fallback_if_no_file_uid(self):
        uid, basis = authoritative_borrower_uid(FakeCursor([]), 2, 17, '100-17', 'manual')
        self.assertEqual((uid, basis), ('manual', 'crm_manual'))

    def test_xml_match_uses_only_unique_contract_number(self):
        deal = Deal(uid='file-uid', contract_no='100-17', subject_type='UL', role='borrower',
                    subject_name='Stale file name', subject_inn='000', birth_date=None,
                    deal_date=None, original_amount=None, currency=None, deal_code=None,
                    kind_code=None, purpose_code=None, last_event_time=None)
        loan_id, status, reason = _match_loan(FakeCursor([(17,)]), 2, deal)
        self.assertEqual((loan_id, status, reason), (17, 'matched', None))

    def test_mxl_match_uses_only_unique_contract_number(self):
        deal = {'role': 'borrower', 'contract_no': '100-17', 'subject_name': 'Stale file name',
                'original_amount': 999999, 'deal_date': None, 'uid': 'file-uid'}
        loan_id, status, reason = _match_borrower(FakeCursor([(17,)]), 2, deal)
        self.assertEqual((loan_id, status, reason), (17, 'matched', None))

    def test_duplicate_contract_number_remains_ambiguous(self):
        deal = {'role': 'borrower', 'contract_no': '100-17', 'subject_name': 'Name',
                'original_amount': 100, 'deal_date': None, 'uid': 'file-uid'}
        loan_id, status, reason = _match_borrower(FakeCursor([(17,), (18,)]), 2, deal)
        self.assertEqual(loan_id, None)
        self.assertEqual(status, 'review')
        self.assertTrue(reason)


if __name__ == '__main__':
    unittest.main()
