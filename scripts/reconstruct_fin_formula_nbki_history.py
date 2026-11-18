"""Operator-authorized reconstruction from CRM (18.11.2026); no archive required.

Never labels reconstructed evidence as captured at posting. Runs in a rollback
transaction unless --apply. Does not alter payments, schedules or balances.
"""
import argparse
import copy
import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg2
from psycopg2.extras import Json
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from nbki_payment_posting_snapshot import capture_loan_state
from nbki_lifecycle import checksum, capture, facts_from_snapshot, refresh_event_metadata
from nbki_crm_debt import split_posting_snapshot_debt, _maturity
from nbki_debt_preview import preview_debt
from nbki_smp import preview_smp_from_posting_snapshot
from nbki_accounting_snapshot import audit_payment_allocations, build_accounting_snapshot

BASIS = 'operator_authorized_crm_ledger_reconstruction_20261118'
D = lambda x: Decimal(str(x))
CENT = Decimal('.01')


def rewind_state(current, payments, allocations, cutoff, inclusive=True):
    """Undo precisely allocated later payments, never guess their schedule rows."""
    state = copy.deepcopy(current)
    included = [p for p in payments if (p[1], p[0]) < cutoff or (inclusive and (p[1], p[0]) == cutoff)]
    later = [p for p in payments if p not in included]
    if any(p[3] is None or D(p[3]) < 0 for p in payments):
        raise ValueError('В журнале отсутствует или отрицательна часть основного долга')
    balance = D(state['loan']['amount']) - sum((D(p[3]) for p in included), D(0))
    if balance < -CENT:
        raise ValueError('Сумма погашенного основного долга превышает сумму займа')
    if abs(D(state['loan']['amount']) - sum((D(p[3]) for p in payments), D(0)) - D(current['loan']['balance'])) > CENT:
        raise ValueError('Текущий остаток карточки не равен сумме займа минус погашенный ОД')
    state['loan']['balance'] = balance
    state['paid_penalty_to_date'] = sum((D(p[5]) for p in included), D(0))
    rows = {r['id']: r for r in state['schedule']}
    if later and any(D(r['penalty_amount']) != 0 for r in rows.values()):
        raise ValueError('Для расчёта пени на дату платежа нужны даты начислений: в CRM сохранена только общая начисленная сумма')
    for p in later:
        a = allocations.get(p[0], [])
        check = audit_payment_allocations(p, a, state['loan_id'])
        if check['status'] != 'checked':
            raise ValueError('Распределения последующего платежа ' + str(p[1]) + ': ' + '; '.join(check['issues']))
        for _, sid, component, value, _, _ in a:
            if sid is None:
                if component not in ('early_principal',) and D(value):
                    raise ValueError('Распределение последующего платежа не связано со строкой графика')
                continue
            r = rows.get(sid)
            if r is None:raise ValueError('Строка распределения отсутствует в действующем графике')
            if r['status'] in ('holiday','holiday_pending'):
                raise ValueError('Строка кредитных каникул требует отдельного восстановления')
            r['paid_amount'] = D(r['paid_amount']) - D(value)
            r['covered_total_v2'] = D(r['covered_total_v2']) - D(value)
            if component in ('interest','principal'):
                key='covered_'+component+'_v2';r[key]=D(r[key])-D(value)
            if min(D(r[k]) for k in ('paid_amount','covered_total_v2','covered_interest_v2','covered_principal_v2')) < -CENT:
                raise ValueError('Распределения последующих платежей превышают оплату строки графика')
            if D(value):
                r['status']='partial' if D(r['paid_amount'])>0 else 'pending'
                r['paid_date']=None
    return state


def interest_from_ledger(state, payments, day):
    loan=state['loan'];schedule=state['schedule'];rate=D(loan['rate'])
    end=_maturity(loan,max(date.fromisoformat(str(r['payment_date'])) for r in schedule),day)
    if end:
        return {'status':'candidate_from_crm_formula','remaining_interest_candidate':'0.00','issues':[], 'basis':BASIS}
    if loan['schedule_type']!='annuity' or rate<0 or loan['status']=='holiday':
        raise ValueError('Не поддержан расчёт процентов для данного типа графика')
    anchor=max([date.fromisoformat(str(loan['start_date']))]+[date.fromisoformat(str(r['payment_date'])) for r in schedule if str(r['payment_date'])<day.isoformat()])
    rows=[r for r in schedule if str(r['payment_date'])>=day.isoformat()]
    if not rows:raise ValueError('Не найдена строка текущего периода начисления')
    row=min(rows,key=lambda r:(str(r['payment_date']),r['id']))
    legacy=D(row['paid_amount'])-D(row['covered_total_v2'])
    covered=min(legacy,D(row['interest_amount']))+D(row['covered_interest_v2'])
    if legacy < -CENT or covered>D(row['interest_amount'])+CENT:
        raise ValueError('Оплата процентов строки не согласована с её распределениями')
    balance=D(loan['amount']);accrued=D(0);prev=anchor
    for p in payments:
        if p[1]>day:raise ValueError('В расчёт процентов попал последующий платёж')
        if p[1]>anchor:
            accrued+=(balance*rate*D((p[1]-prev).days)/D(36500)).quantize(CENT,rounding='ROUND_HALF_UP');prev=p[1]
        balance-=D(p[3])
        if balance < -CENT:raise ValueError('Отрицательный ОД при расчёте процентов')
    accrued+=(balance*rate*D((day-prev).days)/D(36500)).quantize(CENT,rounding='ROUND_HALF_UP')
    return {'status':'candidate_from_crm_formula','basis':BASIS,'period_start':str(anchor),
        'accrued_before_payment':str(accrued),'interest_covered_in_period':str(covered),
        'remaining_interest_candidate':str(max(D(0),accrued-covered)),'issues':[]}


def inputs(cur,lid):
    cur.execute('SELECT id,payment_date,amount,principal_part,interest_part,penalty_part,engine_version FROM loan_payments WHERE loan_id=%s ORDER BY payment_date,id',(lid,))
    payments=cur.fetchall();alloc={}
    for p in payments:
        cur.execute('''SELECT a.id,a.schedule_id,a.component,a.amount,a.allocation_mode,s.loan_id
          FROM loan_payment_allocations a LEFT JOIN loan_schedule s ON s.id=a.schedule_id WHERE a.payment_id=%s ORDER BY a.id''',(p[0],))
        alloc[p[0]]=cur.fetchall()
    state=capture_loan_state(cur,lid);state['loan_id']=lid
    return state,payments,alloc


def validate_terms(cur,lid,day):
    cur.execute('''SELECT EXISTS(SELECT 1 FROM approved_loan_schedule_replacements WHERE loan_id=%s
       AND (applied_at AT TIME ZONE 'Europe/Moscow')::date>=%s)''',(lid,day))
    if cur.fetchone()[0]:raise ValueError('После платежа заменён график; нужны параметры действовавшего графика')
    cur.execute('''SELECT count(DISTINCT annual_rate) FROM nbki_loan_terms_versions WHERE loan_id=%s AND annual_rate IS NOT NULL''',(lid,))
    if cur.fetchone()[0]>1:raise ValueError('Ставка менялась: требуется расчёт по периодам действия ставки')


def run(conn):
    out={'restored':[],'blocked':[],'metadata':[]}
    with conn.cursor() as cur:
        cur.execute("SELECT inn FROM organizations WHERE id=3")
        if cur.fetchone() != ('3666209530',):raise ValueError('Организация не соответствует ФИН ФОРМУЛЕ')
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(BASIS,))
        cur.execute('''SELECT e.id,e.loan_id,e.source_id,l.contract_no FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
          WHERE e.org_id=3 AND l.bki_enabled AND e.source_type='loan_payment' AND e.status IN ('new','rejected')
          AND NOT EXISTS(SELECT 1 FROM nbki_payment_posting_snapshots s WHERE s.payment_id=e.source_id)
          AND NOT EXISTS(SELECT 1 FROM nbki_file_events f WHERE f.crm_event_id=e.id)
          AND NOT EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids) AND p.status<>'cancelled')
          ORDER BY e.id FOR UPDATE OF e,l''')
        candidates=cur.fetchall()
        from nbki_crm_events import list_crm_events
        blocked_ids={r['id'] for r in list_crm_events(cur,3,500)['rows'] if not r['readiness']['can_generate_xml']}
        candidates=[r for r in candidates if r[0] in blocked_ids]
        for eid,lid,pid,contract in candidates:
            cur.execute('SAVEPOINT reconstruction')
            try:
                current,payments,alloc=inputs(cur,lid);p=next(p for p in payments if p[0]==pid)
                validate_terms(cur,lid,p[1])
                accounting=build_accounting_snapshot(current['loan']['amount'],current['loan']['balance'],payments,pid)
                if accounting['status']!='checked':raise ValueError('; '.join(accounting['issues']))
                before=rewind_state(current,payments,alloc,(p[1],pid),False)
                after=rewind_state(current,payments,alloc,(p[1],pid),True)
                evidence=json.loads(json.dumps({'loan_id':lid,'payment_id':pid,'payment_date':str(p[1]),'before':before,'after':after,'basis':BASIS},default=str))
                digest=checksum(evidence)
                debt=split_posting_snapshot_debt(evidence,digest,lid,pid,p[1])
                interest=interest_from_ledger(after,[v for v in payments if (v[1],v[0])<=(p[1],pid)],p[1])
                preview=preview_debt(accounting,debt,interest)
                if preview['status']!='candidate_from_crm_components':raise ValueError('; '.join(debt['issues']+preview['issues']))
                cur.execute('''INSERT INTO nbki_payment_posting_snapshots(payment_id,loan_id,payment_date,evidence_sha256,evidence)
                    VALUES (%s,%s,%s,%s,%s)''',(pid,lid,p[1],digest,Json(evidence)))
                cur.execute('UPDATE nbki_crm_events SET evidence_sha256=%s WHERE id=%s',(digest,eid))
                out['restored'].append({'contract':contract,'date':str(p[1]),'amount':str(p[2]),'event_id':eid})
            except ValueError as exc:
                cur.execute('ROLLBACK TO SAVEPOINT reconstruction');out['blocked'].append({'contract':contract,'event_id':eid,'reason':str(exc)})
            cur.execute('RELEASE SAVEPOINT reconstruction')
        # Explicit authorization to calculate missing intermediate principal
        # balances from CRM payment components, with existing rate/amount checks.
        cur.execute('''INSERT INTO nbki_payment_ledger_reconstruction_decisions(payment_id,loan_id,org_id,basis,note)
            SELECT p.id,l.id,l.org_id,'operator_confirmation',%s FROM loan_payments p JOIN loans l ON l.id=p.loan_id
            WHERE l.org_id=3 AND l.bki_enabled ON CONFLICT(payment_id) DO NOTHING''',(BASIS,))
        cur.execute('''SELECT e.id,e.loan_id,e.event_payload,e.evidence_sha256,l.contract_no
          FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id WHERE e.org_id=3 AND l.bki_enabled
          AND e.status IN ('new','rejected') AND e.event_payload IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM nbki_file_events f WHERE f.crm_event_id=e.id)
          AND NOT EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids) AND p.status<>'cancelled')
          ORDER BY e.id FOR UPDATE OF e,l''')
        for eid,lid,old,old_digest,contract in cur.fetchall():
            if old.get('debt_evidence') or not old.get('related_payment_id'):continue
            cur.execute('SAVEPOINT accrual_reconstruction')
            try:
                pid=old['related_payment_id']
                cur.execute('SELECT evidence FROM nbki_payment_posting_snapshots WHERE payment_id=%s AND loan_id=%s',(pid,lid));r=cur.fetchone()
                if not r:raise ValueError('Нет распределений для расчёта начисления перед платежом')
                stored=r[0];day=date.fromisoformat(stored['payment_date']);validate_terms(cur,lid,day)
                current,payments,alloc=inputs(cur,lid)
                before=stored['before'];included=[p for p in payments if (p[1],p[0])<(day,pid)]
                principal=D(before['loan']['amount'])-sum((D(p[3]) for p in included),D(0))
                if abs(principal-D(before['loan']['balance']))>CENT:raise ValueError('Остаток до платежа не равен сумме займа минус погашенный ОД CRM')
                evidence={'loan_id':lid,'payment_id':pid,'payment_date':str(day),'before':before,'after':before,'basis':BASIS}
                digest=checksum(evidence);debt=split_posting_snapshot_debt(evidence,digest,lid,pid,day)
                interest=interest_from_ledger(before,included,day)
                accounting={'status':'checked','principal_after':str(principal)}
                preview=preview_debt(accounting,debt,interest)
                if preview['status']!='candidate_from_crm_components':raise ValueError('; '.join(debt['issues']+preview['issues']))
                smp=preview_smp_from_posting_snapshot(evidence,digest,lid,pid,day,debt)
                if smp['status']!='candidate_from_posting_snapshot_schedule':raise ValueError('; '.join(smp['issues']))
                payload=copy.deepcopy(old);snap=payload['snapshot']
                now=capture(cur,lid,datetime.fromisoformat(snap['occurred_at']))
                for key in ('subject','organization','settings','fields','psk','report_blocks','uid'):snap[key]=now[key]
                snap['loan'].update(before['loan']);snap['schedule']=before['schedule']
                included_ids={p[0] for p in included};snap['payments']=[p for p in now['payments'] if p['id'] in included_ids]
                snap['accounting_date']=str(day)
                payload['facts'],_=facts_from_snapshot(snap)
                payload['debt_evidence']={'as_of':str(day),'debt':debt,'interest':interest,'preview':preview,'smp':smp,'accounting':accounting}
                payload['blockers']=[];payload['basis']=BASIS
                cur.execute('INSERT INTO nbki_event_payload_revisions(event_id,previous_payload,previous_sha256) VALUES (%s,%s,%s)',(eid,Json(old),old_digest))
                cur.execute('UPDATE nbki_crm_events SET event_payload=%s,evidence_sha256=%s,subject_uid=%s WHERE id=%s',(Json(payload),checksum(payload),snap['uid'],eid))
                out['restored'].append({'contract':contract,'event_id':eid,'kind':'accrual'})
            except ValueError as exc:
                cur.execute('ROLLBACK TO SAVEPOINT accrual_reconstruction');out['blocked'].append({'contract':contract,'event_id':eid,'reason':str(exc)})
            cur.execute('RELEASE SAVEPOINT accrual_reconstruction')
        cur.execute("SELECT e.id FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id WHERE e.org_id=3 AND l.bki_enabled AND e.event_payload IS NOT NULL AND e.status IN ('new','rejected') AND NOT EXISTS(SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids) AND p.status<>'cancelled') ORDER BY e.id")
        for (eid,) in cur.fetchall():
            cur.execute('SAVEPOINT metadata')
            try:
                cur.execute('SELECT event_payload FROM nbki_crm_events WHERE id=%s',(eid,));old=cur.fetchone()[0]
                if not old.get('debt_evidence'):continue
                refresh_event_metadata(cur,3,eid)
                cur.execute('SELECT event_payload FROM nbki_crm_events WHERE id=%s',(eid,))
                if cur.fetchone()[0]==old:cur.execute('ROLLBACK TO SAVEPOINT metadata')
                else:out['metadata'].append(eid)
            except ValueError:
                cur.execute('ROLLBACK TO SAVEPOINT metadata')
            finally:cur.execute('RELEASE SAVEPOINT metadata')
        cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
          VALUES ('По поручению пользователя','admin','reconstruct','nbki_history',3,'ФИН ФОРМУЛА',%s)''',(json.dumps(dict(out,basis=BASIS),ensure_ascii=False),))
    return out

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        conn.set_session(isolation_level='REPEATABLE READ')
        result=run(conn)
        if not args.apply:conn.rollback()
    print(json.dumps(result,ensure_ascii=False,default=str))
