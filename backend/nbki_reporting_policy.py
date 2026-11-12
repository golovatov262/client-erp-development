"""Sparse debt reporting: payment, contractual due date, new arrears, or 31 days.

Daily observations are internal bookkeeping, not outgoing daily snapshots.
"""
import copy
from datetime import date,datetime,time
from decimal import Decimal
from zoneinfo import ZoneInfo
from psycopg2.extras import Json

MSK=ZoneInfo('Europe/Moscow')


def observation(evidence):
    rows=evidence['debt'].get('rows',[])
    dates=sorted({r['due'] for r in rows if Decimal(r.get('overdue_principal','0'))+Decimal(r.get('overdue_interest','0'))>0})
    day=date.fromisoformat(evidence['as_of'])
    return {'as_of':evidence['as_of'],'overdue_dates':dates,'over90':bool(dates and (day-date.fromisoformat(dates[0])).days>90)}


def reasons(snapshot,evidence,previous,last_report_day):
    day=date.fromisoformat(evidence['as_of'])
    due=any(r['payment_date']==day.isoformat() and r['status'] not in ('holiday','holiday_pending')
            and Decimal(str(r['payment_amount']))>0 for r in snapshot['schedule'])
    if previous and previous.get('as_of'):
        missed=[r['payment_date'] for r in snapshot['schedule'] if previous['as_of']<r['payment_date']<day.isoformat()
                and r['status'] not in ('holiday','holiday_pending') and Decimal(str(r['payment_amount']))>0]
        if missed:
            raise ValueError('Пропущена фиксация срока платежа '+min(missed)+': необходим исторический снимок CRM')
    current=observation(evidence)
    previous=previous if previous is not None else current
    new_arrears=bool(set(current['overdue_dates'])-set(previous.get('overdue_dates',[])))
    new_arrears=new_arrears or (current['over90'] and not previous.get('over90',False))
    if due:return [('due_accrual','due-accrual:'+day.isoformat()),('payment_due','due:'+day.isoformat())]
    if new_arrears:return [('overdue','overdue:'+day.isoformat())]
    if last_report_day and (day-last_report_day).days>=31:
        return [('periodic','periodic:'+last_report_day.isoformat())]
    return []


def payload_from_state(snapshot,facts,evidence,kind,basis,blockers=None):
    return {'snapshot':snapshot,'facts':facts,'debt_evidence':evidence,'event_name':'FL_Event_2_3',
            'basis':basis,'blockers':blockers or [],'reporting_kind':kind,
            'include_due_today':kind in ('payment_accrual','due_accrual')}


def store_event(cur,org,loan_id,when,payload,key,kind,day,following_event_id=None):
    if __package__:
        from .nbki_lifecycle import checksum,encoded
    else:
        from nbki_lifecycle import checksum,encoded
    import json
    payload=json.loads(encoded(payload))
    cur.execute('''INSERT INTO nbki_debt_reporting_triggers(loan_id,trigger_key,kind,trigger_date,following_event_id)
        VALUES (%s,%s,%s,%s,%s) ON CONFLICT(loan_id,trigger_key) DO NOTHING RETURNING id''',
        (loan_id,key,kind,day,following_event_id))
    row=cur.fetchone()
    if not row:return False
    trigger_id=row[0]
    cur.execute('''INSERT INTO nbki_crm_events(org_id,loan_id,source_type,source_id,event_kind,
        event_occurred_at,event_payload,evidence_sha256,event_name,subject_uid)
        VALUES (%s,%s,'debt_reporting',%s,'debt_change',%s,%s,%s,'FL_Event_2_3',%s) RETURNING id''',
        (org,loan_id,trigger_id,when,Json(payload),checksum(payload),(payload.get('facts') or {}).get('uid')))
    eid=cur.fetchone()[0]
    cur.execute('UPDATE nbki_debt_reporting_triggers SET event_id=%s WHERE id=%s',(eid,trigger_id))
    return True


def observe_and_record(cur,org,loan_id,when,snapshot,facts,evidence):
    cur.execute('SELECT state FROM nbki_debt_reporting_observations WHERE loan_id=%s',(loan_id,))
    row=cur.fetchone();previous=row[0] if row else None
    if previous is None:
        cur.execute("""SELECT event_payload->'debt_evidence' FROM nbki_crm_events
            WHERE loan_id=%s AND event_payload->'debt_evidence' IS NOT NULL
              AND status<>'excluded' ORDER BY event_occurred_at DESC NULLS LAST,id DESC LIMIT 1""",(loan_id,))
        row=cur.fetchone()
        if row and row[0]:previous=observation(row[0])
    # A pending event remains visible for dispatch; do not make a fresh daily
    # copy while waiting for its receipt. Its date starts the next 31-day cycle.
    cur.execute("""SELECT MAX(day) FROM (
        SELECT (event_occurred_at AT TIME ZONE 'Europe/Moscow')::date AS day FROM nbki_crm_events
        WHERE loan_id=%s AND status<>'excluded' AND (event_kind IN ('payment','debt_change','terms_change'))
        UNION ALL SELECT (fe.event_time AT TIME ZONE 'Europe/Moscow')::date FROM nbki_file_events fe
        JOIN nbki_source_files sf ON sf.id=fe.source_file_id LEFT JOIN nbki_deals d ON d.id=fe.deal_id
        WHERE sf.org_id=%s AND sf.archived_at IS NULL AND fe.delivery_status='accepted'
          AND COALESCE(fe.source_uid,d.uid)=%s AND fe.event_name IN ('FL_Event_2_1','FL_Event_2_3')
        ) x WHERE day<=%s""",(loan_id,org,snapshot['uid'],when.date()))
    last=cur.fetchone()[0] or date.fromisoformat(snapshot['loan']['start_date'])
    labels={'due_accrual':'Начисления на дату планового платежа','payment_due':'Наступление срока платежа',
            'overdue':'Возникновение просрочки или переход за 90 дней','periodic':'Обновление задолженности за 31 день'}
    created=0
    for kind,key in reasons(snapshot,evidence,previous,last):
        payload=payload_from_state(snapshot,facts,evidence,kind,labels[kind])
        created+=bool(store_event(cur,org,loan_id,when,payload,key,kind,when.date()))
    cur.execute('''UPDATE nbki_debt_reporting_triggers a SET following_event_id=b.event_id
        FROM nbki_debt_reporting_triggers b WHERE a.loan_id=%s AND b.loan_id=a.loan_id
          AND a.kind='due_accrual' AND b.kind='payment_due' AND a.trigger_date=b.trigger_date
          AND a.following_event_id IS NULL''',(loan_id,))
    cur.execute('''INSERT INTO nbki_debt_reporting_observations(loan_id,observed_on,state)
        VALUES (%s,%s,%s) ON CONFLICT(loan_id) DO UPDATE SET observed_on=EXCLUDED.observed_on,
        state=EXCLUDED.state,observed_at=now()''',(loan_id,when.date(),Json(observation(evidence))))
    return created


def prepare_payment_accrual(cur,loan_id,payment_day,event_at):
    if __package__:
        from .nbki_lifecycle import capture,facts_from_snapshot,debt_evidence
    else:
        from nbki_lifecycle import capture,facts_from_snapshot,debt_evidence
    cur.execute('SELECT bki_enabled,org_id FROM loans WHERE id=%s',(loan_id,))
    enabled,org=cur.fetchone()
    if not enabled:return None
    # A date-only calculation is held blocked until the actual payment time is
    # confirmed; this temporary calculation time is never exported as an event.
    calculation_at=event_at or datetime.combine(payment_day,time(23,59,59),MSK)
    snapshot={'loan':{'id':loan_id,'org_id':org},'occurred_at':calculation_at.isoformat()}
    facts={};evidence=None;blockers=[]
    try:
        snapshot=capture(cur,loan_id,calculation_at)
        facts,principal=facts_from_snapshot(snapshot)
        evidence=debt_evidence(cur,snapshot,principal)
    except (ValueError,TypeError) as exc:blockers.append(str(exc))
    return payload_from_state(snapshot,facts,evidence,'payment_accrual','Начисления непосредственно перед платежом CRM',blockers)


def record_payment_accrual(cur,loan_id,payment_id,event_id,event_at,payload):
    if payload is None or event_id is None:return
    day=date.fromisoformat(payload['debt_evidence']['as_of'] if payload.get('debt_evidence') else payload['snapshot']['occurred_at'][:10])
    if not event_at:payload=dict(payload,time_pending=True)
    payload['related_payment_id']=payment_id
    store_event(cur,payload['snapshot']['loan']['org_id'],loan_id,event_at,payload,
                'payment:'+str(payment_id),'payment_accrual',day,event_id)


def bind_payment_time(cur,payment_id,event_at,payment_day):
    if __package__:
        from .nbki_lifecycle import checksum
    else:
        from nbki_lifecycle import checksum
    cur.execute('''SELECT e.id,e.event_payload,e.evidence_sha256,t.trigger_date FROM nbki_crm_events e
        JOIN nbki_debt_reporting_triggers t ON t.event_id=e.id
        JOIN nbki_crm_events p ON p.id=t.following_event_id
        WHERE p.source_type='loan_payment' AND p.source_id=%s FOR UPDATE OF e''',(payment_id,))
    row=cur.fetchone()
    if not row:return
    eid,p,digest,day=row
    p=copy.deepcopy(p)
    if checksum(p)!=digest.strip():raise ValueError('Нарушена контрольная сумма начислений до платежа')
    previous_at=p['snapshot'].get('occurred_at')
    if event_at and not p.get('time_pending') and previous_at and datetime.fromisoformat(previous_at)==event_at and str(day)==str(payment_day):
        return
    if __package__:
        from .nbki_delivery import check_delivery
        from .nbki_lifecycle import facts_from_snapshot
    else:
        from nbki_delivery import check_delivery
        from nbki_lifecycle import facts_from_snapshot
    check_delivery(cur,p['snapshot']['loan']['org_id'],eid)
    if str(day)!=str(payment_day):
        p['financial_reconstruction_required']=True
        p.setdefault('blockers',[]).append('Дата платежа изменена: нужен подтверждённый снимок начислений на новую дату')
    else:
        p['time_pending']=event_at is None
        if event_at:
            p['snapshot']['occurred_at']=event_at.isoformat()
            if p.get('facts'):
                try:p['facts'],_=facts_from_snapshot(p['snapshot'])
                except ValueError as exc:p.setdefault('blockers',[]).append(str(exc))
    cur.execute('INSERT INTO nbki_event_payload_revisions(event_id,previous_payload,previous_sha256) VALUES (%s,%s,%s)',(eid,Json(row[1]),digest))
    cur.execute('UPDATE nbki_crm_events SET event_occurred_at=%s,event_payload=%s,evidence_sha256=%s WHERE id=%s',
                (event_at,Json(p),checksum(p),eid))


def reporting_pairs(cur,org,ids):
    cur.execute('''SELECT t.event_id,t.following_event_id FROM nbki_debt_reporting_triggers t
        JOIN nbki_crm_events e ON e.id=t.event_id WHERE e.org_id=%s AND t.following_event_id IS NOT NULL
          AND (t.event_id=ANY(%s) OR t.following_event_id=ANY(%s)) ORDER BY t.id''',(org,ids,ids))
    return cur.fetchall()


def paired_ids(cur,org,ids):
    pairs=reporting_pairs(cur,org,ids)
    if not pairs:return ids
    if __package__:
        from .nbki_delivery import delivery_state
    else:
        from nbki_delivery import delivery_state
    related={i for pair in pairs for i in pair};result=[]
    for before,after in pairs:
        for eid in (before,after):
            if delivery_state(cur,org,eid)['status'] not in ('accepted','exported'):result.append(eid)
    result.extend(i for i in ids if i not in related)
    return list(dict.fromkeys(result))
