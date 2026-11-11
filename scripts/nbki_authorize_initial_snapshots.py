"""Authorize specified existing debt events when the delivery archive is unavailable.

Dry run by default. Does not create payments, new-loan events or acceptance records.
"""
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.nbki_debt_changes import review_debt_change,evidence_state
from backend.nbki_lifecycle import checksum
from backend.nbki_event23_xml import build_event23_xml


def authorize(cur,org_id,event_ids,basis):
    ids=sorted(set(event_ids))
    if not ids or not basis.strip():
        raise ValueError('Нужны ID событий и основание отсутствия архива')
    cur.execute("SELECT pg_advisory_xact_lock(hashtext('nbki_daily_debt'))")
    cur.execute('LOCK TABLE nbki_source_files,nbki_file_events IN SHARE MODE')
    cur.execute("""SELECT id,loan_id,event_payload,evidence_sha256 FROM nbki_crm_events
        WHERE org_id=%s AND id=ANY(%s) AND event_kind='debt_change'
          AND status NOT IN ('accepted','excluded') ORDER BY id FOR UPDATE""",(org_id,ids))
    rows=cur.fetchall()
    if [r[0] for r in rows]!=ids:
        raise ValueError('Не все события доступны для первоначального среза')
    results=[]
    for eid,lid,p,digest in rows:
        if checksum(p)!=digest.strip():
            raise ValueError('Контрольная сумма снимка не совпала')
        when=datetime.fromisoformat(p['snapshot']['occurred_at']);uid=p['facts']['uid']
        review=review_debt_change(cur,org_id,uid,when,p['debt_evidence'])
        if review['decision']=='initial_snapshot':
            results.append({'event_id':eid,'already_authorized':True})
            continue
        if review['decision']!='missing_baseline':
            raise ValueError(f'Событие {eid}: {review["reason"]}')
        cur.execute('''INSERT INTO nbki_initial_debt_snapshots
            (event_id,org_id,subject_uid,event_at,financial_state,basis) VALUES (%s,%s,%s,%s,%s,%s)''',
            (eid,org_id,uid,when,Json(evidence_state(p['debt_evidence'])),basis))
        result=build_event23_xml(cur,org_id,eid)
        if not result['xsd_valid']:
            raise ValueError(f'Событие {eid} не прошло строгую XSD-проверку')
        details={'event_id':eid,'decision':'initial_snapshot','basis':basis,
                 'event_at':when.isoformat(),'financial_state':evidence_state(p['debt_evidence']),
                 'acceptance_confirmed':False}
        cur.execute('INSERT INTO nbki_debt_change_reviews(event_id,decision,details) VALUES (%s,%s,%s)',
                    (eid,'initial_snapshot',Json(details)))
        cur.execute('DELETE FROM nbki_debt_scan_issues WHERE loan_id=%s AND org_id=%s',(lid,org_id))
        results.append(details)
    return results


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org-id',type=int,required=True)
    parser.add_argument('--event-ids',type=int,nargs='+',required=True)
    parser.add_argument('--basis',required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    conn=psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor() as cur: result=authorize(cur,args.org_id,args.event_ids,args.basis)
        if args.apply:conn.commit()
        else:conn.rollback()
        print(json.dumps({'applied':args.apply,'events':result},ensure_ascii=False))
    finally:conn.close()
