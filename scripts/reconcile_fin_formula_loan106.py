"""User-authorized schedule reconciliation; all actual payment parts preserved.

Holiday extension rows incorrectly demanded the entire principal again in 2026.
Keep ordinary historical plan amounts, rebuild remaining future principal from
CRM receipts, and preserve the agreed rate, monthly installment and end date.
"""
import argparse
import copy
import json
import os
import sys
from calendar import monthrange
from datetime import date
from decimal import Decimal as D, ROUND_HALF_UP
from pathlib import Path
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from nbki_crm_events import list_crm_events
from nbki_lifecycle import capture,facts_from_snapshot,debt_evidence,MSK
from reconstruct_fin_formula_nbki_history import inputs,rewind_state
from apply_fin_formula_last_four import save
from datetime import datetime

KEY='fin-formula-loan106-schedule-reconciliation-20261118'
CENT=D('.01')
TODAY=date(2026,11,18)


def future_plan(principal,rate,monthly,dates):
    result=[];balance=principal
    for i,day in enumerate(dates):
        interest=(balance*rate/D(1200)).quantize(CENT,rounding=ROUND_HALF_UP)
        main=monthly-interest if i<len(dates)-1 else balance
        if main<0 or main>balance:raise ValueError('Невозможно сохранить платёж и срок для указанного остатка')
        balance-=main
        result.append({'payment_date':str(day),'principal_amount':main,'interest_amount':interest,'payment_amount':main+interest,'balance_after':balance})
    assert balance==0 and sum((r['principal_amount'] for r in result),D(0))==principal
    return result


def allocate_legacy(payments,rows):
    """FIFO by component, recording each actual legacy receipt without changing it."""
    capacity={r['id']:{k:D(str(r[k+'_amount'])) for k in ('principal','interest')} for r in rows}
    result=[]
    for p in payments:
        if p[6]!='legacy':continue
        for component,pos in (('principal',3),('interest',4)):
            remaining=p[pos]
            for r in rows:
                take=min(remaining,capacity[r['id']][component])
                if take:
                    result.append((p[0],r['id'],component,take))
                    remaining-=take;capacity[r['id']][component]-=take
                if remaining==0:break
            if remaining:raise ValueError('Историческая оплата превышает известные плановые суммы '+component)
        if p[5]:result.append((p[0],None,'penalty',p[5]))
    return result


def run(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(KEY,))
        cur.execute("SELECT 1 FROM audit_log WHERE action='complete' AND entity_label=%s",(KEY,))
        if cur.fetchone():return {'already_applied':True}
        cur.execute('SELECT row_to_json(l) FROM loans l WHERE id=106 FOR UPDATE');loan=cur.fetchone()[0]
        assert loan['contract_no']=='300-000007823072024' and loan['org_id']==3
        cur.execute('''SELECT id FROM nbki_crm_events e WHERE loan_id=106 AND
         (EXISTS(SELECT 1 FROM nbki_file_events f WHERE f.crm_event_id=e.id) OR
          EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids) AND p.status<>'cancelled'))''');assert not cur.fetchall()
        cur.execute('SELECT row_to_json(s) FROM loan_schedule s WHERE loan_id=106 ORDER BY payment_date,id FOR UPDATE');old_rows=[r[0] for r in cur.fetchall()]
        cur.execute('SELECT id FROM loan_payments WHERE loan_id=106 FOR UPDATE')
        state,payments,alloc=inputs(cur,106)
        before_alloc=copy.deepcopy(alloc)
        ordinary=[r for r in old_rows if r['payment_no']<=60 and r['status'] not in ('holiday','holiday_pending')]
        historical=[r for r in ordinary if r['payment_date']<='2026-10-31']
        future=[r for r in old_rows if r['payment_no']>=28 and r['status'] not in ('holiday','holiday_pending')]
        future.sort(key=lambda r:r['payment_no']);assert len(future)==36
        wrong=[r for r in old_rows if r['payment_no'] in (61,62,63)];assert len(wrong)==3
        for r in wrong:assert r['payment_date']<'2026-11-01' and D(str(r['principal_amount']))>50000
        original=D(str(loan['amount']));paid_main=sum((p[3] for p in payments),D(0));remaining=original-paid_main
        assert remaining==D(str(loan['balance']))==D('162343.91')
        future_main=original-sum((D(str(r['principal_amount'])) for r in historical),D(0))
        dates=[date.fromisoformat(r['payment_date']) if r['payment_no']<=60 else date(2029,r['payment_no']-53,28 if r['payment_no']==63 else monthrange(2029,r['payment_no']-53)[1]) for r in future]
        assert dates[-1]==date.fromisoformat(loan['end_date']) and dates==sorted(dates)
        plan=future_plan(future_main,D(str(loan['rate'])),D(str(loan['monthly_payment'])),dates)
        for row,new in zip(future,plan):
            cur.execute('''UPDATE loan_schedule SET payment_date=%s,principal_amount=%s,interest_amount=%s,
             payment_amount=%s,balance_after=%s,status='pending',paid_amount=0,paid_date=NULL,payment_id=NULL,overdue_days=0,
             penalty_amount=CASE WHEN payment_no>60 THEN 0 ELSE penalty_amount END WHERE id=%s''',
             (new['payment_date'],new['principal_amount'],new['interest_amount'],new['payment_amount'],new['balance_after'],row['id']))
        wrong_ids=[r['id'] for r in wrong]
        reversed_penalty=sum((D(str(r['penalty_amount'])) for r in wrong),D(0))
        cur.execute('''UPDATE loan_penalty_daily_accruals SET voided_at=clock_timestamp(),void_reason=%s
          WHERE loan_id=106 AND schedule_id=ANY(%s) AND voided_at IS NULL''',(KEY,wrong_ids))
        # Recreate missing legacy allocation evidence. Existing v2 allocations
        # remain the source for the October payment, with the requested shift.
        assert not any(alloc[p[0]] for p in payments if p[6]=='legacy')
        legacy=allocate_legacy(payments,historical)
        for pid,sid,component,amount in legacy:
            cur.execute('''INSERT INTO loan_payment_allocations(payment_id,schedule_id,component,amount,allocation_mode)
             VALUES (%s,%s,%s,%s,'manual')''',(pid,sid,component,amount))
        cur.execute("UPDATE loan_payment_allocations SET amount=amount-74.72 WHERE payment_id=2504 AND schedule_id=145121 AND component='interest' AND amount=3232.45");assert cur.rowcount==1
        cur.execute("UPDATE loan_payment_allocations SET amount=amount+74.72 WHERE payment_id=2504 AND schedule_id=145122 AND component='interest' AND amount=2967.55");assert cur.rowcount==1
        # Reconcile counters to actual receipts, including the old incorrectly
        # 'paid' rows. Do not create a fictitious payment for their shortfall.
        planned_balance=original
        cur.execute('SELECT row_to_json(s) FROM loan_schedule s WHERE loan_id=106 ORDER BY payment_date,id');rows=[r[0] for r in cur.fetchall()]
        for row in rows:
            if row['status'] in ('holiday','holiday_pending'):continue
            cur.execute('''SELECT COALESCE(sum(a.amount),0),max(p.payment_date),max(p.id)
             FROM loan_payment_allocations a JOIN loan_payments p ON p.id=a.payment_id
             WHERE a.schedule_id=%s AND a.component IN ('principal','interest')''',(row['id'],))
            paid,paid_date,pid=cur.fetchone();planned_balance-=D(str(row['principal_amount']))
            due=date.fromisoformat(row['payment_date'])
            status='paid' if paid>=D(str(row['payment_amount'])) else ('overdue' if due<TODAY else ('partial' if paid else 'pending'))
            cur.execute('''UPDATE loan_schedule SET paid_amount=%s,paid_date=%s,payment_id=%s,status=%s,
             balance_after=%s,overdue_days=%s WHERE id=%s''',(paid,paid_date,pid,status,planned_balance,(TODAY-due).days if status=='overdue' else 0,row['id']))
        assert planned_balance==0
        current,payments_after,alloc_after=inputs(cur,106);assert payments_after==payments
        for p in payments:
            parts={k:sum((a[3] for a in alloc_after[p[0]] if a[2]==k),D(0)) for k in ('principal','interest','penalty')}
            assert (parts['principal'],parts['interest'],parts['penalty'])==(p[3],p[4],p[5])
        assert sum((D(str(r['principal_amount']))-D(str(r['covered_principal_v2'])) for r in current['schedule'] if r['status'] not in ('holiday','holiday_pending')),D(0))==remaining
        cur.execute('SELECT id,schedule_id,accrual_date,amount FROM loan_penalty_daily_accruals WHERE loan_id=106 AND voided_at IS NULL');ledger=cur.fetchall()
        pid=2504;p=next(p for p in payments if p[0]==pid);hist=copy.deepcopy(current)
        for r in hist['schedule']:
            r['penalty_amount']=D(str(r['penalty_amount']))-sum((amount for _,sid,day,amount in ledger if sid==r['id'] and day>p[1]),D(0))
            assert r['penalty_amount']>=0
        before=rewind_state(hist,payments,alloc_after,(p[1],pid),False,penalty_accrued_on=date(2026,10,1),allow_rowless_interest=True)
        after=rewind_state(hist,payments,alloc_after,(p[1],pid),True,penalty_accrued_on=date(2026,10,1),allow_rowless_interest=True)
        save(cur,106,pid,{'loan_id':106,'payment_id':pid,'payment_date':str(p[1]),'before':before,'after':after,'basis':KEY})
        # Supersede the old penalty baseline transparently after reversal of the
        # three duplicate demands. Already-paid penalties are never changed.
        cur.execute('SELECT row_to_json(d) FROM nbki_penalty_accrual_date_decisions d WHERE loan_id=106');old_decision=cur.fetchone()[0]
        baseline=sum((D(str(r['penalty_amount'])) for r in hist['schedule']),D(0));paid_penalty=sum((v[5] for v in payments if v[1]<date(2026,10,1)),D(0))
        cur.execute('''UPDATE nbki_penalty_accrual_date_decisions SET assessed_amount=%s,basis=%s,
          schedule_amounts=%s WHERE loan_id=106''',(baseline-paid_penalty,KEY,Json({'previous_decision':old_decision,'reversed_duplicate_charges':str(reversed_penalty),'previously_paid_preserved':str(paid_penalty)})))
        snap=capture(cur,106,datetime.now(MSK));_,principal=facts_from_snapshot(snap);debt_evidence(cur,snap,principal)
        cur.execute('DELETE FROM nbki_debt_scan_issues WHERE loan_id=106 AND org_id=3')
        out={'principal_remaining':str(remaining),'interest_transferred':'74.72','last_installment':str(plan[-1]['payment_amount']),
             'reversed_duplicate_penalties':str(reversed_penalty),'penalty_remaining':str(sum((D(str(r['penalty_amount'])) for r in current['schedule']),D(0))-paid_penalty),
             'queue':list_crm_events(cur,3,500)}
        cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
         VALUES ('По поручению пользователя','admin','complete','loan',106,%s,%s)''',
         (KEY,json.dumps({'before_schedule':old_rows,'before_allocations':before_alloc,'before_penalty_decision':old_decision,'result':{k:v for k,v in out.items() if k!='queue'}},default=str,ensure_ascii=False)))
        return out

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');a=p.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as c:
        c.set_session(isolation_level='REPEATABLE READ');result=run(c)
        if not a.apply:c.rollback()
    print(json.dumps(result,default=str,ensure_ascii=False))
