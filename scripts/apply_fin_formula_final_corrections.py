"""Confirmed corrections of 18.11.2026. Dry run unless --apply."""
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
from nbki_accounting_snapshot import build_accounting_snapshot, audit_payment_allocations
from reconstruct_fin_formula_nbki_history import inputs, rewind_state, validate_terms

KEY='fin-formula-final-confirmations-20261118'
PENALTY_CONTRACTS=('300-000000423012024','300-000044610122025','300-000033629092023',
 '300-000040419122023','300-000001004052026','300-000036808112023','300-000005204062024')
CONTRACTS=PENALTY_CONTRACTS+('300-000043726112025','300-000007823072024','300-000042801102025','300-000041710072025')


def audit(cur,lid,contract,kind,before,after):
    cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
     VALUES ('По поручению пользователя','admin','correct','loan',%s,%s,%s)''',
     (lid,contract,json.dumps({'key':KEY,'kind':kind,'before':before,'after':after},default=str,ensure_ascii=False)))


def save_evidence(cur,lid,pid,evidence):
    evidence=json.loads(json.dumps(evidence,default=str));digest=checksum(evidence)
    cur.execute('SELECT row_to_json(s) FROM nbki_payment_posting_snapshots s WHERE payment_id=%s FOR UPDATE',(pid,));old=cur.fetchone()
    cur.execute('SELECT contract_no FROM loans WHERE id=%s',(lid,));contract=cur.fetchone()[0]
    audit(cur,lid,contract,'event_evidence',old[0] if old else None,evidence)
    cur.execute('''INSERT INTO nbki_payment_posting_snapshots(payment_id,loan_id,payment_date,evidence_sha256,evidence)
     VALUES (%s,%s,%s,%s,%s) ON CONFLICT(payment_id) DO UPDATE SET evidence_sha256=EXCLUDED.evidence_sha256,evidence=EXCLUDED.evidence''',
     (pid,lid,evidence['payment_date'],digest,Json(evidence)))
    cur.execute("UPDATE nbki_crm_events SET evidence_sha256=%s WHERE org_id=3 AND source_type='loan_payment' AND source_id=%s",(digest,pid))


def run(conn):
    result={'corrected':[],'remaining':[]}
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(KEY,))
        cur.execute("SELECT inn FROM organizations WHERE id=3");assert cur.fetchone()==('3666209530',)
        cur.execute("SELECT 1 FROM audit_log WHERE action='complete' AND entity='nbki_correction' AND entity_label=%s",(KEY,))
        if cur.fetchone():return {'already_applied':True}
        cur.execute('SELECT id,contract_no FROM loans WHERE org_id=3 AND contract_no=ANY(%s) ORDER BY id FOR UPDATE',(list(CONTRACTS),));loans=dict((c,l) for l,c in cur.fetchall());assert len(loans)==len(CONTRACTS)
        lids=list(loans.values())
        cur.execute('''SELECT e.id FROM nbki_crm_events e WHERE e.loan_id=ANY(%s) AND
          (EXISTS(SELECT 1 FROM nbki_file_events f WHERE f.crm_event_id=e.id) OR
           EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids) AND p.status<>'cancelled'))''',(lids,))
        assert not cur.fetchall(),'События уже включены в файл: требуется отдельная корректировка отправленного пакета'
        cur.execute('SELECT id FROM loan_payments WHERE loan_id=ANY(%s) FOR UPDATE',(lids,))
        cur.execute('SELECT id FROM loan_schedule WHERE loan_id=ANY(%s) FOR UPDATE',(lids,))
        # Fixed, dated evidence for existing assessed penalties, not added debt.
        for contract in PENALTY_CONTRACTS:
            lid=loans[contract]
            cur.execute('SELECT id,penalty_amount FROM loan_schedule WHERE loan_id=%s ORDER BY id',(lid,));amounts={str(k):str(v or 0) for k,v in cur.fetchall()}
            total=sum((D(v) for v in amounts.values()),D(0))
            cur.execute('''INSERT INTO nbki_penalty_accrual_date_decisions(loan_id,org_id,accrued_on,assessed_amount,schedule_amounts,basis)
              VALUES (%s,3,'2026-10-01',%s,%s,%s) ON CONFLICT(loan_id) DO NOTHING''',(lid,total,Json(amounts),KEY))
            result['corrected'].append({'contract':contract,'penalty_accrued_on':'2026-10-01','assessed_amount':str(total)})
        # Reclassify the last 42 kopecks; payment total and zero loan balance stay.
        lid=loans['300-000043726112025']
        cur.execute('SELECT row_to_json(p) FROM loan_payments p WHERE id=2557 AND loan_id=%s',(lid,));old=cur.fetchone()[0]
        assert D(str(old['principal_part']))==D('107.77') and D(str(old['interest_part']))==0
        cur.execute('UPDATE loan_payments SET principal_part=principal_part-0.42,interest_part=interest_part+0.42 WHERE id=2557')
        cur.execute("UPDATE loan_payment_allocations SET amount=amount-0.42 WHERE payment_id=2557 AND component='early_principal' AND amount=107.77");assert cur.rowcount==1
        cur.execute('SELECT id FROM loan_schedule WHERE loan_id=%s ORDER BY payment_date DESC,id DESC LIMIT 1',(lid,));sid=cur.fetchone()[0]
        cur.execute('SELECT row_to_json(s) FROM loan_schedule s WHERE id=%s',(sid,));oldrow=cur.fetchone()[0]
        cur.execute('''UPDATE loan_schedule SET interest_amount=interest_amount+0.42,payment_amount=payment_amount+0.42,
          paid_amount=paid_amount+0.42,paid_date=GREATEST(paid_date,DATE '2026-10-13') WHERE id=%s''',(sid,))
        cur.execute("INSERT INTO loan_payment_allocations(payment_id,schedule_id,component,amount,allocation_mode) VALUES (2557,%s,'interest',0.42,'manual')",(sid,))
        audit(cur,lid,'300-000043726112025','principal_to_interest',{'payment':old,'schedule':oldrow},{'principal':'107.35','interest':'0.42','new_interest_accrual':'0.42','payment_amount':'107.77'})
        # Contractual end date confirmed by the user.
        lid=loans['300-000042801102025']
        cur.execute('SELECT end_date FROM loans WHERE id=%s',(lid,));old=cur.fetchone()[0]
        cur.execute("UPDATE loans SET end_date='2026-10-31' WHERE id=%s",(lid,))
        audit(cur,lid,'300-000042801102025','end_date',old,'2026-10-31')
        cur.execute('SELECT payment_id,evidence FROM nbki_payment_posting_snapshots WHERE loan_id=%s',(lid,))
        for pid,e in cur.fetchall():
            for side in ('before','after'):e[side]['loan']['end_date']='2026-10-31'
            e['correction_basis']=KEY;save_evidence(cur,lid,pid,e)
        # Full repayment: correct only the explicitly confirmed post-payment OD.
        lid=loans['300-000041710072025']
        cur.execute('SELECT payment_id,evidence FROM nbki_payment_posting_snapshots WHERE loan_id=%s AND payment_id=2941',(lid,));pid,e=cur.fetchone()
        assert D(str(e['after']['loan']['balance']))==D('6026.19')
        e['after']['loan']['balance']='0.00';e['correction_basis']=KEY;save_evidence(cur,lid,pid,e)
        # Existing 11 November snapshot: carry the confirmed penalty assessment
        # from 1 October while preserving its event-specific paid penalties.
        lid=loans['300-000040419122023']
        cur.execute('SELECT payment_id,evidence FROM nbki_payment_posting_snapshots WHERE loan_id=%s AND payment_id=(SELECT source_id FROM nbki_crm_events WHERE id=488)',(lid,));pid,e=cur.fetchone()
        cur.execute('SELECT assessed_amount FROM nbki_penalty_accrual_date_decisions WHERE loan_id=%s',(lid,));assessed=cur.fetchone()[0]
        for side in ('before','after'):
            rows=e[side]['schedule'];delta=assessed-sum((D(str(r['penalty_amount'])) for r in rows),D(0));assert delta>=0
            last=max(rows,key=lambda r:(r['payment_date'],r['id']));last['penalty_amount']=str(D(str(last['penalty_amount']))+delta)
        e['correction_basis']=KEY;save_evidence(cur,lid,pid,e)
        # Reconstruct remaining missing event states after the accounting fixes.
        cur.execute('''SELECT e.id,e.loan_id,e.source_id,l.contract_no FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
          WHERE e.org_id=3 AND l.bki_enabled AND e.loan_id=ANY(%s) AND e.source_type='loan_payment'
          AND NOT EXISTS(SELECT 1 FROM nbki_payment_posting_snapshots s WHERE s.payment_id=e.source_id)
          ORDER BY e.id''',(lids,))
        candidates=cur.fetchall()
        for eid,lid,pid,contract in candidates:
            current,payments,alloc=inputs(cur,lid);p=next(p for p in payments if p[0]==pid)
            validate_terms(cur,lid,p[1]);accounting=build_accounting_snapshot(current['loan']['amount'],current['loan']['balance'],payments,pid)
            assert accounting['status']=='checked',(contract,accounting['issues'])
            accrued_on=date(2026,10,1) if contract in PENALTY_CONTRACTS else None
            if contract not in PENALTY_CONTRACTS and any(D(str(r['penalty_amount'])) for r in current['schedule']):
                result['remaining'].append({'contract':contract,'payment_date':str(p[1]),'reason':'После исправления составляющих платежа требуется дата начисления пеней по этому договору; в исходные семь он не входил'})
                continue
            before=rewind_state(current,payments,alloc,(p[1],pid),False,penalty_accrued_on=accrued_on,allow_rowless_interest=True)
            after=rewind_state(current,payments,alloc,(p[1],pid),True,penalty_accrued_on=accrued_on,allow_rowless_interest=True)
            e={'loan_id':lid,'payment_id':pid,'payment_date':str(p[1]),'before':before,'after':after,'basis':KEY}
            save_evidence(cur,lid,pid,e)
            result['corrected'].append({'contract':contract,'event_id':eid,'payment_date':str(p[1])})
        # Assert the user-confirmed paid-off accounting result.
        lid=loans['300-000043726112025'];state,payments,alloc=inputs(cur,lid)
        assert D(state['loan']['amount'])==sum((p[3] for p in payments),D(0)) and D(state['loan']['balance'])==0
        for p in payments:
            if p[0]==2557:assert audit_payment_allocations(p,alloc[p[0]],lid)['status']=='checked'
        result['queue']=list_crm_events(cur,3,500)
        cur.execute("INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details) VALUES ('По поручению пользователя','admin','complete','nbki_correction',3,%s,%s)",(KEY,json.dumps({'corrected':result['corrected']},ensure_ascii=False)))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');args=p.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        conn.set_session(isolation_level='REPEATABLE READ');result=run(conn)
        if not args.apply:conn.rollback()
    print(json.dumps(result,default=str,ensure_ascii=False))
