"""Calculate origination PSK from CRM terms for matched active NBKI loans."""

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from loan_psk import calculate_psk, classify_psk  # noqa: E402


def run(cur, org_id: int, apply: bool = False):
    cur.execute("""SELECT l.id,l.contract_no,l.amount,l.rate,l.term_months,l.start_date,l.schedule_type,
        c.psk_percent,c.psk_amount,c.status,
        (SELECT value->>'value' FROM nbki_1c_loan_facts f,
            LATERAL jsonb_each(f.indicators::jsonb) WHERE f.loan_id=l.id
              AND value->>'code'='ФЛ_18.5/ЮЛ_11.5' LIMIT 1) AS historic_purpose
        FROM loans l LEFT JOIN nbki_contract_cost_facts c ON c.loan_id=l.id
        WHERE l.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND EXISTS (SELECT 1 FROM nbki_event_deals e WHERE e.loan_id=l.id AND e.org_id=l.org_id
            AND e.role='borrower' AND e.match_status='matched')
        ORDER BY l.id""", (org_id,))
    report = {'total': 0, 'cross_checked': 0, 'review': 0, 'errors': [], 'rows': []}
    for loan_id, contract_no, amount, rate, term, start, kind, source_pct, source_sum, source_status, purpose in cur.fetchall():
        report['total'] += 1
        try:
            item = calculate_psk(amount, rate, term, start, kind)
            status, note = classify_psk(item, source_pct, source_sum, source_status)
            if purpose and ('оборотных сред' in purpose.lower() or 'не определена' in purpose.lower()):
                status = 'review'
                note = 'Применимость 353-ФЗ к цели займа не подтверждена: ' + purpose
        except (ValueError, OverflowError) as exc:
            report['errors'].append({'loan_id': loan_id, 'contract_no': contract_no, 'error': str(exc)})
            continue
        report[status] += 1
        report['rows'].append({'loan_id': loan_id, 'contract_no': contract_no,
                               'psk_percent': str(item['percent']), 'psk_amount': str(item['amount']),
                               'status': status, 'note': note})
        if apply:
            cur.execute("""INSERT INTO loan_psk_calculations
                (loan_id,org_id,psk_percent,psk_amount,calculated_on,principal,annual_rate,
                 term_months,schedule_type,calculation_method,verification_status,verification_note)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (loan_id) DO UPDATE SET psk_percent=EXCLUDED.psk_percent,
                  psk_amount=EXCLUDED.psk_amount,calculated_on=EXCLUDED.calculated_on,
                  principal=EXCLUDED.principal,annual_rate=EXCLUDED.annual_rate,
                  term_months=EXCLUDED.term_months,schedule_type=EXCLUDED.schedule_type,
                  calculation_method=EXCLUDED.calculation_method,
                  verification_status=EXCLUDED.verification_status,
                  verification_note=EXCLUDED.verification_note,calculated_at=clock_timestamp()""",
                (loan_id, org_id, item['percent'], item['amount'], start, amount, rate,
                 term, kind, item['method'], status, note))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org-id', type=int, default=2)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            report = run(cur, args.org_id, args.apply)
        if not args.apply:
            conn.rollback()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
