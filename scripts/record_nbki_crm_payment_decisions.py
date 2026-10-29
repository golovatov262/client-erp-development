"""Record the six explicit operator choices, after rechecking current candidates.

Dry-run by default. Run with --apply only after migration V0139 is installed.
"""

import argparse
import os
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.nbki_import import resolve_source_org_id
from backend.nbki_1c_reconciliation import reconciliation_report


EXPECTED = {
    '757179a2-655d-11f1-8cf7-18c04d93e059-0': (166, [2493]),
    '29cd3cdb-7688-11f0-8ce2-18c04d93e059-8': (93, [2450]),
    'f492fa1d-8f12-11f0-8ce6-18c04d93e059-a': (100, [2295]),
    'a4cf03cf-3ff0-11ee-8c9f-18c04d93e059-3': (26, [2638, 2639]),
    '08b24432-607e-11ef-8cc7-18c04d93e059-7': (65, [2451]),
    '5a51ce25-76fd-11ee-8ca6-18c04d93e059-8': (29, [2611]),
}
DECISION_SOURCE = 'operator_instruction_2026_10_29'


def validate_targets(report: dict) -> list[tuple]:
    by_uid = {row['uid']: row for row in report['rows']}
    targets = []
    for uid, (loan_id, payment_ids) in EXPECTED.items():
        row = by_uid.get(uid)
        if not row or row['loan_id'] != loan_id:
            raise ValueError(f'Изменилось сопоставление УИД {uid}')
        payment = next((c for c in row['checks'] if c['field'] == 'last_payment'), None)
        if not payment or payment['status'] not in (
                'date_shift_candidate', 'adjacent_sum_candidate', 'resolved_crm'):
            raise ValueError(f'Платёж {uid} больше не является проверенным кандидатом')
        if sorted(p['id'] for p in payment['candidate_payments']) != sorted(payment_ids):
            raise ValueError(f'Изменились записи платежей для УИД {uid}')
        targets.append((loan_id, uid, row['source_id'], row['source_row_num'], payment_ids))
    return targets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            org_id = resolve_source_org_id(cur)
            targets = validate_targets(reconciliation_report(cur, org_id))
            if args.apply:
                for loan_id, uid, source_id, row_num, payment_ids in targets:
                    cur.execute("""SELECT choice,selected_payment_ids,decision_source
                        FROM nbki_1c_reconciliation_decisions
                        WHERE org_id=%s AND loan_id=%s AND source_id=%s AND source_row_num=%s
                          AND field='last_payment'""", (org_id, loan_id, source_id, row_num))
                    existing = cur.fetchone()
                    if existing:
                        if existing != ('crm', payment_ids, DECISION_SOURCE):
                            raise ValueError(f'Конфликт уже записанного решения для {uid}')
                        continue
                    cur.execute("""INSERT INTO nbki_1c_reconciliation_decisions
                        (org_id,loan_id,uid,source_id,source_row_num,field,choice,
                         selected_payment_ids,decision_source)
                        VALUES (%s,%s,%s,%s,%s,'last_payment','crm',%s,%s)""",
                        (org_id, loan_id, uid, source_id, row_num,
                         payment_ids, DECISION_SOURCE))
            print(f'Проверено {len(targets)} решений; запись: {"да" if args.apply else "нет (dry-run)"}')


if __name__ == '__main__':
    main()
