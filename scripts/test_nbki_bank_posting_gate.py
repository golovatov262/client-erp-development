import unittest
from datetime import datetime, timedelta, timezone
from scripts.nbki_record_debt_changes import bank_posting_blocker


class Cursor:
    def __init__(self, running=False, last=None, statements=None, unresolved=0):
        self.running,self.last,self.statements,self.unresolved=running,last,statements,unresolved
        self.queries=[]
    def execute(self,sql,params=None):
        self.queries.append((sql,params));self.sql=sql
    def fetchone(self):
        if 'SELECT EXISTS' in self.sql:return (self.running,)
        if 'finished_at' in self.sql:return self.last
        if 'COUNT(*)' in self.sql:return (self.unresolved,)
        raise AssertionError(self.sql)
    def fetchall(self):return self.statements


class BankPostingGateTests(unittest.TestCase):
    now=datetime(2026,11,12,6,tzinfo=timezone.utc)
    def cursor(self,**kw):
        args=dict(last=('ok',self.now-timedelta(minutes=29)),statements=[(2,4,'loaded')]);args.update(kw)
        return Cursor(**args)
    def test_completed_posting_allows_snapshot(self):
        c=self.cursor()
        self.assertIsNone(bank_posting_blocker(c,2,self.now))
        self.assertEqual(c.queries[0][0],'LOCK TABLE bank_sync_log IN SHARE MODE')
        self.assertEqual(c.queries[-1][1],(2,(self.now-timedelta(days=1)).date()))
    def test_running_import_blocks_even_with_existing_statement(self):
        self.assertIn('ещё выполняется',bank_posting_blocker(self.cursor(running=True),2,self.now))
    def test_missing_failed_or_yesterday_run_blocks(self):
        for last in (None,('error',self.now),('ok',None),('ok',self.now-timedelta(days=1))):
            with self.subTest(last=last):
                self.assertIn('нет успешного',bank_posting_blocker(self.cursor(last=last),2,self.now))
    def test_success_with_no_email_does_not_prove_statement_received(self):
        self.assertIn('не получены',bank_posting_blocker(self.cursor(statements=[(2,None,None)]),2,self.now))
    def test_missing_second_account_or_no_connection_blocks(self):
        for rows in ([],[(1,1,'loaded'),(2,None,None)],[(1,1,'error')]):
            self.assertIn('не получены',bank_posting_blocker(self.cursor(statements=rows),2,self.now))
    def test_unposted_or_unidentified_receipt_blocks(self):
        self.assertIn('не разнесено',bank_posting_blocker(self.cursor(unresolved=1),2,self.now))
    def test_moscow_date_used_near_utc_midnight(self):
        now=datetime(2026,11,11,22,tzinfo=timezone.utc)
        c=self.cursor(last=('ok',now))
        self.assertIsNone(bank_posting_blocker(c,2,now))
        self.assertEqual(c.queries[-1][1][1].isoformat(),'2026-11-11')


if __name__=='__main__':unittest.main()
