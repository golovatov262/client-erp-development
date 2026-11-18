"""Restore three operator-confirmed historical closures from final-payment evidence.

Explicit scoped repair: never bypass the live operation's today-only guard.
Dry-run by default. Does not alter payments, balances or financial schedules.
"""
import argparse
import copy
import json
import os
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from nbki_lifecycle import capture, facts_from_snapshot, checksum, encoded, MSK
from nbki_crm_export_facts import payment_event_facts
from nbki_crm_debt import estimate_posting_snapshot_interest
from nbki_debt_preview import preview_debt
from nbki_smp import preview_smp_from_posting_snapshot
from nbki_event23_xml import assess_event_generation

KEY='fin-formula-confirmed-historical-closures-20261118'
TARGETS=[(134,2557,904,'300-000043726112025'),(125,2637,918,'300-000042801102025'),(117,2941,593,'300-000041710072025')]


def run(conn):
    result=[]
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(KEY,))
        cur.execute('SELECT inn FROM organizations WHERE id=3');assert cur.fetchone()==('3666209530',)
        for lid,pid,eid,contract in TARGETS:
            cur.execute('SELECT contract_no,status,balance FROM loans WHERE id=%s AND org_id=3 AND bki_enabled FOR UPDATE',(lid,))
            assert cur.fetchone()==(contract,'closed',Decimal('0'))
            cur.execute('SELECT id,basis FROM nbki_lifecycle_operations WHERE loan_id=%s AND kind=\'close\'',(lid,))
            existing=cur.fetchone()
            if existing:
                assert existing[1]==KEY
                cur.execute('SELECT id FROM nbki_crm_events WHERE operation_id=%s ORDER BY id',(existing[0],))
                result.append({'contract':contract,'existing_events':[r[0] for r in cur.fetchall()]});continue
            cur.execute('SELECT payment_date,nbki_event_occurred_at FROM loan_payments WHERE id=%s AND loan_id=%s FOR UPDATE',(pid,lid))
            day,at=cur.fetchone();assert at is not None;at=at.astimezone(MSK)
            assert at.date()==day
            cur.execute('SELECT id FROM loan_payments WHERE loan_id=%s ORDER BY payment_date DESC,id DESC LIMIT 1',(lid,));assert cur.fetchone()==(pid,)
            cur.execute('SELECT evidence_sha256,evidence FROM nbki_payment_posting_snapshots WHERE payment_id=%s AND loan_id=%s',(pid,lid))
            digest,frozen=cur.fetchone();assert checksum(frozen)==digest.strip()
            f=payment_event_facts(cur,3,eid);assert f['loan_id']==lid and f['payment_id']==pid
            debt=f['debt_at_posting'];accounting=f['accounting']
            interest=estimate_posting_snapshot_interest(cur,frozen,digest.strip(),lid,pid,day)
            preview=preview_debt(accounting,debt,interest)
            assert preview['status']=='candidate_from_crm_components',preview
            assert Decimal(preview['total_candidate'])==0,(contract,preview)
            assert Decimal(accounting['principal_after'])==0
            smp=preview_smp_from_posting_snapshot(frozen,digest.strip(),lid,pid,day,debt)
            s=capture(cur,lid,at)
            # Financial state comes from the reconciled final receipt, not today's
            # inferred interest. Personal/contract metadata is identified as current.
            s['loan'].update(copy.deepcopy(frozen['after']['loan']))
            s['schedule']=copy.deepcopy(frozen['after']['schedule'])
            s['historical_reconstruction']={'basis':KEY,'payment_id':pid,'payment_event_id':eid,
                'payment_evidence_sha256':digest.strip(),'metadata_source':'current_confirmed_crm',
                'financial_source':'reconciled_final_payment_after_snapshot'}
            facts,principal=facts_from_snapshot(s);assert principal==0
            assert not any(r['collateral_type']=='Поручительство' for r in s['collateral'])
            evidence={'as_of':str(day),'debt':debt,'interest':interest,'preview':preview,'smp':smp,'accounting':accounting}
            snapshot=json.loads(encoded(s))
            cur.execute('''INSERT INTO nbki_lifecycle_operations(org_id,loan_id,kind,occurred_at,reason_code,collateral_reason_code,basis,snapshot)
                VALUES (3,%s,'close',%s,'1','1',%s,%s) RETURNING id''',(lid,at,KEY,Json(snapshot)))
            op=cur.fetchone()[0];events=[]
            for name in ['FL_Event_2_5']+(['FL_Event_2_4'] if s['collateral'] else []):
                payload=json.loads(encoded({'snapshot':snapshot,'facts':facts,'debt_evidence':evidence,
                    'event_name':name,'reason_code':'1','collateral_reason_code':'1','basis':KEY,'blockers':[]}))
                cur.execute('''INSERT INTO nbki_crm_events(org_id,loan_id,source_type,source_id,event_kind,event_occurred_at,
                    evidence_sha256,event_payload,event_name,subject_uid,operation_id)
                    VALUES (3,%s,%s,%s,'close',%s,%s,%s,%s,%s,%s) RETURNING id''',
                    (lid,'lifecycle_'+name,op,at,checksum(payload),Json(payload),name,s['uid'],op))
                event_id=cur.fetchone()[0];ready=assess_event_generation(cur,3,event_id)
                if name=='FL_Event_2_5':assert ready['can_generate_xml'] and ready['xsd_valid'],ready
                events.append({'id':event_id,'name':name,'readiness':ready})
            cur.execute('''UPDATE loan_collateral SET nbki_termination_date=%s,nbki_termination_reason='1',updated_at=now()
                WHERE loan_id=%s AND nbki_termination_date IS NULL''',(day,lid))
            row={'contract':contract,'at':str(at),'events':events};result.append(row)
            cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
                VALUES ('По поручению пользователя','admin','restore','nbki_closure',%s,%s,%s)''',(lid,KEY,json.dumps(row,ensure_ascii=False)))
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    conn=psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        result=run(conn)
        if args.apply:conn.commit()
        else:conn.rollback()
        print(json.dumps({'applied':args.apply,'results':result},ensure_ascii=False,default=str))
    except Exception:
        conn.rollback();raise
    finally:conn.close()
