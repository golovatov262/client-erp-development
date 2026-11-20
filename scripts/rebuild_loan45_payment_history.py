"""Owner-authorized chronological reconstruction of Sevostyanov's loan.

Initial terms: 209000 RUB, 39%, 60 annuity periods. Preserve contractual dates,
receipt IDs/dates/amounts, historical collected penalties, and exported evidence.
Use current v2 scheduled-interest / overdue-priority / reduce-payment rules.
Default dry run rolls back. --apply commits with full before/after audit.
"""
import argparse
import copy
import hashlib
import json
import os
from datetime import date
from decimal import Decimal as D
from collections import defaultdict

import psycopg2
from psycopg2.extras import RealDictCursor, Json
from backend.loan_payment_engine import money

KEY = 'loan-45-full-scheduled-history-20261120'
EXPECTED_IDS = [689,690,691,692,693,694,695,696,697,698,699,700,701,702,703,704,705,706,2218,708,1539,1858,2203,2302,2448,2533,2940]

def check(ok, message):
    if not ok:
        raise RuntimeError(message)

def fetch(cur, table, where, args=(45,)):
    cur.execute(f'SELECT * FROM {table} WHERE {where}', args)
    return [dict(r) for r in cur.fetchall()]

def capture(cur):
    return dict(loan=fetch(cur,'loans','id=%s'),
        payments=fetch(cur,'loan_payments','loan_id=%s ORDER BY payment_date,id'),
        schedule=fetch(cur,'loan_schedule','loan_id=%s ORDER BY payment_no,id'),
        allocations=fetch(cur,'loan_payment_allocations','payment_id IN (SELECT id FROM loan_payments WHERE loan_id=%s) ORDER BY id'),
        snapshots=fetch(cur,'nbki_payment_posting_snapshots','loan_id=%s ORDER BY payment_id'),
        events=fetch(cur,'nbki_crm_events','loan_id=%s ORDER BY id'))

def rebuild(state):
    loan=state['loan'][0]; schedules=copy.deepcopy(state['schedule']); payments=copy.deepcopy(state['payments'])
    rate=loan['rate']/1200; balance=loan['amount']; allocations=[]
    def recalc(rows, running):
        n=len(rows); factor=(1+rate)**n
        monthly=money(running*rate*factor/(factor-1))
        for index,s in enumerate(rows):
            interest=money(running*rate)
            principal=running if index==n-1 else min(running,money(monthly-interest))
            running=money(running-principal)
            s.update(interest_amount=interest,principal_amount=principal,payment_amount=interest+principal,balance_after=running)
        return monthly
    for s in schedules:
        s.update(covered_i=D(0),covered_p=D(0),paid_amount=D(0),paid_date=None,payment_id=None)
    monthly=recalc(schedules,balance)
    check(monthly==D('7960.80'),'Initial schedule does not match preserved first period')
    for p in payments:
        day=p['payment_date']; month=(day.year,day.month)
        rows=[s for s in schedules if (s['payment_date'].year,s['payment_date'].month)<=month and s['paid_amount']<s['payment_amount']]
        overdue=any(s['payment_date']<day for s in rows)
        if overdue: rows=[s for s in rows if s['payment_date']<day]
        left=p['amount']-p['penalty_part']; totals=defaultdict(lambda:D(0))
        for component,planned,covered in [('interest','interest_amount','covered_i'),('principal','principal_amount','covered_p')]:
            for s in rows:
                take=min(left,s[planned]-s[covered])
                check(take>=0,'Negative allocation')
                if take:
                    allocations.append((p['id'],s['id'],component,take))
                    left-=take;totals[component]+=take;s[covered]+=take;s['paid_amount']+=take
                    s.update(paid_date=day,payment_id=p['id'])
        early=min(left,balance-totals['principal']);left-=early
        check(left==0,'Unexpected surplus')
        if early:allocations.append((p['id'],None,'early_principal',early))
        if p['penalty_part']:allocations.append((p['id'],None,'penalty',p['penalty_part']))
        balance=money(balance-totals['principal']-early)
        p.update(interest_part=totals['interest'],principal_part=totals['principal']+early,
                 payment_type='early_partial' if early else 'regular',manual_distribution=True)
        if early:
            future=[s for s in schedules if s['paid_amount']==0 and
                    (s['payment_date']>day if overdue else (s['payment_date'].year,s['payment_date'].month)>month)]
            if future:monthly=recalc(future,balance)
        check(p['interest_part']+p['principal_part']+p['penalty_part']==p['amount'],'Payment does not balance')
    for s in schedules:
        fully_paid=s['paid_amount']==s['payment_amount']
        s['status']='paid' if fully_paid else ('overdue' if s['payment_date']<date(2026,11,20) else ('partial' if s['paid_amount'] else 'pending'))
        end=s['paid_date'] if fully_paid else date(2026,11,20)
        s['overdue_days']=max(0,(end-s['payment_date']).days)
    check(balance==loan['amount']-sum(p['principal_part'] for p in payments),'Ledger mismatch')
    check(sum(s['principal_amount']-s['covered_p'] for s in schedules)==balance,'Unpaid scheduled principal mismatch')
    check(schedules[-1]['balance_after']==0,'Schedule does not amortize')
    check(balance==D('140038.52') and monthly==D('7693.03'),'Reviewed reconstruction changed')
    check(payments[-1]['interest_part']==D('4658.58') and payments[-1]['principal_part']==D('3302.42'),'November result changed')
    return payments,schedules,allocations,balance,monthly

def verify_engine(cur,state,plan):
    """Replay the same receipts (net of already collected penalties) through v2
    on a temporary test loan, then roll back every test row."""
    from backend.loan_payment_engine import post_loan_payment
    cur.execute('SAVEPOINT verify_loan45')
    try:
        l=state['loan'][0]
        cur.execute('''INSERT INTO loans (contract_no,member_id,org_id,amount,rate,term_months,schedule_type,start_date,end_date,monthly_payment,balance,status,bki_enabled)
            VALUES ('VERIFY-LOAN45-20261120',%s,%s,209000,39,60,'annuity',%s,%s,7960.80,209000,'active',false) RETURNING id''',
            (l['member_id'],l['org_id'],l['start_date'],l['end_date']))
        lid=cur.fetchone()['id'];running=D('209000')
        for k,s in enumerate(state['schedule']):
            i=money(running*D('.0325'));p=running if k==59 else D('7960.80')-i;running-=p
            cur.execute('''INSERT INTO loan_schedule (loan_id,payment_no,payment_date,payment_amount,principal_amount,interest_amount,balance_after,status,paid_amount,penalty_amount)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',0,0)''',(lid,k+1,s['payment_date'],p+i,p,i,running))
        for original,expected in zip(state['payments'],plan[0]):
            with cur.connection.cursor() as t:
                result=post_loan_payment(t,lid,original['amount']-original['penalty_part'],original['payment_date'],source='manual')
            check(money(result['principal_part'])==expected['principal_part'] and money(result['interest_part'])==expected['interest_part'],f'Engine differs on payment {original["id"]}')
        cur.execute('SELECT balance,monthly_payment FROM loans WHERE id=%s',(lid,));r=cur.fetchone()
        check(r['balance']==plan[3] and r['monthly_payment']==plan[4],'Engine final state differs')
    finally:
        cur.execute('ROLLBACK TO SAVEPOINT verify_loan45');cur.execute('RELEASE SAVEPOINT verify_loan45')

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--apply',action='store_true');ap.add_argument('--verify-engine',action='store_true');ap.add_argument('--expected-state-sha');args=ap.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SET LOCAL lock_timeout='10s'")
            cur.execute('SELECT pg_advisory_xact_lock(4520261120)')
            for table,where in [('loans','id=45'),('loan_payments','loan_id=45'),('loan_schedule','loan_id=45')]:
                cur.execute(f'SELECT id FROM {table} WHERE {where} ORDER BY id FOR UPDATE');cur.fetchall()
            before=capture(cur);l=before['loan'][0]
            digest=hashlib.sha256(json.dumps(before,default=str,sort_keys=True).encode()).hexdigest()
            print('STATE_SHA',digest)
            if args.apply:check(args.expected_state_sha==digest,'State changed since reviewed preview')
            check(l['contract_no']=='100-000005226022024' and l['balance']==D('137637.29') and l['monthly_payment']==D('7561.12') and l['rate']==39 and l['term_months']==60,'Loan changed')
            check([p['id'] for p in before['payments']]==EXPECTED_IDS and sum(p['amount'] for p in before['payments'])==D('257747') and sum(p['penalty_part'] for p in before['payments'])==D('256.55'),'Payment set changed')
            check(len(before['schedule'])==60 and [s['payment_no'] for s in before['schedule']]==list(range(1,61)),'Schedule changed')
            cur.execute('SELECT 1 FROM loan_payment_correction_audit WHERE correction_key=%s',(KEY,));check(cur.fetchone() is None,'Already applied')
            plan=rebuild(before)
            if args.verify_engine:verify_engine(cur,before,plan);print('All 27 payments match live v2 engine replay')
            payments,schedules,allocations,balance,monthly=plan
            cur.execute('DELETE FROM loan_payment_allocations WHERE payment_id IN (SELECT id FROM loan_payments WHERE loan_id=45)')
            for pid,sid,component,amount in allocations:
                cur.execute('''INSERT INTO loan_payment_allocations (payment_id,schedule_id,component,amount,allocation_mode) VALUES (%s,%s,%s,%s,'manual')''',(pid,sid,component,amount))
            for p in payments:
                cur.execute('UPDATE loan_payments SET interest_part=%s,principal_part=%s,payment_type=%s,manual_distribution=true WHERE id=%s',
                    (p['interest_part'],p['principal_part'],p['payment_type'],p['id']))
            for s in schedules:
                fields=['payment_amount','principal_amount','interest_amount','balance_after','paid_amount','paid_date','payment_id','status','overdue_days']
                cur.execute('UPDATE loan_schedule SET '+','.join(f'{f}=%s' for f in fields)+' WHERE id=%s',tuple(s[f] for f in fields)+(s['id'],))
            status='overdue' if any(s['status']=='overdue' for s in schedules) else 'active'
            cur.execute('UPDATE loans SET balance=%s,monthly_payment=%s,status=%s,updated_at=NOW() WHERE id=45',(balance,monthly,status))
            after=capture(cur)
            check(before['snapshots']==after['snapshots'] and before['events']==after['events'],'Frozen NBKI evidence changed')
            for old,new in zip(before['payments'],after['payments']):
                for f in ['id','payment_date','amount','penalty_part','source','source_ref','nbki_event_occurred_at','nbki_event_time_basis']:
                    check(old[f]==new[f],f'Protected receipt field changed: {f}')
            cur.execute('''SELECT p.id FROM loan_payments p LEFT JOIN loan_payment_allocations a ON a.payment_id=p.id
                WHERE p.loan_id=45 GROUP BY p.id HAVING SUM(a.amount)<>p.amount''');check(not cur.fetchall(),'Allocation totals mismatch')
            cur.execute('''SELECT SUM(principal_amount) total FROM loan_schedule WHERE loan_id=45 AND status<>'paid' ''');check(cur.fetchone()['total']==balance,'Persisted schedule mismatch')
            js=lambda v:json.dumps(v,default=str,ensure_ascii=False)
            cur.execute('''INSERT INTO loan_payment_correction_audit (correction_key,loan_id,payment_id,reason,before_state,after_state)
                VALUES (%s,45,2940,%s,%s,%s)''',(KEY,
                'Owner authorized full chronological redistribution. Initial annuity terms and existing dates; current v2 overdue-priority, scheduled interest and reduce-payment method. Collected and assessed historical penalties preserved separately; accepted NBKI records and frozen snapshots preserved and require separate reporting correction review.',Json(before,dumps=js),Json(after,dumps=js)))
            print(js({'balance':balance,'monthly':monthly,'status':status,'recent_payments':[{k:p[k] for k in ['id','payment_date','amount','interest_part','principal_part','penalty_part']} for p in payments[-4:]],'recent_schedule':[{k:s[k] for k in ['payment_date','payment_amount','paid_amount','status']} for s in schedules if date(2026,8,1)<=s['payment_date']<=date(2026,12,31)]}))
        if args.apply:conn.commit()
        else:conn.rollback()
    print('APPLIED' if args.apply else 'DRY RUN rolled back')

if __name__=='__main__':main()
