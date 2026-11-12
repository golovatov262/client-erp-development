"""Capture debt changes from posted CRM operations, independent of bank import."""
import os
import sys
from datetime import datetime
from pathlib import Path
import psycopg2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.nbki_lifecycle import capture, facts_from_snapshot, debt_evidence, record_operation, MSK
from backend.nbki_debt_changes import review_debt_change, evidence_state, initial_snapshot


def signature(evidence):
    return evidence_state(evidence)


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
                    state = capture(cur,lid,when)
                    # New/unmatched loans are outside this existing-obligation workflow.
                    if not state.get('uid'):
                        conn.rollback()
                        continue
                    _, principal = facts_from_snapshot(state)
                    evidence = debt_evidence(cur,state,principal)
                    review = review_debt_change(cur,org,state['uid'],when,evidence)
                    if review['decision']=='missing_baseline' and initial_snapshot(cur,org,state['uid']):
                        # Wait for the first receipt instead of creating daily bootstrap duplicates.
                        cur.execute('DELETE FROM nbki_debt_scan_issues WHERE loan_id=%s',(lid,))
                        conn.commit()
                        continue
                    if review['decision']=='unchanged':
                        cur.execute('DELETE FROM nbki_debt_scan_issues WHERE loan_id=%s',(lid,))
                        conn.commit()
                        continue
                    if review['decision'] not in ('changed','periodic','initial_snapshot'):
                        raise ValueError(review['reason'])
                    cur.execute("""SELECT event_payload FROM nbki_crm_events WHERE loan_id=%s
                        AND event_kind='debt_change' AND event_payload IS NOT NULL
                        AND status NOT IN ('excluded','accepted')
                        AND NOT EXISTS (SELECT 1 FROM nbki_file_events fe JOIN nbki_source_files sf ON sf.id=fe.source_file_id
                            WHERE fe.crm_event_id=nbki_crm_events.id AND sf.archived_at IS NULL AND fe.delivery_status='accepted')
                        ORDER BY id DESC LIMIT 1""",(lid,))
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
