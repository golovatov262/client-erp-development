"""Guarded one-time correction of Zavodchikova's 27 October 2026 payment.

Set DATABASE_URL; run without --apply for a rolled-back preview.
"""

import argparse
import json
import os
from datetime import date
from decimal import Decimal

import psycopg2
from psycopg2.extras import Json, RealDictCursor

from backend.loan_payment_engine import _recalculate_future_in_place


LOAN_ID = 63
PAYMENT_ID = 2652
SCHEDULE_ID = 131393
KEY = 'loan-63-payment-2652-2026-10-27'
INTEREST = Decimal('11824.82')
SCHEDULE_PRINCIPAL = Decimal('5334.43')
EARLY_PRINCIPAL = Decimal('840.75')
BALANCE = Decimal('581702.79')


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def rows(cur, table, where, args):
    cur.execute(f'SELECT * FROM {table} WHERE {where}', args)
    return [dict(row) for row in cur.fetchall()]


def capture(cur):
    return {
        'loan': rows(cur, 'loans', 'id=%s', (LOAN_ID,)),
        'payment': rows(cur, 'loan_payments', 'id=%s', (PAYMENT_ID,)),
        'allocations': rows(cur, 'loan_payment_allocations', 'payment_id=%s ORDER BY id', (PAYMENT_ID,)),
        'schedule': rows(cur, 'loan_schedule', 'loan_id=%s AND payment_no>=26 ORDER BY payment_no', (LOAN_ID,)),
    }


def run(cur):
    cur.execute('SELECT pg_advisory_xact_lock(%s)', (632652,))
    cur.execute('SELECT id FROM loans WHERE id=%s FOR UPDATE', (LOAN_ID,))
    check(cur.fetchone(), 'Loan missing')
    cur.execute('SELECT id FROM loan_payments WHERE id=%s FOR UPDATE', (PAYMENT_ID,))
    check(cur.fetchone(), 'Payment missing')
    cur.execute('SELECT id FROM loan_schedule WHERE loan_id=%s AND payment_no>=26 FOR UPDATE', (LOAN_ID,))
    cur.fetchall()
    before = capture(cur)
    loan, payment = before['loan'][0], before['payment'][0]
    schedule = before['schedule']
    alloc = before['allocations']
    check(loan['contract_no'] == '100-000028720082024' and loan['balance'] == Decimal('580021.29')
          and loan['monthly_payment'] == Decimal('16986.89'), 'Loan changed')
    check(payment['loan_id'] == LOAN_ID and payment['payment_date'] == date(2026, 10, 27)
          and payment['amount'] == Decimal('18000.00') and payment['principal_part'] == Decimal('7856.68')
          and payment['interest_part'] == Decimal('10143.32') and payment['penalty_part'] == 0
          and payment['source_ref'] == 'bank_txn:724', 'Payment changed')
    check([(a['id'], a['schedule_id'], a['component'], a['amount']) for a in alloc] == [
        (415, SCHEDULE_ID, 'interest', Decimal('10143.32')),
        (416, SCHEDULE_ID, 'principal', SCHEDULE_PRINCIPAL),
        (417, None, 'early_principal', Decimal('2522.25')),
    ], 'Allocations changed')
    check(schedule[0]['id'] == SCHEDULE_ID and schedule[0]['payment_no'] == 26
          and schedule[0]['payment_amount'] == Decimal('17159.25')
          and schedule[0]['interest_amount'] == INTEREST
          and schedule[0]['principal_amount'] == SCHEDULE_PRINCIPAL
          and schedule[0]['paid_amount'] == Decimal('17159.25')
          and schedule[0]['status'] == 'paid', 'October schedule changed')
    check(len(schedule) == 59 and all(r['paid_amount'] == 0 and r['status'] == 'pending'
                                     for r in schedule[1:]), 'Future schedule changed')
    cur.execute('SELECT COUNT(*) FROM loan_payments WHERE loan_id=%s AND '
                '(payment_date>%s OR (payment_date=%s AND id>%s))',
                (LOAN_ID, payment['payment_date'], payment['payment_date'], PAYMENT_ID))
    check(cur.fetchone()['count'] == 0, 'A later payment exists')
    check(INTEREST + SCHEDULE_PRINCIPAL + EARLY_PRINCIPAL == payment['amount']
          and loan['balance'] + (INTEREST - payment['interest_part']) == BALANCE,
          'Payment or balance does not reconcile')
    cur.execute('''CREATE TABLE IF NOT EXISTS loan_payment_correction_audit (
        correction_key text PRIMARY KEY, loan_id integer NOT NULL, payment_id integer NOT NULL,
        reason text NOT NULL, before_state jsonb NOT NULL, after_state jsonb NOT NULL,
        corrected_at timestamptz NOT NULL DEFAULT clock_timestamp())''')
    cur.execute('SELECT 1 FROM loan_payment_correction_audit WHERE correction_key=%s', (KEY,))
    check(cur.fetchone() is None, 'Correction already applied')

    cur.execute('UPDATE loan_payment_allocations SET amount=%s WHERE id=415', (INTEREST,))
    cur.execute('UPDATE loan_payment_allocations SET amount=%s WHERE id=417', (EARLY_PRINCIPAL,))
    cur.execute('''UPDATE loan_payments SET interest_part=%s,principal_part=%s WHERE id=%s''',
                (INTEREST, SCHEDULE_PRINCIPAL + EARLY_PRINCIPAL, PAYMENT_ID))
    cur.execute('UPDATE loans SET balance=%s,updated_at=NOW() WHERE id=%s', (BALANCE, LOAN_ID))
    # The engine helper expects tuple rows; the audit queries use dict rows.
    with cur.connection.cursor() as tuple_cur:
        new_monthly = _recalculate_future_in_place(tuple_cur, LOAN_ID, BALANCE, payment['payment_date'])
    check(new_monthly == Decimal('17036.14'), 'Unexpected recalculated monthly payment')
    after = capture(cur)
    check(after['loan'][0]['balance'] == BALANCE and after['payment'][0]['interest_part'] == INTEREST
          and after['payment'][0]['principal_part'] == Decimal('6175.18')
          and after['schedule'][1]['interest_amount'] == Decimal('11634.06')
          and after['schedule'][-1]['balance_after'] == 0, 'Correction verification failed')
    cur.execute('''INSERT INTO loan_payment_correction_audit
        (correction_key,loan_id,payment_id,reason,before_state,after_state)
        VALUES (%s,%s,%s,%s,%s,%s)''',
        (KEY, LOAN_ID, PAYMENT_ID,
         'Restore scheduled October interest and recalculate future installments from corrected principal balance',
         Json(before, dumps=lambda x: json.dumps(x, ensure_ascii=False, default=str)),
         Json(after, dumps=lambda x: json.dumps(x, ensure_ascii=False, default=str))))
    return after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            after = run(cur)
            print('payment', after['payment'][0]['id'], 'interest', after['payment'][0]['interest_part'],
                  'principal', after['payment'][0]['principal_part'])
            print('loan balance', after['loan'][0]['balance'], 'next monthly', after['loan'][0]['monthly_payment'])
            print('next schedule', after['schedule'][1]['payment_date'],
                  after['schedule'][1]['payment_amount'], after['schedule'][1]['principal_amount'],
                  after['schedule'][1]['interest_amount'])
            if not args.apply:
                conn.rollback()
                print('DRY RUN: rolled back')
            else:
                print('APPLIED')


if __name__ == '__main__':
    main()
