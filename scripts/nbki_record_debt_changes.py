"""Capture changed debt without creating payments. Run daily after CRM accruals."""
import os
import sys
from datetime import datetime, date
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
                    SELECT 1 FROM nbki_lifecycle_operations op WHERE op.loan_id=l.id AND op.kind='close') ORDER BY id""")
            loans = cur.fetchall()
        for lid,org in loans:
            try:
                with conn.cursor() as cur:
                    cur.execute('SELECT id FROM loans WHERE id=%s FOR UPDATE',(lid,))
                    when = datetime.now(MSK).replace(microsecond=0)
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
