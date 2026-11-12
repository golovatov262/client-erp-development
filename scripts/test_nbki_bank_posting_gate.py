"""Regression: missing/unmatched bank statements never gate NBKI CRM events."""
import unittest
from unittest.mock import patch
from scripts.nbki_record_debt_changes import run


class Cursor:
    def __init__(self,previous=None):
        self.previous=previous;self.queries=[]
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def execute(self,sql,params=None):
        # This cursor deliberately has no bank-import data. Neither missing
        # statements nor an unresolved row such as #779 is a prerequisite.
        if 'bank_' in sql:raise AssertionError('NBKI queried bank import state')
        self.sql=sql;self.queries.append((sql,params))
    def fetchone(self):
        if 'pg_try_advisory_lock' in self.sql:return (True,)
        if 'SELECT event_payload' in self.sql:return self.previous
        raise AssertionError(self.sql)
    def fetchall(self):return [(19,2)]


class Connection:
    def __init__(self,previous=None):self.cur=Cursor(previous)
    def cursor(self):return self.cur
    def commit(self):pass
    def rollback(self):pass


class CrmAccountingSourceTests(unittest.TestCase):
    evidence={'as_of':'2026-11-12','preview':dict(status='candidate_from_crm_components',term_principal='100',term_interest_candidate='1',term_other_candidate='0',overdue_principal='0',overdue_interest='0',overdue_other='0'),'debt':{'rows':[]}}

    def scan(self,conn,error=None):
        with patch('scripts.nbki_record_debt_changes.capture',return_value={'uid':'UID'}), \
             patch('scripts.nbki_record_debt_changes.facts_from_snapshot',return_value=({},100)), \
             patch('scripts.nbki_record_debt_changes.debt_evidence',return_value=self.evidence,side_effect=error), \
             patch('scripts.nbki_record_debt_changes.review_debt_change',return_value={'decision':'changed'}), \
             patch('scripts.nbki_record_debt_changes.record_operation') as record:
            result=run(conn)
            return result,record.call_args_list

    def test_crm_change_proceeds_without_bank_data_and_keeps_loan_lock(self):
        conn=Connection();result,calls=self.scan(conn)
        self.assertEqual(result,{'created':1,'blocked':[]})
        self.assertTrue(any('FROM loans WHERE id=%s FOR UPDATE' in q for q,p in conn.cur.queries))
        self.assertEqual(calls[0].args[3]['kind'],'debt_change')

    def test_no_duplicate_snapshot_without_new_crm_change(self):
        result,calls=self.scan(Connection(({'debt_evidence':self.evidence},)))
        self.assertEqual(result,{'created':0,'blocked':[]})
        self.assertFalse(calls)

    def test_financial_errors_still_block(self):
        result,calls=self.scan(Connection(),ValueError('Не подтверждены проценты CRM'))
        self.assertEqual(result,{'created':0,'blocked':[{'loan_id':19,'reason':'Не подтверждены проценты CRM'}]})
        self.assertFalse(calls)


if __name__=='__main__':unittest.main()
