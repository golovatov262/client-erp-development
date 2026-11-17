import unittest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch
from scripts.import_nbki_operator_history import run

class OperatorHistoryTests(unittest.TestCase):
    def test_metadata_import_does_not_attest_acceptance(self):
        self.check(False)
    def test_acceptance_requires_explicit_mode(self):
        self.check(True)
    def check(self, confirm):
        conn=MagicMock();cur=conn.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value=(9,False,None);cur.fetchall.return_value=[]
        parsed=dict(events=[],reg_number='GU01LL000001_20260901_132251',deals={},events_count=30)
        with patch('scripts.import_nbki_operator_history.source_profile',return_value={}), \
             patch('scripts.import_nbki_operator_history.parse_source_xml',return_value=parsed), \
             patch('scripts.import_nbki_operator_history.import_payloads',return_value={}), \
             patch('scripts.import_nbki_operator_history.sync_file_delivery'):
            result=run(conn,b'<Document/>',3,date(2026,8,31),'Operator basis',confirm_acceptance=confirm)
        writes=[c.args[0] for c in cur.execute.call_args_list if c.args[0].lstrip().startswith('UPDATE')]
        self.assertEqual(bool(writes),confirm)
        self.assertEqual(result['operator_confirmed_events'],30 if confirm else 0)
    def test_period_mismatch_fails_before_import(self):
        conn=MagicMock()
        with patch('scripts.import_nbki_operator_history.source_profile',return_value={}), \
             patch('scripts.import_nbki_operator_history.parse_source_xml',return_value={'events':[{'event_time':datetime(2026,9,1,tzinfo=timezone.utc)}]}), \
             patch('scripts.import_nbki_operator_history.import_payloads') as importer:
            with self.assertRaises(ValueError):run(conn,b'',3,date(2026,8,31),'basis',confirm_acceptance=False)
            importer.assert_not_called()
