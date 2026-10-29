"""One-time migration of deal classification codes from imported XML to CRM.

This command is NOT part of outgoing generation. It reads historical files
already imported into CRM, selects the latest unambiguous codes by UID, and
stores them as a versioned CRM master-data record. Accounting amounts, loan
terms and payments are never copied from XML.
"""

from __future__ import annotations

import argparse
import gzip
import os
import xml.etree.ElementTree as ET
from datetime import datetime

import psycopg2


def collect_codes(cur, org_id: int) -> dict[str, tuple]:
    cur.execute("SELECT id,xml_gzip FROM nbki_source_files WHERE org_id=%s", (org_id,))
    latest = {}
    for file_id, packed in cur.fetchall():
        raw = gzip.decompress(bytes(packed))
        if len(raw) > 25 * 1024 * 1024 or b'<!DOCTYPE' in raw.upper():
            raise ValueError(f'Недопустимый исторический XML #{file_id}')
        root = ET.fromstring(raw)
        for subject in root.findall('./Data/Subject_FL'):
            for event in subject.findall('./Events/*'):
                uid = (event.findtext('./FL_17_DealUid/uid') or '').strip()
                deal = event.find('./FL_18_Deal')
                occurred = event.get('eventDateTime')
                if not uid or deal is None or not occurred:
                    continue
                codes = tuple((deal.findtext(key) or '').strip()
                              for key in ('code','kindCode','purposeCode'))
                if not all(codes):
                    continue
                event_time = datetime.fromisoformat(occurred)
                old = latest.get(uid)
                if old is None or event_time > old[0]:
                    latest[uid] = (event_time, codes, file_id)
    return latest


def seed(cur, org_id: int, apply: bool) -> dict:
    latest = collect_codes(cur, org_id)
    cur.execute("""SELECT l.id,d.uid
        FROM loans l JOIN nbki_event_deals d ON d.loan_id=l.id
        WHERE l.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND d.role='borrower' AND d.match_status='matched'
        ORDER BY l.id""", (org_id,))
    seen_loans = set()
    result = {'matched': 0, 'inserted': 0, 'no_xml_code': [],
              'conflict_or_invalid': [], 'already_versioned': []}
    for loan_id, uid in cur.fetchall():
        if loan_id in seen_loans:
            result['conflict_or_invalid'].append(loan_id)
            continue
        seen_loans.add(loan_id)
        result['matched'] += 1
        item = latest.get(uid)
        if item is None:
            result['no_xml_code'].append(loan_id)
            continue
        event_time, (deal_code, kind_code, purpose_code), file_id = item
        # The supplied October XML has purposeCode=17, rejected by XSD 5.1;
        # loan 143 has a user-confirmed 1C purpose error. Do not seed either.
        if purpose_code == '17' or loan_id == 143:
            result['conflict_or_invalid'].append(loan_id)
            continue
        cur.execute("SELECT 1 FROM nbki_loan_terms_versions WHERE loan_id=%s LIMIT 1",
                    (loan_id,))
        if cur.fetchone():
            result['already_versioned'].append(loan_id)
            continue
        if apply:
            cur.execute("""INSERT INTO nbki_loan_terms_versions
                (loan_id,valid_from,deal_code,kind_code,purpose_code,basis)
                VALUES (%s,%s,%s,%s,%s,%s)""",
                (loan_id, event_time, deal_code, kind_code, purpose_code,
                 f'historical_xml_seed:file:{file_id}:uid:{uid}'))
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
        print(result)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
