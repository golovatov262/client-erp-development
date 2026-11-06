"""One-time, guarded correction of loan 28's 2026-10-29 bank payment.

Run with DATABASE_URL in the environment. Defaults to a rolled-back dry run;
pass --apply to commit. The previous values are retained in an audit row.
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


LOAN_ID = 28
PAYMENT_ID = 2709
SEPTEMBER_ID = 138111
OCTOBER_ID = 138112
CORRECTION_KEY = 'loan-28-payment-2709-2026-10-29'
SEPTEMBER_PART = Decimal('20.50')
OCTOBER_INTEREST = Decimal('33309.63')
OCTOBER_PRINCIPAL = Decimal('24841.87')
NEW_BALANCE = Decimal('1878557.58')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def fetch_rows(cur, table, predicate, params):
    cur.execute(f'SELECT * FROM {table} WHERE {predicate}', params)
    return [dict(row) for row in cur.fetchall()]


def capture(cur):
    return {
        'loan': fetch_rows(cur, 'loans', 'id=%s', (LOAN_ID,)),
        'payment': fetch_rows(cur, 'loan_payments', 'id=%s', (PAYMENT_ID,)),
        'allocations': fetch_rows(cur, 'loan_payment_allocations', 'payment_id=%s ORDER BY id', (PAYMENT_ID,)),
        'schedule': fetch_rows(cur, 'loan_schedule', 'loan_id=%s AND payment_no>=35 ORDER BY payment_no', (LOAN_ID,)),
        'penalty_ledger': fetch_rows(cur, 'loan_penalty_daily_accruals',
                                     'loan_id=%s AND schedule_id=%s ORDER BY accrual_date',
                                     (LOAN_ID, OCTOBER_ID)),
        'snapshot': fetch_rows(cur, 'nbki_payment_posting_snapshots', 'payment_id=%s', (PAYMENT_ID,)),
        'event': fetch_rows(cur, 'nbki_crm_events',
                            "source_type='loan_payment' AND source_id=%s", (PAYMENT_ID,)),
    }


def run(cur):
    cur.execute('SELECT pg_advisory_xact_lock(%s)', (281029,))
    cur.execute('SELECT id FROM loans WHERE id=%s FOR UPDATE', (LOAN_ID,))
    require(cur.fetchone(), 'Loan not found')
    cur.execute('SELECT id FROM loan_payments WHERE id=%s FOR UPDATE', (PAYMENT_ID,))
    require(cur.fetchone(), 'Payment not found')
    cur.execute('SELECT id FROM loan_schedule WHERE loan_id=%s AND payment_no>=35 FOR UPDATE', (LOAN_ID,))
    cur.fetchall()
    before = capture(cur)
    loan = before['loan'][0]
    payment = before['payment'][0]
    schedules = {row['payment_no']: row for row in before['schedule']}
    allocations = before['allocations']
    snapshot = before['snapshot'][0]
    event = before['event'][0]

    require(loan['contract_no'] == '100-000040605102023' and
            loan['balance'] == Decimal('1845247.95') and
            loan['monthly_payment'] == Decimal('56393.07'), 'Loan state changed')
    require(payment['loan_id'] == LOAN_ID and payment['payment_date'] == date(2026, 10, 29)
            and payment['amount'] == Decimal('58172.00')
            and payment['principal_part'] == Decimal('58172.00')
            and payment['interest_part'] == 0 and payment['penalty_part'] == 0
            and payment['payment_type'] == 'early_partial'
            and payment['source_ref'] == 'bank_txn:739', 'Payment state changed')
    require(len(allocations) == 2 and
            [(a['schedule_id'], a['component'], a['amount']) for a in allocations] ==
            [(SEPTEMBER_ID, 'principal', SEPTEMBER_PART),
             (None, 'early_principal', Decimal('58151.50'))], 'Allocations changed')
    require(schedules[35]['paid_amount'] == Decimal('58170.50') and
            schedules[35]['status'] == 'paid' and
            schedules[36]['paid_amount'] == 0 and
            schedules[36]['penalty_amount'] ==
            sum((r['amount'] for r in before['penalty_ledger']), Decimal('0')),
            'Schedule state changed')
    require(all(row['paid_amount'] == 0 for no, row in schedules.items() if no > 36),
            'A later schedule period has a payment')
    require(len(before['snapshot']) == len(before['event']) == 1 and event['status'] == 'new'
            and event['evidence_sha256'].strip() == snapshot['evidence_sha256'].strip(),
            'NBKI evidence changed')
    require(len(before['penalty_ledger']) == 4 and
            [row['accrual_date'] for row in before['penalty_ledger']] ==
            [date(2026, 11, day) for day in (3, 4, 5, 6)],
            'October penalty accrual dates changed')
    cur.execute('SELECT COUNT(*) FROM loan_payments WHERE loan_id=%s AND '
                '(payment_date>%s OR (payment_date=%s AND id>%s))',
                (LOAN_ID, payment['payment_date'], payment['payment_date'], PAYMENT_ID))
    require(cur.fetchone()['count'] == 0, 'A newer payment exists')

    original_schedule = {row['payment_no']: row for row in snapshot['evidence']['before']['schedule']}
    require(original_schedule[36]['interest_amount'] == str(OCTOBER_INTEREST) and
            original_schedule[36]['payment_amount'] == '58170.50' and
            original_schedule[35]['paid_amount'] == '58150.00',
            'Original posting snapshot does not match')
    require(SEPTEMBER_PART + OCTOBER_INTEREST + OCTOBER_PRINCIPAL == payment['amount'],
            'Correction does not sum to payment')
    require(snapshot['evidence']['before']['loan']['balance'] == '1903419.95' and
            Decimal(snapshot['evidence']['before']['loan']['balance']) -
            (SEPTEMBER_PART + OCTOBER_PRINCIPAL) == NEW_BALANCE,
            'Corrected balance does not reconcile to posting snapshot')

    cur.execute('''CREATE TABLE IF NOT EXISTS loan_payment_correction_audit (
        correction_key text PRIMARY KEY,
        loan_id integer NOT NULL,
        payment_id integer NOT NULL,
        reason text NOT NULL,
        before_state jsonb NOT NULL,
        after_state jsonb NOT NULL,
        corrected_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )''')
    cur.execute('SELECT 1 FROM loan_payment_correction_audit WHERE correction_key=%s',
                (CORRECTION_KEY,))
    require(cur.fetchone() is None, 'Correction was already applied')

    cur.execute('''UPDATE loan_payment_allocations
        SET schedule_id=%s, component='interest', amount=%s
        WHERE id=%s''', (OCTOBER_ID, OCTOBER_INTEREST, allocations[1]['id']))
    cur.execute('''INSERT INTO loan_payment_allocations
        (payment_id,schedule_id,component,amount,allocation_mode)
        VALUES (%s,%s,'principal',%s,'automatic')''',
        (PAYMENT_ID, OCTOBER_ID, OCTOBER_PRINCIPAL))
    cur.execute('''UPDATE loan_payments SET principal_part=%s,interest_part=%s,
        payment_type='regular' WHERE id=%s''',
        (SEPTEMBER_PART + OCTOBER_PRINCIPAL, OCTOBER_INTEREST, PAYMENT_ID))
    cur.execute('''UPDATE loans SET balance=%s, monthly_payment=%s,
        status='overdue',updated_at=NOW() WHERE id=%s''',
        (NEW_BALANCE, Decimal('58170.50'), LOAN_ID))

    # Restore the untouched contractual schedule from the frozen pre-posting
    # snapshot. The 29 October payment covers all but 19 rubles of October.
    for no, row in schedules.items():
        if no < 36:
            continue
        old = original_schedule[no]
        cur.execute('''UPDATE loan_schedule SET payment_amount=%s,
            principal_amount=%s, interest_amount=%s,balance_after=%s,
            paid_amount=%s,paid_date=%s,payment_id=%s,status=%s,
            overdue_days=%s,penalty_amount=%s WHERE id=%s''',
            (old['payment_amount'], old['principal_amount'], old['interest_amount'],
             old['balance_after'],
             Decimal('58151.50') if no == 36 else Decimal('0'),
             payment['payment_date'] if no == 36 else None,
             PAYMENT_ID if no == 36 else None,
             'overdue' if no == 36 else old['status'],
             max(0, (date.today() - row['payment_date']).days) if no == 36 else old['overdue_days'],
             Decimal('0.01') * len(before['penalty_ledger']) if no == 36 else row['penalty_amount'],
             row['id']))

    # Preserve the original daily rows in the audit record. Their assessed
    # principal basis becomes the actual unpaid 19 rubles, one kopek per day.
    for index, row in enumerate(before['penalty_ledger']):
        require(row['amount'] == Decimal('13.18') and
                row['principal_base'] == Decimal('24101.23'),
                'Unexpected October penalty ledger entry')
        cur.execute('''UPDATE loan_penalty_daily_accruals SET
            principal_base=19.00,amount=0.01,penalty_before=%s,
            penalty_after=%s WHERE id=%s''',
            (Decimal('0.01') * index, Decimal('0.01') * (index + 1), row['id']))

    evidence = copy.deepcopy(snapshot['evidence'])
    after = evidence['before'].copy()
    after['loan'] = dict(after['loan'])
    after['loan'].update(balance=str(NEW_BALANCE), status='active', monthly_payment='58170.50')
    after['schedule'] = [dict(row) for row in after['schedule']]
    for row in after['schedule']:
        if row['id'] == SEPTEMBER_ID:
            row.update(paid_amount='58170.50', paid_date='2026-10-29',
                       status='paid', overdue_days=29,
                       covered_principal_v2='14170.50', covered_total_v2='14170.50')
        elif row['id'] == OCTOBER_ID:
            row.update(paid_amount='58151.50', paid_date='2026-10-29',
                       status='partial', overdue_days=0,
                       covered_interest_v2=str(OCTOBER_INTEREST),
                       covered_principal_v2=str(OCTOBER_PRINCIPAL),
                       covered_total_v2='58151.50')
    evidence['after'] = after
    evidence['correction'] = {'key': CORRECTION_KEY,
                              'reason': '29 October bank payment incorrectly posted as early principal'}
    encoded = json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':'))
    digest = hashlib.sha256(encoded.encode('utf-8')).hexdigest()
    cur.execute('''UPDATE nbki_payment_posting_snapshots SET evidence=%s,
        evidence_sha256=%s WHERE payment_id=%s''', (Json(evidence), digest, PAYMENT_ID))
    cur.execute('''UPDATE nbki_crm_events SET evidence_sha256=%s
        WHERE id=%s AND status='new' ''', (digest, event['id']))

    after_state = capture(cur)
    corrected_payment = after_state['payment'][0]
    corrected_october = next(row for row in after_state['schedule'] if row['payment_no'] == 36)
    require(corrected_payment['principal_part'] + corrected_payment['interest_part'] ==
            corrected_payment['amount'] and
            corrected_october['payment_amount'] - corrected_october['paid_amount'] ==
            Decimal('19.00') and
            after_state['loan'][0]['balance'] == NEW_BALANCE and
            after_state['event'][0]['evidence_sha256'].strip() == digest,
            'Corrected state failed reconciliation')
    cur.execute('''INSERT INTO loan_payment_correction_audit
        (correction_key,loan_id,payment_id,reason,before_state,after_state)
        VALUES (%s,%s,%s,%s,%s,%s)''',
        (CORRECTION_KEY, LOAN_ID, PAYMENT_ID,
         'Reallocate 29 October payment to September arrears and October installment; correct penalty basis',
         Json(before, dumps=lambda value: json.dumps(value, default=str, ensure_ascii=False)),
         Json(after_state, dumps=lambda value: json.dumps(value, default=str, ensure_ascii=False))))
    return after_state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='commit the correction')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            result = run(cur)
            payment = result['payment'][0]
            october = next(x for x in result['schedule'] if x['payment_no'] == 36)
            print('payment', payment['id'], 'principal', payment['principal_part'],
                  'interest', payment['interest_part'], 'penalty', payment['penalty_part'])
            print('loan balance', result['loan'][0]['balance'],
                  'October unpaid', october['payment_amount'] - october['paid_amount'],
                  'October accrued penalty', october['penalty_amount'])
            if not args.apply:
                conn.rollback()
                print('DRY RUN: rolled back')
            else:
                print('APPLIED')


if __name__ == '__main__':
    main()
