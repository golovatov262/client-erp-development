"""Audit pending debt snapshots; --apply hides only unexported unchanged events."""
import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.nbki_debt_changes import review_debt_change,require_debt_change


def review_queue(cur, apply=False):
    if apply:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext('nbki_daily_debt'))")
        cur.execute('LOCK TABLE nbki_source_files,nbki_file_events IN SHARE MODE')
    cur.execute("""SELECT e.id,e.loan_id,l.contract_no,e.org_id,e.event_payload,
        EXISTS (SELECT 1 FROM nbki_file_events fe JOIN nbki_source_files sf ON sf.id=fe.source_file_id
            WHERE fe.crm_event_id=e.id AND sf.archived_at IS NULL)
        FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
        WHERE e.event_kind='debt_change' AND e.status NOT IN ('accepted','excluded')
        ORDER BY e.id FOR UPDATE OF e""")
    results=[]
    for eid,lid,contract,org,p,linked in cur.fetchall():
        try:
            r=(require_debt_change(cur,org,p,eid) if p.get('reporting_kind') else
               review_debt_change(cur,org,p['facts']['uid'],datetime.fromisoformat(p['snapshot']['occurred_at']),p['debt_evidence']))
        except ValueError as exc:
            r={'decision':'invalid','reason':str(exc),'changes':{}}
        result=dict(event_id=eid,loan_id=lid,contract=contract,org_id=org,linked=linked,**r)
        results.append(result)
        if apply:
            cur.execute('INSERT INTO nbki_debt_change_reviews(event_id,baseline_file_id,decision,details) VALUES (%s,%s,%s,%s)',
                        (eid,r.get('baseline',{}).get('file_id'),r['decision'],Json(result)))
            if r['decision']=='unchanged' and not linked:
                cur.execute("UPDATE nbki_crm_events SET status='excluded' WHERE id=%s",(eid,))
    return results


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    conn=psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor() as cur: results=review_queue(cur,args.apply)
        Path(args.output).write_text(json.dumps(results,ensure_ascii=False,indent=2))
        if args.apply:conn.commit()
        else:conn.rollback()
        print(json.dumps({'applied':args.apply,'counts':dict(Counter(r['decision'] for r in results))},ensure_ascii=False))
    finally:conn.close()
