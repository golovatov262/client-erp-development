"""Import operator-attested history and missing master data; never change accounting.
Dry-run by default. A confirmation note and period end are mandatory for --apply.
"""
import argparse
import os
import sys
from pathlib import Path
from datetime import date
from decimal import Decimal
import xml.etree.ElementTree as ET
import json
import psycopg2
from psycopg2.extras import Json
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from nbki_import import import_payloads, source_profile, parse_source_xml
from nbki_delivery import sync_file_delivery
from loan_psk import calculate_psk, classify_psk


def run(conn, raw, org, period_end, basis, *, confirm_acceptance=True):
    with conn.cursor() as cur:
        profile = source_profile(cur, org)
    if not basis.strip(): raise ValueError('Нужно основание подтверждения принятия')
    parsed = parse_source_xml(raw, **profile)
    if any(e['event_time'] and e['event_time'].date() > period_end for e in parsed['events']):
        raise ValueError('Дата события выходит за подтверждённый период')
    result = import_payloads(conn, [raw], [], org_id=org)
    root = ET.fromstring(raw)
    latest = {}
    for event in root.findall('.//Events/*'):
        if event.tag not in ('FL_Event_2_3', 'UL_Event_2_3'): continue
        uid = event.findtext('./UL_10_DealUid/uid' if event.tag.startswith('UL_') else './FL_17_DealUid/uid')
        if uid not in latest or event.get('eventDateTime') > latest[uid].get('eventDateTime'):
            latest[uid] = event
    with conn.cursor() as cur:
        cur.execute('SELECT id,receipt_signature_verified,acceptance_basis FROM nbki_source_files WHERE org_id=%s AND reg_number=%s FOR UPDATE', (org, parsed['reg_number']))
        fid, verified, old_basis = cur.fetchone()
        if confirm_acceptance and old_basis and old_basis != basis:
            raise ValueError('Файл уже имеет другое подтверждение оператора')
        if confirm_acceptance and not verified:
            cur.execute("""UPDATE nbki_source_files SET receipt_status='accepted',events_accepted=events_count,
                events_rejected=0,acceptance_basis=%s,confirmed_period_end=%s
                WHERE id=%s""", (basis, period_end, fid))
        if confirm_acceptance:
            cur.execute("UPDATE nbki_deals SET reported_accepted=true,accepted_file_id=%s WHERE org_id=%s AND uid=ANY(%s)", (fid, org, list(parsed['deals'])))
        cur.execute("SELECT l.id,d.uid,l.amount,l.rate,l.term_months,l.start_date,l.schedule_type FROM nbki_deals d JOIN loans l ON l.id=d.loan_id AND l.org_id=d.org_id WHERE d.org_id=%s AND d.match_status='matched' AND d.deal_role='borrower' AND d.uid=ANY(%s)", (org, list(latest)))
        rows = cur.fetchall(); result['master_data_loans'] = len(rows)
        result['psk_review'] = []
        for loan, uid, amount, rate, term, start, schedule in rows:
            ev = latest[uid]; deal = ev.find('UL_11_Deal' if ev.tag.startswith('UL_') else 'FL_18_Deal'); cost = ev.find('FL_22_TotalCost'); application = ev.find('FL_55_Application')
            cur.execute('''INSERT INTO loan_bki_fields(loan_id,org_id,loan_uid,deal_code,kind_code,purpose_code,note)
                VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(loan_id) DO NOTHING''',
                (loan,org,uid,deal.findtext('code'),deal.findtext('kindCode'),deal.findtext('purposeCode'),f'Historical XML {parsed["reg_number"]}; {basis}'))
            if ev.tag.startswith('UL_'):
                continue  # Preserve legal-entity identifiers without inventing consumer PSK/FL blocks.
            cur.execute('''INSERT INTO nbki_loan_report_blocks(loan_id,org_id,include_total_cost,include_application,application_block,source_file_id,basis)
                VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(loan_id) DO NOTHING''',
                (loan,org,cost is not None,application is not None,Json({x.tag:x.text for x in application}) if application is not None else None,fid,'operator_confirmed_historical_xml' if confirm_acceptance else 'historical_xml_master_data'))
            if cost is not None:
                pct, rub = cost.findtext('minPercentCost'), cost.findtext('minCost')
                if pct is None or rub is None: continue
                status, note = 'review', 'ПСК из исторического XML; требуется сверка с договором'
                try:
                    calc = calculate_psk(amount, rate, term, start, schedule)
                    status, note = classify_psk(calc, Decimal(pct), Decimal(rub), 'source_consistent')
                except (ValueError,OverflowError): pass
                cur.execute('''INSERT INTO loan_psk_calculations(loan_id,org_id,psk_percent,psk_amount,calculated_on,principal,annual_rate,term_months,schedule_type,calculation_method,verification_status,verification_note)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(loan_id) DO NOTHING''',
                    (loan,org,pct,rub,start,amount,rate,term,schedule,'historical_xml:'+parsed['reg_number'],status,note))
                if status=='review':result['psk_review'].append(loan)
        sync_file_delivery(cur, fid)
        result['operator_confirmed_events'] = parsed['events_count'] if confirm_acceptance else 0
        result['acceptance_basis'] = basis if confirm_acceptance else None
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('xml');p.add_argument('--org-id',type=int,required=True)
    p.add_argument('--period-end',type=date.fromisoformat,required=True)
    p.add_argument('--metadata-only',action='store_true',help='Import master data without attesting NBKI acceptance')
    p.add_argument('--basis',required=True);p.add_argument('--apply',action='store_true')
    args=p.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        result=run(conn,Path(args.xml).read_bytes(),args.org_id,args.period_end,args.basis,confirm_acceptance=not args.metadata_only)
        if not args.apply:conn.rollback()
    print(json.dumps(result,ensure_ascii=False,default=str))
