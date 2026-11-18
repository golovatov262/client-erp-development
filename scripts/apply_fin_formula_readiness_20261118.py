"""Explicit operator decisions of 2026-11-18. Dry run unless --apply.
Accept calculated CRM PSK, restore already-paid penalty accrual and queue missing
payments from the confirmed reporting start. Never fabricate historical snapshots.
"""
import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from decimal import Decimal
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from loan_psk import calculate_psk
from nbki_payment_posting_snapshot import record_payment_event
from nbki_lifecycle import refresh_event_metadata, capture, facts_from_snapshot, debt_evidence, MSK
from nbki_crm_events import list_crm_events
from datetime import datetime

KEY='fin-formula-readiness-20261118'
NOTE='Пользователь 18.11.2026 подтвердил правильность ПСК, рассчитанной CRM'

def audit(cur, action, entity, ident, label, evidence):
    cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
      VALUES ('По поручению пользователя','admin',%s,%s,%s,%s,%s)''',
      (action,entity,ident,label,json.dumps(dict(evidence,correction_key=KEY),default=str,ensure_ascii=False)))

def financial_fingerprint(cur):
    import hashlib
    h=hashlib.sha256()
    for table in ('loans','loan_payments','loan_payment_allocations','loan_schedule'):
        expr="to_jsonb(t)-'penalty_amount'" if table=='loan_schedule' else 'to_jsonb(t)'
        cur.execute(f'SELECT ({expr})::text FROM {table} t ORDER BY id')
        for r in cur:h.update(r[0].encode())
    return h.hexdigest()

def run(conn):
    result={'psk':[],'penalties':[],'created_events':[],'metadata_refreshed':[],'metadata_blocked':[]}
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM organizations WHERE inn='3666209530' AND ogrn='1163668081895'")
        org=cur.fetchone()[0]
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(KEY,))
        before=financial_fingerprint(cur)
        cur.execute('''SELECT l.id,l.contract_no,l.amount,l.rate,l.term_months,l.start_date,l.schedule_type,
            row_to_json(p),d.override_term_months,d.decision
            FROM loans l JOIN members m ON m.id=l.member_id
            LEFT JOIN loan_psk_calculations p ON p.loan_id=l.id
            LEFT JOIN nbki_psk_manual_decisions d ON d.loan_id=l.id
            WHERE l.org_id=%s AND l.bki_enabled AND m.member_type='FL'
              AND (l.status IN ('active','overdue','holiday') OR p.loan_id IS NOT NULL)
            ORDER BY l.id FOR UPDATE OF l''',(org,))
        for lid,contract,amount,rate,term,start,kind,old,override,decision in cur.fetchall():
            effective_term=override if decision=='override_origination_term' else term
            calc=calculate_psk(amount,rate,effective_term,start,kind)
            if decision!='override_origination_term':
                cur.execute('''INSERT INTO nbki_psk_manual_decisions(loan_id,org_id,decision,basis,note)
                  VALUES (%s,%s,'trust_crm_value','operator_confirmation',%s)
                  ON CONFLICT(loan_id) DO UPDATE SET decision=EXCLUDED.decision,basis=EXCLUDED.basis,note=EXCLUDED.note''',(lid,org,NOTE))
            cur.execute('''INSERT INTO loan_psk_calculations
                (loan_id,org_id,psk_percent,psk_amount,calculated_on,principal,annual_rate,term_months,schedule_type,calculation_method,verification_status,verification_note)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'cross_checked',%s)
                ON CONFLICT(loan_id) DO UPDATE SET psk_percent=EXCLUDED.psk_percent,psk_amount=EXCLUDED.psk_amount,
                calculated_on=EXCLUDED.calculated_on,principal=EXCLUDED.principal,annual_rate=EXCLUDED.annual_rate,
                term_months=EXCLUDED.term_months,schedule_type=EXCLUDED.schedule_type,calculation_method=EXCLUDED.calculation_method,
                verification_status=EXCLUDED.verification_status,verification_note=EXCLUDED.verification_note,calculated_at=clock_timestamp()
                WHERE (loan_psk_calculations.psk_percent,loan_psk_calculations.psk_amount,
                       loan_psk_calculations.principal,loan_psk_calculations.annual_rate,
                       loan_psk_calculations.term_months,loan_psk_calculations.schedule_type,
                       loan_psk_calculations.calculated_on,loan_psk_calculations.calculation_method,
                       loan_psk_calculations.verification_status,loan_psk_calculations.verification_note)
                  IS DISTINCT FROM (EXCLUDED.psk_percent,EXCLUDED.psk_amount,EXCLUDED.principal,
                       EXCLUDED.annual_rate,EXCLUDED.term_months,EXCLUDED.schedule_type,
                       EXCLUDED.calculated_on,EXCLUDED.calculation_method,
                       EXCLUDED.verification_status,EXCLUDED.verification_note)''',
                (lid,org,calc['percent'],calc['amount'],start,amount,rate,effective_term,kind,calc['method'],NOTE))
            cur.execute('''INSERT INTO nbki_loan_report_blocks(loan_id,org_id,include_total_cost,include_application,basis)
              VALUES (%s,%s,true,false,'operator_confirmed_crm_psk') ON CONFLICT(loan_id) DO NOTHING''',(lid,org))
            if not old or old.get('verification_status')!='cross_checked' or old.get('verification_note')!=NOTE or Decimal(str(old['psk_percent']))!=calc['percent'] or Decimal(str(old['psk_amount']))!=calc['amount']:
                audit(cur,'psk_confirmation','loan',lid,contract,{'before':old,'after':calc,'reason':NOTE})
            result['psk'].append({'contract':contract,'percent':str(calc['percent']),'amount':str(calc['amount'])})
        cur.execute('''SELECT l.id,l.contract_no FROM loans l WHERE l.org_id=%s AND l.bki_enabled
          AND COALESCE((SELECT sum(penalty_part) FROM loan_payments WHERE loan_id=l.id),0)>
              COALESCE((SELECT sum(penalty_amount) FROM loan_schedule WHERE loan_id=l.id),0)
          ORDER BY l.id FOR UPDATE''',(org,))
        for lid,contract in cur.fetchall():
            cur.execute('SELECT id FROM loan_schedule WHERE loan_id=%s FOR UPDATE',(lid,))
            cur.execute('SELECT id FROM loan_payments WHERE loan_id=%s FOR UPDATE',(lid,))
            cur.execute('SELECT COALESCE(sum(penalty_amount),0) FROM loan_schedule WHERE loan_id=%s',(lid,));assessed=cur.fetchone()[0]
            cur.execute('SELECT COALESCE(sum(penalty_part),0) FROM loan_payments WHERE loan_id=%s',(lid,));paid=cur.fetchone()[0]
            delta=paid-assessed
            if delta<=0:continue
            cur.execute('SELECT id,penalty_amount FROM loan_schedule WHERE loan_id=%s ORDER BY payment_date DESC,id DESC LIMIT 1',(lid,));row=cur.fetchone()
            if not row:raise ValueError('Нет строки графика для доначисления '+contract)
            cur.execute('UPDATE loan_schedule SET penalty_amount=COALESCE(penalty_amount,0)+%s WHERE id=%s',(delta,row[0]))
            audit(cur,'penalty_accrual_correction','loan',lid,contract,{'reason':'Пользователь подтвердил доначисление уже оплаченных пеней до нулевого остатка',
                'amount':delta,'assessed_before':assessed,'assessed_after':paid,'paid':paid,'remaining_after':'0.00','schedule_id':row[0],'previous_row_penalty':row[1]})
            result['penalties'].append({'contract':contract,'added':str(delta),'remaining':'0.00'})
        cur.execute('''SELECT p.id,p.loan_id,l.contract_no,p.payment_date,p.amount,p.nbki_event_occurred_at,s.evidence_sha256
            FROM loan_payments p JOIN loans l ON l.id=p.loan_id
            LEFT JOIN nbki_payment_posting_snapshots s ON s.payment_id=p.id
            WHERE l.org_id=%s AND l.bki_enabled AND p.payment_date BETWEEN DATE '2026-10-01' AND DATE '2026-11-18'
            AND NOT EXISTS(SELECT 1 FROM nbki_crm_events e WHERE e.source_type='loan_payment' AND e.source_id=p.id)
            ORDER BY p.payment_date,p.id FOR UPDATE OF p,l''',(org,))
        for pid,lid,contract,day,amount,at,digest in cur.fetchall():
            eid=record_payment_event(cur,pid,lid,at,digest)
            audit(cur,'create','nbki_crm_event',eid,contract,{'reason':'Восстановление пропущенного события платежа по поручению пользователя',
                'payment_id':pid,'payment_date':day,'amount':amount,'event_time':at,'snapshot_exists':bool(digest)})
            result['created_events'].append({'id':eid,'contract':contract,'date':str(day),'amount':str(amount),'has_snapshot':bool(digest)})
        cur.execute('''SELECT e.id,e.event_payload,l.contract_no FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
            WHERE e.org_id=%s AND l.bki_enabled AND e.event_payload IS NOT NULL AND e.status IN ('new','rejected')
            AND NOT EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE p.org_id=e.org_id AND e.id=ANY(p.event_ids) AND p.status<>'cancelled')
            ORDER BY e.id''',(org,))
        for eid,old,contract in cur.fetchall():
            cur.execute('SAVEPOINT refresh_metadata')
            try:
                refresh_event_metadata(cur,org,eid)
                cur.execute('SELECT event_payload FROM nbki_crm_events WHERE id=%s',(eid,));new=cur.fetchone()[0]
                assert old.get('debt_evidence')==new.get('debt_evidence')
                for key in ('loan','schedule','payments','occurred_at','accounting_date'):
                    assert old['snapshot'].get(key)==new['snapshot'].get(key)
                if old==new:cur.execute('ROLLBACK TO SAVEPOINT refresh_metadata')
                else:result['metadata_refreshed'].append(eid)
            except ValueError as exc:
                cur.execute('ROLLBACK TO SAVEPOINT refresh_metadata');result['metadata_blocked'].append({'contract':contract,'reason':str(exc)})
            cur.execute('RELEASE SAVEPOINT refresh_metadata')
        assert before==financial_fingerprint(cur),'Изменены неразрешённые учётные данные'
        # Recheck existing current-state warnings only; no new debt events here.
        cur.execute('SELECT loan_id FROM nbki_debt_scan_issues WHERE org_id=%s',(org,))
        for (lid,) in cur.fetchall():
            try:
                snapshot=capture(cur,lid,datetime.now(MSK));facts,principal=facts_from_snapshot(snapshot)
                debt_evidence(cur,snapshot,principal)
                cur.execute('DELETE FROM nbki_debt_scan_issues WHERE loan_id=%s',(lid,))
            except ValueError as exc:cur.execute('UPDATE nbki_debt_scan_issues SET reason=%s,checked_at=now() WHERE loan_id=%s',(str(exc),lid))
        result['queue']=list_crm_events(cur,org,500)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');args=p.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        conn.set_session(isolation_level='REPEATABLE READ')
        result=run(conn)
        if not args.apply:conn.rollback()
    print(json.dumps(result,default=str,ensure_ascii=False))
