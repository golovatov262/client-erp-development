"""Refresh Krasotkina's statuses only; default is a rolled-back preview."""
import argparse
import importlib.util
import json
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / 'backend/cron-accrue/index.py'
    spec = importlib.util.spec_from_file_location('status_due_dates', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SET LOCAL lock_timeout='10s'")
            cur.execute('SELECT *,CURRENT_DATE AS as_of FROM loans WHERE id=94 FOR UPDATE')
            loan = dict(cur.fetchone())
            if loan['contract_no'] != '100-000001313082025' or loan['status'] in ('closed', 'holiday'):
                raise RuntimeError('Unexpected loan state')
            cur.execute('SELECT * FROM loan_schedule WHERE loan_id=94 ORDER BY payment_no FOR UPDATE')
            before = [dict(r) for r in cur.fetchall()]
            overdue = False
            for row in before:
                if row['status'] in ('holiday','holiday_pending'):
                    continue
                due = module.effective_due_date(row['payment_date'])
                paid = row['paid_amount'] or 0
                if paid >= row['payment_amount']:
                    status, days = 'paid', row['overdue_days']
                elif due < loan['as_of']:
                    status, days = 'overdue', (loan['as_of']-due).days
                    overdue = True
                else:
                    status, days = ('partial' if paid else 'pending'), 0
                cur.execute('UPDATE loan_schedule SET status=%s,overdue_days=%s WHERE id=%s',
                            (status, days, row['id']))
            status = 'overdue' if overdue else 'active'
            cur.execute('UPDATE loans SET status=%s,updated_at=NOW() WHERE id=94', (status,))
            cur.execute('SELECT * FROM loan_schedule WHERE loan_id=94 ORDER BY payment_no')
            after = [dict(r) for r in cur.fetchall()]
            for old,new in zip(before,after):
                assert {k:v for k,v in old.items() if k not in ('status','overdue_days')} == {
                    k:v for k,v in new.items() if k not in ('status','overdue_days')}
            changes = [dict(id=new['id'],date=new['payment_date'],before_status=old['status'],
                            after_status=new['status'],before_days=old['overdue_days'],after_days=new['overdue_days'])
                       for old,new in zip(before,after) if old!=new]
            details = json.dumps(dict(basis='Owner requested status refresh; existing CRM business-day rule',
                as_of=loan['as_of'],before_status=loan['status'],after_status=status,changes=changes), default=str,ensure_ascii=False)
            cur.execute('''INSERT INTO audit_log (action,entity,entity_id,entity_label,details)
                VALUES ('recalc_statuses','loan',94,%s,%s)''', (loan['contract_no'],details))
            print(details)
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
    print('APPLIED' if args.apply else 'DRY RUN: rolled back')

if __name__=='__main__':
    main()
