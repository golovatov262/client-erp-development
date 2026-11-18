"""Resolve a single organization's collateral addresses using official FIAS.

Default: create a review plan, no DB changes. --apply-plan applies that plan
with organization/address/current-code guards and a complete FIAS audit trail.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime,timezone
from pathlib import Path
import psycopg2

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from fias_api import resolve_unique_building_okato


def rows(cur,org):
    cur.execute('''SELECT lc.id,l.contract_no,concat_ws(' ',m.last_name,m.first_name,m.middle_name),
        lc.pledger_name,lc.collateral_type,lc.nbki_location_address,lc.nbki_location
      FROM loan_collateral lc JOIN loans l ON l.id=lc.loan_id JOIN members m ON m.id=l.member_id
      WHERE l.org_id=%s AND l.bki_enabled AND l.status IN ('active','overdue','holiday')
        AND lc.collateral_type IN ('Залог недвижимого имущества','Залог движимого имущества')
        AND (lc.nbki_location IS NULL OR lc.nbki_location !~ '^[0-9]{11}$')
      ORDER BY l.contract_no,lc.id''',(org,))
    fields=('collateral_id','contract','borrower','pledger','type','address','old_okato')
    return [dict(zip(fields,r)) for r in cur.fetchall()]


def resolve(conn,org,path):
    with conn.cursor() as cur:
        cur.execute('SELECT inn FROM organizations WHERE id=%s',(org,));organization=cur.fetchone()
        if not organization:raise ValueError('Organization not found')
        records=rows(cur,org)
        cur.execute("SELECT pgp_sym_decrypt(encrypted_value,%s) FROM integration_secrets WHERE key='FIAS_MASTER_TOKEN'",(os.environ['APP_ENCRYPTION_KEY'],))
        secret=cur.fetchone()
        if not secret or not secret[0]:raise ValueError('FIAS token not configured')
        token=secret[0]
    cache={};resolved=[];manual=[]
    plan={'source':'official_fias_unique_building','org_id':org,'org_inn':organization[0],
          'created_at':datetime.now(timezone.utc).isoformat(),'complete':False,'resolved':resolved,'manual':manual}
    for i,record in enumerate(records,1):
        address=(record['address'] or '').strip()
        if not address:
            manual.append(dict(record,reason='Не указан адрес залога'))
        else:
            if address not in cache:
                try:
                    match=resolve_unique_building_okato(address,token)
                    cache[address]=(match,None if match else 'ФИАС не вернул единственного точного совпадения дома с ОКАТО')
                except Exception as exc:
                    cache[address]=(None,'Ошибка обращения к ФИАС: '+type(exc).__name__)
            match,reason=cache[address]
            if match:resolved.append(dict(record,match=match))
            else:manual.append(dict(record,reason=reason))
        path.write_text(json.dumps(plan,ensure_ascii=False,indent=2))
        print(f'Processed {i}/{len(records)}; matched {len(resolved)}; manual {len(manual)}',flush=True)
    plan['complete']=True
    path.write_text(json.dumps(plan,ensure_ascii=False,indent=2))
    print(f'Plan: {len(resolved)} exact matches; {len(manual)} require review',flush=True)
    return plan


def apply(conn,org,path):
    plan=json.loads(path.read_text())
    assert plan.get('complete') and plan['org_id']==org and plan['source'] in ('official_fias_unique_building','official_fias_reviewed_address')
    changed=[];skipped=[]
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(f'nbki-okato-org-{org}',))
        cur.execute('SELECT inn FROM organizations WHERE id=%s',(org,));assert cur.fetchone()==(plan['org_inn'],)
        for r in plan['resolved']:
            m=r['match'];code=m['okato'];assert re.fullmatch(r'\d{11}',code)
            cur.execute('''SELECT lc.nbki_location_address,lc.nbki_location FROM loan_collateral lc JOIN loans l ON l.id=lc.loan_id
              WHERE lc.id=%s AND l.org_id=%s AND l.bki_enabled AND l.status IN ('active','overdue','holiday')
                AND lc.collateral_type IN ('Залог недвижимого имущества','Залог движимого имущества') FOR UPDATE OF lc''',(r['collateral_id'],org))
            row=cur.fetchone()
            if not row or row[0]!=r['address']:
                skipped.append(dict(r,reason='Адрес или принадлежность записи изменились после поиска'));continue
            if row[1]==code:continue
            if row[1]!=r['old_okato'] or re.fullmatch(r'\d{11}',row[1] or ''):
                skipped.append(dict(r,reason='Код изменён после поиска; сохранено текущее значение'));continue
            cur.execute('UPDATE loan_collateral SET nbki_location=%s,updated_at=now() WHERE id=%s',(code,r['collateral_id']))
            cur.execute('''UPDATE nbki_collateral_autofill_audit
                SET before_values=before_values || jsonb_build_object('nbki_location',%s),
                    after_values=after_values || jsonb_build_object('nbki_location',%s) WHERE collateral_id=%s''',(row[1],code,r['collateral_id']))
            cur.execute('''INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
              VALUES ('По поручению пользователя','admin','update','loan_collateral',%s,%s,%s)''',
              (r['collateral_id'],r['contract'],json.dumps({'source':plan['source'],'org_id':org,'original_address':r['address'],
                  'fias_match':m,'before_okato':row[1],'after_okato':code},ensure_ascii=False)))
            changed.append(r)
    return {'org_id':org,'updated':changed,'skipped':skipped,'manual':plan['manual']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--org-id',type=int,required=True);p.add_argument('--plan',type=Path,required=True);p.add_argument('--apply-plan',action='store_true');a=p.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as c:
        if a.apply_plan:
            result=apply(c,a.org_id,a.plan)
            print(json.dumps(result,ensure_ascii=False))
        else:
            c.set_session(readonly=True);resolve(c,a.org_id,a.plan);c.rollback()
