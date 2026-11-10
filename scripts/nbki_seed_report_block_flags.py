"""One-time migration of per-loan FL_22/FL_55 presence precedent from historical XML.

Not part of outgoing generation. Across the organization's own historical
NBKI files (several already confirmed accepted), FL_22_TotalCost and
FL_55_Application presence is consistent per deal UID - always included or
always omitted across that UID's whole event history, never mixed. This
reuses that precedent as the only evidence-based answer for a loan with no
confirmed decision of its own; it never invents application data.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import xml.etree.ElementTree as ET
from datetime import datetime

import psycopg2
from psycopg2.extras import Json


def collect_block_flags(cur, org_id: int):
    cur.execute("SELECT id,xml_gzip FROM nbki_source_files WHERE org_id=%s", (org_id,))
    seen_total_cost = set()
    latest_application = {}
    for file_id, packed in cur.fetchall():
        raw = gzip.decompress(bytes(packed))
        if len(raw) > 25 * 1024 * 1024 or b'<!DOCTYPE' in raw.upper():
            raise ValueError(f'Недопустимый исторический XML #{file_id}')
        root = ET.fromstring(raw)
        for subject in root.findall('./Data/Subject_FL'):
            for event in subject.findall('./Events/FL_Event_2_3'):
                uid = (event.findtext('./FL_17_DealUid/uid') or '').strip()
                occurred = event.get('eventDateTime')
                if not uid or not occurred:
                    continue
                if event.find('./FL_22_TotalCost') is not None:
                    seen_total_cost.add(uid)
                application = event.find('./FL_55_Application')
                if application is None:
                    continue
                event_time = datetime.fromisoformat(occurred)
                old = latest_application.get(uid)
                if old is None or event_time > old[0]:
                    block = {child.tag: child.text for child in application}
                    latest_application[uid] = (event_time, block, file_id)
    return seen_total_cost, latest_application


def seed(cur, org_id: int, apply: bool) -> dict:
    seen_total_cost, latest_application = collect_block_flags(cur, org_id)
    cur.execute("""SELECT l.id,d.uid
        FROM loans l JOIN nbki_event_deals d ON d.loan_id=l.id
        WHERE l.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND d.role='borrower' AND d.match_status='matched'
        ORDER BY l.id""", (org_id,))
    seen_loans = set()
    result = {'matched': 0, 'inserted': 0, 'already_present': [],
              'with_total_cost': 0, 'with_application': 0}
    for loan_id, uid in cur.fetchall():
        if loan_id in seen_loans:
            continue
        seen_loans.add(loan_id)
        result['matched'] += 1
        cur.execute("SELECT 1 FROM nbki_loan_report_blocks WHERE loan_id=%s", (loan_id,))
        if cur.fetchone():
            result['already_present'].append(loan_id)
            continue
        include_total_cost = uid in seen_total_cost
        application = latest_application.get(uid)
        include_application = application is not None
        if include_total_cost:
            result['with_total_cost'] += 1
        if include_application:
            result['with_application'] += 1
        if apply:
            cur.execute("""INSERT INTO nbki_loan_report_blocks
                (loan_id,org_id,include_total_cost,include_application,
                 application_block,source_file_id,basis)
                VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (loan_id, org_id, include_total_cost, include_application,
                 Json(application[1]) if application else None,
                 application[2] if application else None,
                 'historical_xml_precedent'))
        result['inserted'] += 1
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org-id', type=int, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.org_id <= 0:
        parser.error('org-id должен быть положительным')
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor() as cur:
            result = seed(cur, args.org_id, args.apply)
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
