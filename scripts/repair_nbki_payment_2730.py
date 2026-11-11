"""Restore the owner's approved final installments and audited NBKI evidence.

Run with DATABASE_URL and PYTHONPATH set. Default is a rolled-back rehearsal.
Original loan, schedule, allocations, event and snapshot are archived before
any changes. Payment amounts, allocations and confirmed occurrence time stay intact.
"""
import argparse
import copy
import hashlib
import json
import os
from datetime import date
from decimal import Decimal

import psycopg2
from psycopg2.extras import Json, RealDictCursor

KEY = 'nbki-2730-approved-final-schedule-and-snapshot'
ORIGINAL_SHA = '62fd207e83903e862840a000e595bf3b084c604d661638e15e8b077a8c3b4b68'
APPROVED = {155790: ('2026-11-30', '33970.00'),
            155791: ('2026-12-31', '33970.00'),
            155792: ('2027-01-30', '33970.03')}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def capture(cur):
    result = {}
    for key, table, where in [
        ('loan', 'loans', 'id=16'), ('payment', 'loan_payments', 'id=2730'),
        ('schedule', 'loan_schedule', 'loan_id=16 ORDER BY payment_no,id'),
        ('allocations', 'loan_payment_allocations', 'payment_id=2730 ORDER BY id'),
        ('snapshot', 'nbki_payment_posting_snapshots', 'payment_id=2730'),
        ('event', 'nbki_crm_events', "source_type='loan_payment' AND source_id=2730")]:
        cur.execute('SELECT * FROM ' + table + ' WHERE ' + where)
        result[key] = [dict(row) for row in cur.fetchall()]
    return result


def approved_rows(original):
    require(digest(original) == ORIGINAL_SHA, 'Original snapshot changed')
    rows = {r['id']: r for r in original['before']['schedule'] if r['id'] in APPROVED}
    require(set(rows) == set(APPROVED), 'Approved schedule rows missing')
    for sid, (day, amount) in APPROVED.items():
        row = rows[sid]
        require(row['payment_date'] == day and Decimal(row['payment_amount']) == Decimal(amount),
                'Snapshot differs from approved installments')
        require(Decimal(row['principal_amount']) + Decimal(row['interest_amount']) == Decimal(amount),
                'Original installment components do not reconcile')
    return rows


def revised_evidence(original, corrected_state):
    result = copy.deepcopy(original)
    result['payment_date'] = '2026-11-02'
    for key in ('balance', 'monthly_payment', 'status'):
        result['after']['loan'][key] = corrected_state['loan'][key]
    current = {r['id']: r for r in corrected_state['schedule']}
    result['after']['schedule'] = [copy.deepcopy(current[r['id']])
        if r['id'] in (*APPROVED, 155789) else r for r in result['after']['schedule']]
    result['after']['paid_penalty_to_date'] = corrected_state['paid_penalty_to_date']
    require(Decimal(str(result['before']['loan']['balance'])) - Decimal(str(result['after']['loan']['balance']))
            == Decimal('33450.49'), 'Snapshot principal delta differs from payment')
    result['basis'] = 'Audited correction using original evidence and owner-approved schedule; not an original posting snapshot'
    result['correction'] = {'key': KEY, 'original_evidence_sha256': ORIGINAL_SHA,
                            'confirmed_event_at_msk': '2026-11-02T12:00:15+03:00',
                            'approved_installments': list(APPROVED.values())}
    return json.loads(canonical(result))


def run(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(162730)')
        for table, where in [('loans', 'id=16'), ('loan_payments', 'loan_id=16'),
                             ('loan_schedule', 'loan_id=16'),
                             ('nbki_payment_posting_snapshots', 'payment_id=2730'),
                             ('nbki_crm_events', 'id=36')]:
            cur.execute('SELECT * FROM ' + table + ' WHERE ' + where + ' FOR UPDATE')
            cur.fetchall()
        cur.execute('SELECT 1 FROM loan_payment_correction_audit WHERE correction_key=%s', (KEY,))
        require(cur.fetchone() is None, 'Correction already applied')
        before = capture(cur)
        loan, payment = before['loan'][0], before['payment'][0]
        snapshot, event = before['snapshot'][0], before['event'][0]
        require(loan['org_id'] == 2 and loan['contract_no'] == '100-000000527012022'
                and loan['balance'] == Decimal('96772.08') and loan['monthly_payment'] == Decimal('32484.34'), 'Loan changed')
        require(payment['loan_id'] == 16 and payment['payment_date'] == date(2026, 11, 2)
                and tuple(payment[k] for k in ('amount','principal_part','interest_part','penalty_part'))
                == tuple(map(Decimal, ('35000.00','33450.49','1534.05','15.46'))), 'Payment changed')
        require(payment['nbki_event_time_basis'] == 'operator_entered' and
                payment['nbki_event_occurred_at'].isoformat() == '2026-11-02T09:00:15+00:00'
                and event['event_occurred_at'] == payment['nbki_event_occurred_at'], 'Confirmed event time changed')
        require(event['status'] in ('new', 'needs_data', 'ready') and
                event['evidence_sha256'].strip() == snapshot['evidence_sha256'].strip() == ORIGINAL_SHA, 'Event or snapshot changed')
        require(sum(a['amount'] for a in before['allocations']) == payment['amount'], 'Allocation total mismatch')
        cur.execute("SELECT COUNT(*) AS n FROM loan_payments WHERE loan_id=16 AND (payment_date,id)>(DATE '2026-11-02',2730)")
        require(cur.fetchone()['n'] == 0, 'Later payments exist')
        rows = approved_rows(snapshot['evidence'])
        current = {r['id']: r for r in before['schedule']}
        for sid, row in rows.items():
            require(current[sid]['payment_date'].isoformat() == row['payment_date'], 'Schedule date changed')
            require(current[sid]['payment_amount'] == Decimal('32484.34'), 'Current installment changed')
            cur.execute('''UPDATE loan_schedule SET payment_amount=%s,principal_amount=%s,
                interest_amount=%s,balance_after=%s WHERE id=%s''',
                (row['payment_amount'],row['principal_amount'],row['interest_amount'],row['balance_after'],sid))
        cur.execute('UPDATE loans SET monthly_payment=33970.00,updated_at=NOW() WHERE id=16')
    from backend.nbki_payment_posting_snapshot import capture_loan_state
    with conn.cursor() as cur:
        evidence = revised_evidence(snapshot['evidence'], capture_loan_state(cur,16))
        sha = digest(evidence)
        cur.execute('''UPDATE nbki_payment_posting_snapshots SET payment_date=DATE '2026-11-02',
            evidence=%s,evidence_sha256=%s WHERE payment_id=2730''', (Json(evidence),sha))
        cur.execute('UPDATE nbki_crm_events SET evidence_sha256=%s WHERE id=36', (sha,))
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        after = capture(cur)
        require(after['payment'] == before['payment'] and after['allocations'] == before['allocations'], 'Payment or allocation changed')
        require(after['loan'][0]['balance'] == before['loan'][0]['balance'], 'Loan balance changed')
        cur.execute('''INSERT INTO loan_payment_correction_audit
            (correction_key,loan_id,payment_id,reason,before_state,after_state)
            VALUES (%s,16,2730,%s,%s,%s)''', (KEY,
            'Owner approved original final three installments; preserve corrected payment and original snapshot in audit',
            Json(before,dumps=canonical),Json(after,dumps=canonical)))
    from backend.nbki_event23_xml import build_event23_xml
    with conn.cursor() as cur:
        result = build_event23_xml(cur,2,36)
        require(result['readiness']['can_generate_xml'], 'Event still blocked')
        print('XML event 36 generated; strict XSD:',result['xsd_valid'])
        print('Principal:', result['debt']['term_principal'], 'SMP difference:',result['smp']['principal_difference'])
        print('SMP warnings:',result['smp'].get('warnings',[]))
    return after


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        run(conn)
        if not args.apply:
            conn.rollback()
            print('Rehearsal rolled back')
        else:
            print('Applied; original state archived:',KEY)


if __name__ == '__main__':
    main()
