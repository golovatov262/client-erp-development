"""User confirmation: unpaid penalty balance on Oct 1; early payoff on Oct 13.
Previously paid penalties and forward daily-accrual dates remain unchanged.
"""
import argparse
import copy
import json
import os
import sys
from datetime import date
from decimal import Decimal as D
from pathlib import Path
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from nbki_lifecycle import checksum
from nbki_crm_events import list_crm_events
from reconstruct_fin_formula_nbki_history import inputs,rewind_state,validate_terms

KEY='fin-formula-last-four-20261118'

def save(cur,lid,pid,evidence):
    e=json.loads(json.dumps(evidence,default=str));digest=checksum(e)
    cur.execute('SELECT row_to_json(s) FROM nbki_payment_posting_snapshots s WHERE payment_id=%s FOR UPDATE',(pid,));row=cur.fetchone();old=row[0] if row else None
    cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
     VALUES ('По поручению пользователя','admin','correct','nbki_snapshot',%s,%s,%s)''',(pid,KEY,json.dumps({'before':old,'after':e},default=str,ensure_ascii=False)))
    cur.execute('''INSERT INTO nbki_payment_posting_snapshots(payment_id,loan_id,payment_date,evidence_sha256,evidence)
     VALUES (%s,%s,%s,%s,%s) ON CONFLICT(payment_id) DO UPDATE SET evidence=EXCLUDED.evidence,evidence_sha256=EXCLUDED.evidence_sha256''',(pid,lid,e['payment_date'],digest,Json(e)))
    cur.execute("UPDATE nbki_crm_events SET evidence_sha256=%s WHERE org_id=3 AND source_type='loan_payment' AND source_id=%s",(digest,pid))


def run(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(KEY,))
        cur.execute("SELECT 1 FROM audit_log WHERE action='complete' AND entity_label=%s",(KEY,))
        if cur.fetchone():return {'already_applied':True}
        cur.execute("SELECT id,contract_no FROM loans WHERE org_id=3 AND contract_no IN ('300-000007823072024','300-000043726112025') ORDER BY id FOR UPDATE");assert cur.fetchall()==[(106,'300-000007823072024'),(134,'300-000043726112025')]
        cur.execute('''SELECT e.id FROM nbki_crm_events e WHERE e.loan_id IN (106,134) AND
          (EXISTS(SELECT 1 FROM nbki_file_events f WHERE f.crm_event_id=e.id) OR
           EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids) AND p.status<>'cancelled'))''');assert not cur.fetchall()
        cur.execute('SELECT id FROM loan_payments WHERE loan_id IN (106,134) FOR UPDATE')
        cur.execute('SELECT id FROM loan_schedule WHERE loan_id IN (106,134) FOR UPDATE')
        current,payments,alloc=inputs(cur,106)
        cur.execute('SELECT id,schedule_id,accrual_date,amount FROM loan_penalty_daily_accruals WHERE loan_id=106 ORDER BY accrual_date,id');ledger=cur.fetchall()
        cutoff=date(2026,10,1)
        paid_earlier=[p for p in payments if p[1]<cutoff and p[5]>0]
        paid_total=sum((p[5] for p in paid_earlier),D(0))
        baseline={r['id']:D(str(r['penalty_amount'])) for r in current['schedule']}
        for _,sid,day,amount in ledger:
            if day>cutoff:baseline[sid]-=amount
        assert all(v>=0 for v in baseline.values())
        remaining=sum(baseline.values(),D(0))-paid_total;assert remaining>=0
        chronology={'previously_paid':[{'payment_id':p[0],'date':str(p[1]),'amount':str(p[5])} for p in paid_earlier],
           'unpaid_confirmed_on':str(cutoff),'unpaid_confirmed_amount':str(remaining),
           'baseline_schedule_amounts':{str(k):str(v) for k,v in baseline.items()},'later_daily_accruals_preserved':True}
        cur.execute('''INSERT INTO nbki_penalty_accrual_date_decisions(loan_id,org_id,accrued_on,assessed_amount,schedule_amounts,basis)
          VALUES (106,3,%s,%s,%s,%s)''',(cutoff,remaining,Json(chronology),KEY))
        cur.execute('SELECT source_id FROM nbki_crm_events WHERE id=893 AND loan_id=106');pid=cur.fetchone()[0]
        p=next(p for p in payments if p[0]==pid);validate_terms(cur,106,p[1])
        historical=copy.deepcopy(current)
        paid_projection=[]
        for row in historical['schedule']:
            if D(str(row['paid_amount'])) < D(str(row['covered_total_v2'])):
                # A cleared mutable counter must not erase actual dated CRM
                # allocations. This reconstruction does not change CRM money.
                assert D(str(row['paid_amount']))==0 and row['paid_date'] is None
                cur.execute('SELECT payment_id FROM loan_schedule WHERE id=%s',(row['id'],))
                assert cur.fetchone()[0] is None
                paid_projection.append({'schedule_id':row['id'],'old_paid_amount':'0.00','from_allocations':str(row['covered_total_v2'])})
                row['paid_amount']=row['covered_total_v2']
        for row in historical['schedule']:
            row['penalty_amount']=D(str(row['penalty_amount']))-sum((amount for _,sid,day,amount in ledger if sid==row['id'] and day>p[1]),D(0))
            assert row['penalty_amount']>=0
        before=rewind_state(historical,payments,alloc,(p[1],pid),False,penalty_accrued_on=cutoff,allow_rowless_interest=True)
        after=rewind_state(historical,payments,alloc,(p[1],pid),True,penalty_accrued_on=cutoff,allow_rowless_interest=True)
        save(cur,106,pid,{'loan_id':106,'payment_id':pid,'payment_date':str(p[1]),'before':before,'after':after,'basis':KEY,'penalty_chronology':chronology,'paid_counter_reconstruction':paid_projection})
        # Confirmed early payoff shortens the final scheduled period. No debt,
        # payment totals, interest rate or paid-off status is changed.
        cur.execute('SELECT row_to_json(s) FROM loan_schedule s WHERE loan_id=134 ORDER BY payment_date DESC,id DESC LIMIT 1');last=cur.fetchone()[0]
        assert last['payment_date']=='2026-10-31'
        cur.execute("UPDATE loan_schedule SET payment_date='2026-10-13' WHERE id=%s",(last['id'],))
        cur.execute("UPDATE loans SET end_date='2026-10-13' WHERE id=134 AND status='closed' AND balance=0");assert cur.rowcount==1
        cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
          VALUES ('По поручению пользователя','admin','correct','loan_schedule',%s,%s,%s)''',(last['id'],KEY,json.dumps({'before':last,'after_payment_date':'2026-10-13'},ensure_ascii=False)))
        current,payments,alloc=inputs(cur,134)
        early_total=sum((a[3] for values in alloc.values() for a in values if a[1] is None and a[2]=='early_principal'),D(0))
        for pid in (2550,2555,2557):
            p=next(p for p in payments if p[0]==pid)
            states=[]
            for inclusive in (False,True):
                state=rewind_state(current,payments,alloc,(p[1],pid),inclusive,allow_rowless_interest=True)
                # Include the already documented off-schedule early principal
                # in the final-period projection, without adding money in CRM.
                row=next(r for r in state['schedule'] if r['id']==last['id'])
                included=[v for v in payments if (v[1],v[0])<(p[1],pid) or (inclusive and v[0]==pid)]
                paid=sum((a[3] for v in included for a in alloc[v[0]] if a[1] is None and a[2]=='early_principal'),D(0))
                for k in ('principal_amount','payment_amount'):row[k]=D(str(row[k]))+early_total
                for k in ('paid_amount','covered_principal_v2','covered_total_v2'):row[k]=D(str(row[k]))+paid
                states.append(state)
            save(cur,134,pid,{'loan_id':134,'payment_id':pid,'payment_date':str(p[1]),'before':states[0],'after':states[1],
                'basis':KEY,'early_payoff_date':'2026-10-13','final_period_projection':'CRM early-principal allocations included; no new debt'})
        out={'penalty_previously_paid':str(paid_total),'penalty_unpaid_on_2026_10_01':str(remaining),'early_payoff_date':'2026-10-13','queue':list_crm_events(cur,3,500)}
        cur.execute("INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details) VALUES ('По поручению пользователя','admin','complete','nbki_correction',3,%s,%s)",(KEY,json.dumps({k:v for k,v in out.items() if k!='queue'},ensure_ascii=False)))
        return out

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');a=p.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as c:
        c.set_session(isolation_level='REPEATABLE READ');result=run(c)
        if not a.apply:c.rollback()
    print(json.dumps(result,default=str,ensure_ascii=False))
