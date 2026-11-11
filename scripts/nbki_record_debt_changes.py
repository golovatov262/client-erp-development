"""Capture changed debt only after previous-day bank statements are posted."""
import os
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
import psycopg2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.nbki_lifecycle import capture, facts_from_snapshot, debt_evidence, record_operation, MSK


def signature(evidence):
    d, i = evidence['debt'], evidence['interest']
    dates = [date.fromisoformat(r['due']) for r in d.get('rows', []) if Decimal(str(r.get('overdue_principal',0)))+Decimal(str(r.get('overdue_interest',0))) > 0]
    over90 = bool(dates and evidence.get('as_of') and (date.fromisoformat(evidence['as_of']) - min(dates)).days > 90)
    return (over90, d.get('term_principal'),d.get('overdue_principal'),d.get('overdue_interest'),
            (d.get('penalty_candidate') or {}).get('remaining'),i.get('remaining_interest_candidate'))


def bank_posting_blocker(cur, org_id, now):
    """Require a completed previous-day statement before reading financial state.

    SHARE conflicts with insertion/update of bank_sync_log. The email importer
    records its running state before posting payments; keep this lock through
    the individual snapshot transaction to close the check/start race.
    """
    cur.execute('LOCK TABLE bank_sync_log IN SHARE MODE')
    # Historical abandoned log entries are not today's import; a fresh
    # successful run and complete statement coverage are required below.
    midnight = now.astimezone(MSK).replace(hour=0,minute=0,second=0,microsecond=0)
    cur.execute("SELECT EXISTS (SELECT 1 FROM bank_sync_log WHERE status='running' AND started_at AT TIME ZONE 'UTC'>=%s)", (midnight,))
    if cur.fetchone()[0]:
        return 'Ожидание БКИ: загрузка или разнесение банковской выписки ещё выполняется'
    cur.execute("SELECT status,finished_at AT TIME ZONE 'UTC' FROM bank_sync_log ORDER BY id DESC LIMIT 1")
    last = cur.fetchone()
    today = now.astimezone(MSK).date()
    if not last or last[0] != 'ok' or not last[1] or last[1].astimezone(MSK).date() != today:
        return 'Ожидание БКИ: нет успешного завершения загрузки банковской выписки за сегодня'
    yesterday = today - timedelta(days=1)
    cur.execute("""SELECT c.id,s.id,s.status FROM bank_connections c
        LEFT JOIN bank_statements s ON s.connection_id=c.id AND s.statement_date=%s
        WHERE c.org_id=%s AND c.is_active ORDER BY c.id""", (yesterday,org_id))
    statements = cur.fetchall()
    if not statements or any(r[1] is None or r[2] != 'loaded' for r in statements):
        return f'Ожидание БКИ: не получены выписки по всем активным счетам за {yesterday:%d.%m.%Y}'
    cur.execute("""SELECT COUNT(*) FROM bank_transactions t
        JOIN bank_statements s ON s.id=t.statement_id
        JOIN bank_connections c ON c.id=s.connection_id
        WHERE c.org_id=%s AND c.is_active AND s.statement_date=%s
          AND t.direction='CREDIT' AND t.amount>0
          AND (t.matched_entity='loan' OR t.matched_entity IS NULL)
          AND (t.match_status<>'applied' OR t.payment_id IS NULL)""", (org_id,yesterday))
    unresolved = cur.fetchone()[0]
    if unresolved:
        return f'Ожидание БКИ: за {yesterday:%d.%m.%Y} не разнесено поступлений по займам или не определено назначение: {unresolved}'
    return None


def run(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(hashtext('nbki_daily_debt'))")
        if not cur.fetchone()[0]:
            return {'created':0,'blocked':[],'already_running':True}
    created, blocked = 0, []
    try:
        with conn.cursor() as cur:
            cur.execute("""SELECT id,org_id FROM loans l WHERE bki_enabled
                AND status IN ('active','overdue','holiday') AND NOT EXISTS (
                    SELECT 1 FROM nbki_lifecycle_operations op WHERE op.loan_id=l.id AND op.kind='close')
                AND EXISTS (
                    SELECT 1 FROM loan_bki_fields f WHERE f.loan_id=l.id AND NULLIF(BTRIM(f.loan_uid),'') IS NOT NULL
                    UNION ALL SELECT 1 FROM nbki_deals d WHERE d.org_id=l.org_id AND d.deal_role='borrower' AND (d.loan_id=l.id OR d.contract_no=l.contract_no) AND NULLIF(BTRIM(d.uid),'') IS NOT NULL
                    UNION ALL SELECT 1 FROM nbki_event_deals d WHERE d.org_id=l.org_id AND d.role='borrower' AND (d.loan_id=l.id OR d.contract_no=l.contract_no) AND NULLIF(BTRIM(d.uid),'') IS NOT NULL) ORDER BY id""")
            loans = cur.fetchall()
        for lid,org in loans:
            try:
                with conn.cursor() as cur:
                    cur.execute('SELECT id FROM loans WHERE id=%s FOR UPDATE',(lid,))
                    when = datetime.now(MSK).replace(microsecond=0)
                    waiting = bank_posting_blocker(cur,org,when)
                    if waiting:
                        raise ValueError(waiting)
                    state = capture(cur,lid,when)
                    # New/unmatched loans are outside this existing-obligation workflow.
                    if not state.get('uid'):
                        conn.rollback()
                        continue
                    _, principal = facts_from_snapshot(state)
                    evidence = debt_evidence(cur,state,principal)
                    cur.execute("""SELECT event_payload FROM nbki_crm_events WHERE loan_id=%s
                        AND event_kind='debt_change' AND event_payload IS NOT NULL ORDER BY id DESC LIMIT 1""",(lid,))
                    previous = cur.fetchone()
                    cur.execute('DELETE FROM nbki_debt_scan_issues WHERE loan_id=%s',(lid,))
                    if previous and previous[0].get('debt_evidence') and signature(previous[0]['debt_evidence']) == signature(evidence):
                        conn.commit()
                        continue
                    record_operation(cur,org,lid,{'kind':'debt_change','occurred_at':when.isoformat(),
                                                 'basis':'Ежедневная фиксация изменения задолженности CRM'})
                conn.commit()
                created += 1
            except (ValueError,TypeError) as exc:
                conn.rollback()
                blocked.append({'loan_id':lid,'reason':str(exc)})
                with conn.cursor() as cur:
                    cur.execute('''INSERT INTO nbki_debt_scan_issues(loan_id,org_id,reason) VALUES (%s,%s,%s)
                        ON CONFLICT(loan_id) DO UPDATE SET reason=EXCLUDED.reason,checked_at=now()''',(lid,org,str(exc)))
                conn.commit()
        return {'created':created,'blocked':blocked}
    finally:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(hashtext('nbki_daily_debt'))")
        conn.commit()


if __name__ == '__main__':
    import json
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        print(json.dumps(run(conn),ensure_ascii=False))
