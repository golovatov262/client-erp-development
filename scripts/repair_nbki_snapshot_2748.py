"""Reconcile NBKI evidence with the audited loan-60 correction.

Original evidence is archived in loan_payment_correction_audit. No loan,
payment, allocation or schedule amount is changed. Default is rollback.
"""
import argparse
import copy
import hashlib
import json
import os
from decimal import Decimal

import psycopg2
from psycopg2.extras import Json, RealDictCursor

SOURCE_KEY = 'loan-60-payment-2748-2026-11-10'
KEY = 'nbki-snapshot-2748-audited-correction-v1'
ORIGINAL_SHA = 'b68f6c5b8241069e7d51b73a6282a0fa8fd468b9f806e44d45b658e82bdd4789'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def corrected_evidence(original, audit):
    require(digest(original) == ORIGINAL_SHA, 'Original snapshot changed')
    before, after = audit['before_state'], audit['after_state']
    payment = after['payment'][0]
    require(payment['id'] == 2748 and payment['loan_id'] == 60
            and payment['payment_date'] == '2026-11-10', 'Correction identifies another operation')
    require(Decimal(payment['principal_part']) == Decimal('2818.00')
            and Decimal(payment['interest_part']) == Decimal('35182.00')
            and Decimal(payment['penalty_part']) == 0, 'Unexpected corrected amounts')
    result = copy.deepcopy(original)
    state = result['after']
    for key in state['loan']:
        state['loan'][key] = after['loan'][0][key]
    schedule = {row['id']: row for row in after['schedule']}
    for row in state['schedule']:
        if row['id'] not in schedule:
            continue
        for key in row:
            if key in schedule[row['id']]:
                row[key] = schedule[row['id']][key]
        # Retain preceding payments' coverage, replace only the audited delta.
        for key, component in [('covered_interest_v2', 'interest'),
                               ('covered_principal_v2', 'principal'),
                               ('covered_total_v2', None)]:
            def total(version):
                return sum((Decimal(a['amount']) for a in version['allocations']
                            if a['schedule_id'] == row['id'] and
                            (component is None or a['component'] == component)), Decimal(0))
            row[key] = str(Decimal(row[key]) - total(before) + total(after))
    loan_before = Decimal(result['before']['loan']['balance'])
    loan_after = Decimal(state['loan']['balance'])
    require(loan_before - loan_after == Decimal(payment['principal_part']), 'Principal delta does not reconcile')
    result['basis'] = 'Audited correction of original CRM posting evidence; not an original posting snapshot'
    result['correction'] = {'key': KEY, 'source_audit_key': SOURCE_KEY,
                            'source_audit_sha256': digest(audit),
                            'original_evidence_sha256': ORIGINAL_SHA,
                            'source_corrected_at': str(audit['corrected_at'])}
    return json.loads(canonical(result))


def run(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(602748)')
        cur.execute('SELECT id FROM loans WHERE id=60 FOR UPDATE')
        cur.execute('SELECT id FROM loan_payments WHERE id=2748 FOR UPDATE')
        cur.execute('SELECT * FROM loan_payment_correction_audit WHERE correction_key=%s', (KEY,))
        require(cur.fetchone() is None, 'Snapshot correction already recorded')
        cur.execute('SELECT * FROM loan_payment_correction_audit WHERE correction_key=%s', (SOURCE_KEY,))
        audit = dict(cur.fetchone() or {})
        require(bool(audit), 'Source correction audit missing')
        # Source audit is authoritative only if current accounting still matches it.
        for table, where, part in [('loans', 'id=60', 'loan'),
                                   ('loan_payments', 'id=2748', 'payment'),
                                   ('loan_payment_allocations', 'payment_id=2748 ORDER BY id', 'allocations'),
                                   ('loan_schedule', 'loan_id=60 AND payment_no>=28 ORDER BY payment_no', 'schedule')]:
            cur.execute('SELECT * FROM ' + table + ' WHERE ' + where)
            current = json.loads(canonical([dict(row) for row in cur.fetchall()]))
            expected = copy.deepcopy(audit['after_state'][part])
            # Separately authorized event-time completion is unrelated to sums.
            if part == 'payment':
                for rows in (current, expected):
                    for row in rows:
                        row.pop('nbki_event_occurred_at', None)
                        row.pop('nbki_event_time_basis', None)
            require(current == expected, f'Current {table} differs from source audit')
        cur.execute("SELECT COUNT(*) AS n FROM loan_payments WHERE loan_id=60 AND (payment_date,id)>(DATE '2026-11-10',2748)")
        require(cur.fetchone()['n'] == 0, 'Later payments exist')
        cur.execute('SELECT * FROM nbki_payment_posting_snapshots WHERE payment_id=2748 FOR UPDATE')
        old = dict(cur.fetchone())
        cur.execute("SELECT * FROM nbki_crm_events WHERE source_type='loan_payment' AND source_id=2748 FOR UPDATE")
        event = dict(cur.fetchone())
        require(event['status'] in ('new', 'needs_data', 'ready') and
                event['evidence_sha256'].strip() == ORIGINAL_SHA and
                old['evidence_sha256'].strip() == ORIGINAL_SHA, 'Event or evidence changed')
        evidence = corrected_evidence(old['evidence'], audit)
        new_digest = digest(evidence)
        cur.execute('UPDATE nbki_payment_posting_snapshots SET evidence=%s,evidence_sha256=%s WHERE payment_id=2748',
                    (Json(evidence), new_digest))
        cur.execute('UPDATE nbki_crm_events SET evidence_sha256=%s WHERE id=%s', (new_digest, event['id']))
        cur.execute('''INSERT INTO loan_payment_correction_audit
            (correction_key,loan_id,payment_id,reason,before_state,after_state)
            VALUES (%s,60,2748,%s,%s,%s)''',
            (KEY, 'Reconcile NBKI evidence with existing audited correction; original evidence preserved here',
             Json({'snapshot': old, 'event': event}, dumps=canonical),
             Json({'evidence': evidence, 'evidence_sha256': new_digest, 'source_audit_key': SOURCE_KEY})))
    from backend.nbki_event23_xml import build_event23_xml
    with conn.cursor() as cur:
        result = build_event23_xml(cur, 2, event['id'])
        require(result['readiness']['can_generate_xml'], 'Corrected event cannot be generated')
        print('Event', event['id'], 'can generate XML; principal debt', result['debt']['term_principal'],
              '; strict XSD:', result['xsd_valid'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        run(conn)
        if args.apply:
            print('Applied with original evidence archived:', KEY)
        else:
            conn.rollback()
            print('Preview rolled back')


if __name__ == '__main__':
    main()
