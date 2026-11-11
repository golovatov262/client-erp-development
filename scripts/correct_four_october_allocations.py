"""Owner-approved October corrections for loans 50, 56, 117 and 158.

Run with DATABASE_URL. Default: transaction preview followed by rollback.
--apply commits all four corrections atomically. No historical posting snapshots
are invented: interest is reconstructed from the preserved preceding schedule
balance and contractual monthly rate, as approved by the owner on 2026-11-11.
"""
import argparse
import json
import os
from datetime import date
from decimal import Decimal

import psycopg2
from psycopg2.extras import Json, RealDictCursor
from backend.loan_payment_engine import _recalculate_future_in_place, money
from scripts.correct_loan60_nov10 import check, rows

# loan, contract, payment, date, schedule, number, first allocation,
# amount, old interest, scheduled principal, old balance, old monthly,
# restored interest, early principal, new balance, new monthly, future rows
CASES = [
    (50, '100-000015208052024', 2657, '2026-10-28', 137375, 29, 430,
     '19300.00', '7470.28', '10925.31', '451886.34', '19010.88',
     '8108.91', '265.78', '452524.97', '19037.75', 31),
    (56, '100-000022026062024', 2617, '2026-10-22', 137105, 28, 306,
     '21500.00', '6410.85', '12251.79', '516720.17', '20965.54',
     '8887.62', '360.59', '519196.94', '21066.03', 32),
    (117, '300-000041710072025', 2607, '2026-10-18', 149668, 9, 280,
     '15500.00', '3731.85', '6755.26', '192754.92', '12604.96',
     '6420.89', '2323.85', '195443.96', '12780.81', 21),
    (158, '100-000000515052025', 2610, '2026-10-17', 145744, 7, 287,
     '22072.00', '8872.32', '6167.06', '564054.62', '21758.37',
     '15904.07', '0.87', '571086.37', '22029.62', 46),
]


def capture(cur, lid, pid):
    return {
        'loan': rows(cur, 'loans', 'id=%s', (lid,)),
        'payments': rows(cur, 'loan_payments', 'loan_id=%s ORDER BY payment_date,id', (lid,)),
        'allocations': rows(cur, 'loan_payment_allocations', 'payment_id=%s ORDER BY id', (pid,)),
        'schedule': rows(cur, 'loan_schedule', 'loan_id=%s ORDER BY payment_no,id', (lid,)),
    }


def correct(cur, case):
    lid, contract, pid, day, sid, no, aid = case[:7]
    amount, old_i, principal, old_balance, old_monthly, interest, early, balance, monthly = map(Decimal, case[7:16])
    count = case[16]
    key = f'loan-{lid}-payment-{pid}-{day}-scheduled-interest'
    cur.execute('SELECT id FROM loans WHERE id=%s FOR UPDATE', (lid,))
    check(cur.fetchone(), 'Missing loan')
    cur.execute('SELECT id FROM loan_payments WHERE loan_id=%s ORDER BY id FOR UPDATE', (lid,))
    cur.fetchall()
    cur.execute('SELECT id FROM loan_schedule WHERE loan_id=%s ORDER BY id FOR UPDATE', (lid,))
    cur.fetchall()
    before = capture(cur, lid, pid)
    loan = before['loan'][0]
    p = before['payments'][-1]
    target = [s for s in before['schedule'] if s['payment_no'] == no]
    future = [s for s in before['schedule'] if s['payment_no'] > no]
    previous = [s for s in before['schedule'] if s['payment_no'] == no - 1][0]
    check(loan['contract_no'] == contract and loan['balance'] == old_balance
          and loan['monthly_payment'] == old_monthly and loan['status'] == 'active', 'Loan changed')
    check(p['id'] == pid and p['payment_date'] == date.fromisoformat(day)
          and p['amount'] == amount and p['interest_part'] == old_i
          and p['principal_part'] == amount-old_i and p['penalty_part'] == 0
          and p['engine_version'] == 'v2' and p['payment_type'] == 'early_partial', 'Payment changed or later payment exists')
    check(len(target) == 1 and target[0]['id'] == sid, 'Target schedule changed')
    s = target[0]
    check(s['interest_amount'] == old_i and s['principal_amount'] == principal
          and s['payment_amount'] == old_i + principal and s['paid_amount'] == old_i + principal
          and s['status'] == 'paid' and s['payment_id'] == pid, 'October schedule changed')
    check(len(future) == count and all(s['paid_amount'] == 0 and s['status'] == 'pending' for s in future), 'Future payments changed')
    check(money(previous['balance_after'] * loan['rate'] / 1200) == interest
          and previous['payment_amount'] == principal + interest, 'Reconstruction evidence changed')
    check([(a['id'], a['schedule_id'], a['component'], a['amount']) for a in before['allocations']] == [
        (aid, sid, 'interest', old_i), (aid+1, sid, 'principal', principal),
        (aid+2, None, 'early_principal', amount-old_i-principal)], 'Allocations changed')
    check(interest+principal+early == amount and old_balance+interest-old_i == balance, 'Correction arithmetic mismatch')
    cur.execute('SELECT 1 FROM loan_payment_correction_audit WHERE correction_key=%s', (key,))
    check(cur.fetchone() is None, 'Already corrected')
    cur.execute('UPDATE loan_payment_allocations SET amount=%s WHERE id=%s', (interest, aid))
    cur.execute('UPDATE loan_payment_allocations SET amount=%s WHERE id=%s', (early, aid+2))
    cur.execute('UPDATE loan_payments SET interest_part=%s,principal_part=%s WHERE id=%s', (interest, principal+early, pid))
    cur.execute('UPDATE loan_schedule SET interest_amount=%s,payment_amount=%s,paid_amount=%s,balance_after=%s WHERE id=%s',
                (interest, interest+principal, interest+principal, balance, sid))
    cur.execute('UPDATE loans SET balance=%s,updated_at=NOW() WHERE id=%s', (balance, lid))
    with cur.connection.cursor() as tuple_cur:
        actual_monthly = _recalculate_future_in_place(tuple_cur, lid, balance, p['payment_date'])
    check(actual_monthly == monthly, 'Unexpected monthly payment')
    after = capture(cur, lid, pid)
    future_after = [s for s in after['schedule'] if s['payment_no'] > no]
    check(sum(s['principal_amount'] for s in future_after) == balance
          and future_after[-1]['balance_after'] == 0, 'Future principal mismatch')
    check(loan['amount']-sum(p['principal_part'] for p in after['payments']) == balance, 'Ledger balance mismatch')
    check(sum(a['amount'] for a in after['allocations']) == amount, 'Allocation total mismatch')
    check(before['payments'][:-1] == after['payments'][:-1], 'Historical payments changed')
    check([s for s in before['schedule'] if s['payment_no'] < no] ==
          [s for s in after['schedule'] if s['payment_no'] < no], 'Historical schedule changed')
    check([(s['id'], s['payment_date']) for s in before['schedule']] ==
          [(s['id'], s['payment_date']) for s in after['schedule']], 'Schedule dates changed')
    dumps = lambda value: json.dumps(value, ensure_ascii=False, default=str)
    cur.execute('''INSERT INTO loan_payment_correction_audit
        (correction_key,loan_id,payment_id,reason,before_state,after_state)
        VALUES (%s,%s,%s,%s,%s,%s)''', (key, lid, pid,
        'Owner approved restoring October scheduled interest from preserved prior schedule balance and monthly rate; excess only to early principal; future payment reduced with term preserved. Earlier discrepancies unchanged.',
        Json(before, dumps=dumps), Json(after, dumps=dumps)))
    return dict(contract=contract, payment_id=pid, interest=interest,
                scheduled_principal=principal, early_principal=early, balance=balance,
                november_payment=monthly)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SET LOCAL lock_timeout = \'10s\'')
            cur.execute('SELECT pg_advisory_xact_lock(2026111150)')
            results = [correct(cur, case) for case in CASES]
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
    print(json.dumps(results, ensure_ascii=False, default=str, indent=2))
    print('APPLIED' if args.apply else 'DRY RUN: rolled back')


if __name__ == '__main__':
    main()
