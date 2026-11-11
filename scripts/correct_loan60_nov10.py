"""Guarded one-time correction of Petrov's 10 November 2026 payment.

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


LOAN_ID = 60
PAYMENT_ID = 2748
SCHEDULE_ID = 148860
KEY = 'loan-60-payment-2748-2026-11-10'
INTEREST = Decimal('35182.00')
SCHEDULE_PRINCIPAL = Decimal('2662.15')
EARLY_PRINCIPAL = Decimal('155.85')
BALANCE = Decimal('2007582.09')


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
        'schedule': rows(cur, 'loan_schedule', 'loan_id=%s AND payment_no>=28 ORDER BY payment_no', (LOAN_ID,)),
    }


def run(cur):
    cur.execute('SELECT pg_advisory_xact_lock(%s)', (602748,))
    cur.execute('SELECT id FROM loans WHERE id=%s FOR UPDATE', (LOAN_ID,))
    check(cur.fetchone(), 'Loan missing')
    cur.execute('SELECT id FROM loan_payments WHERE id=%s FOR UPDATE', (PAYMENT_ID,))
    check(cur.fetchone(), 'Payment missing')
    cur.execute('SELECT id FROM loan_schedule WHERE loan_id=%s AND payment_no>=28 FOR UPDATE', (LOAN_ID,))
    cur.fetchall()
    before = capture(cur)
    loan, payment = before['loan'][0], before['payment'][0]
    schedule = before['schedule']
    alloc = before['allocations']
    check(loan['contract_no'] == '100-000022903072024' and loan['balance'] == Decimal('1983966.78')
          and loan['monthly_payment'] == Decimal('37396.09'), 'Loan changed')
    check(payment['loan_id'] == LOAN_ID and payment['payment_date'] == date(2026, 11, 10)
          and payment['amount'] == Decimal('38000.00') and payment['principal_part'] == Decimal('26433.31')
          and payment['interest_part'] == Decimal('11566.69') and payment['penalty_part'] == 0
          and payment['source_ref'] == 'bank_txn:777', 'Payment changed')
    check([(a['id'], a['schedule_id'], a['component'], a['amount']) for a in alloc] == [
        (684, SCHEDULE_ID, 'interest', Decimal('11566.69')),
        (685, SCHEDULE_ID, 'principal', SCHEDULE_PRINCIPAL),
        (686, None, 'early_principal', Decimal('23771.16')),
    ], 'Allocations changed')
    check(schedule[0]['id'] == SCHEDULE_ID and schedule[0]['payment_no'] == 28
          and schedule[0]['payment_amount'] == Decimal('14228.84')
          and schedule[0]['interest_amount'] == Decimal('11566.69')
          and schedule[0]['principal_amount'] == SCHEDULE_PRINCIPAL
          and schedule[0]['paid_amount'] == Decimal('14228.84')
          and schedule[0]['status'] == 'paid', 'November schedule changed')
    check(len(schedule) == 153 and all(r['paid_amount'] == 0 and r['status'] == 'pending'
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

    cur.execute('UPDATE loan_payment_allocations SET amount=%s WHERE id=684', (INTEREST,))
    cur.execute('UPDATE loan_payment_allocations SET amount=%s WHERE id=686', (EARLY_PRINCIPAL,))
    cur.execute('''UPDATE loan_payments SET interest_part=%s,principal_part=%s WHERE id=%s''',
                (INTEREST, SCHEDULE_PRINCIPAL + EARLY_PRINCIPAL, PAYMENT_ID))
    cur.execute('''UPDATE loan_schedule SET interest_amount=%s,payment_amount=%s,
        paid_amount=%s,balance_after=%s WHERE id=%s''',
        (INTEREST, INTEREST + SCHEDULE_PRINCIPAL, INTEREST + SCHEDULE_PRINCIPAL,
         BALANCE, SCHEDULE_ID))
    cur.execute('UPDATE loans SET balance=%s,updated_at=NOW() WHERE id=%s', (BALANCE, LOAN_ID))
    # The engine helper expects tuple rows; the audit queries use dict rows.
    with cur.connection.cursor() as tuple_cur:
        new_monthly = _recalculate_future_in_place(tuple_cur, LOAN_ID, BALANCE, payment['payment_date'])
    check(new_monthly == Decimal('37841.22'), 'Unexpected recalculated monthly payment')
    after = capture(cur)
    check(sum(r['principal_amount'] for r in after['schedule'][1:]) == BALANCE,
          'Future principal does not reconcile')
    check(sum(a['amount'] for a in after['allocations']) == payment['amount'],
          'Allocations do not reconcile')
    check(after['schedule'][0]['paid_amount'] == Decimal('37844.15')
          and after['schedule'][0]['payment_amount'] == Decimal('37844.15'),
          'November installment not restored')
    cur.execute('SELECT amount - (SELECT SUM(principal_part) FROM loan_payments WHERE loan_id=%s) AS balance FROM loans WHERE id=%s', (LOAN_ID, LOAN_ID))
    check(cur.fetchone()['balance'] == BALANCE, 'Payment history balance mismatch')
    check(after['loan'][0]['balance'] == BALANCE and after['payment'][0]['interest_part'] == INTEREST
          and after['payment'][0]['principal_part'] == Decimal('2818.00')
          and after['schedule'][1]['interest_amount'] == Decimal('35132.69')
          and after['schedule'][-1]['balance_after'] == 0, 'Correction verification failed')
    cur.execute('''INSERT INTO loan_payment_correction_audit
        (correction_key,loan_id,payment_id,reason,before_state,after_state)
        VALUES (%s,%s,%s,%s,%s,%s)''',
        (KEY, LOAN_ID, PAYMENT_ID,
         'Restore scheduled November interest per owner instruction: 35182.00 interest, 2662.15 scheduled principal, 155.85 early principal; and recalculate future installments from corrected principal balance',
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
