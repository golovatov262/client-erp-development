"""Guarded correction of Vlasova's approved post-holiday schedule and payments.

Defaults to a rolled-back dry run. Run with --apply and DATABASE_URL to commit.
The original database state is archived in approved_loan_schedule_replacements.
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import os
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import psycopg2
from psycopg2.extras import Json, RealDictCursor


ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / 'data' / 'loan95_holiday_schedule_approved.csv'
SOURCE_XLSX_SHA256 = '7d24224d4c3ee2503ec4923450193cc78db844f288f35c2a71c64e044d730162'
APPROVED_CSV_SHA256 = '000e5626938eb90d084d5c71a982c78f7af91b31a2554d19eda214deeb498b05'
SOURCE_KEY = 'vlasova_approved_holiday_schedule_2026_06_30'
LOAN_ID = 95
ORG_ID = 3
CONTRACT = '300-000005304062024'
JUNE_PAYMENT = 2045
OCT_PAYMENTS = (2711, 2716)
OPENING = Decimal('1792066.54')
JUNE_PRINCIPAL = Decimal('12486.31')
OCT_RECEIVED = Decimal('55000.80')
OCT_PRINCIPAL = Decimal('19159.19')
OCT_INTEREST = Decimal('35841.61')
BALANCE_AFTER = Decimal('1772907.35')
RATE = Decimal('0.000547')
CENT = Decimal('0.01')


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def money(value):
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def plan_rows():
    need(hashlib.sha256(CSV_PATH.read_bytes()).hexdigest() == APPROVED_CSV_SHA256,
         'Approved CSV no longer matches the attached XLSX transcription')
    with CSV_PATH.open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    need(len(rows) == 52, 'Approved schedule must have 52 payments')
    opening = OPENING
    previous_date = date(2026, 9, 30)
    for number, row in enumerate(rows, 28):
        due = date.fromisoformat(row['payment_date'])
        principal = money(row['principal_amount'])
        loan_interest = money(row['loan_interest'])
        member_fee = money(row['member_fee'])
        combined = money(row['interest_amount'])
        total = money(row['payment_amount'])
        balance = money(row['balance_after'])
        need(int(row['payment_no']) == number and due > previous_date,
             'Payment numbering or dates in approved schedule changed')
        need(loan_interest + member_fee == combined and principal + combined == total,
             f'Approved row {number} does not add up')
        need(opening - principal == balance, f'Approved row {number} has wrong balance')
        opening, previous_date = balance, due
    need(opening == 0 and previous_date == date(2031, 1, 3),
         'Approved schedule does not repay the principal')
    need(sum((money(r['principal_amount']) for r in rows), Decimal(0)) == OPENING,
         'Approved schedule principal total changed')
    need(money(rows[0]['interest_amount']) == OCT_INTEREST and
         money(rows[0]['payment_amount']) == Decimal('59388.11'),
         'Approved October row changed')
    return rows


def record(cur, table, where, params=()):
    cur.execute(f'SELECT * FROM {table} WHERE {where}', params)
    return [dict(row) for row in cur.fetchall()]


def state(cur):
    return {
        'loan': record(cur, 'loans', 'id=%s', (LOAN_ID,)),
        'schedule': record(cur, 'loan_schedule', 'loan_id=%s ORDER BY payment_no,id', (LOAN_ID,)),
        'payments': record(cur, 'loan_payments', 'loan_id=%s ORDER BY payment_date,id', (LOAN_ID,)),
        'allocations': record(cur, 'loan_payment_allocations',
                              'payment_id IN (%s,%s,%s) ORDER BY id',
                              (JUNE_PAYMENT, *OCT_PAYMENTS)),
        'penalty_ledger': record(cur, 'loan_penalty_daily_accruals',
                                 'loan_id=%s ORDER BY schedule_id,accrual_date', (LOAN_ID,)),
        'snapshots': record(cur, 'nbki_payment_posting_snapshots',
                            'payment_id IN (%s,%s) ORDER BY payment_id', OCT_PAYMENTS),
        'events': record(cur, 'nbki_crm_events',
                         "source_type='loan_payment' AND source_id IN (%s,%s) ORDER BY source_id",
                         OCT_PAYMENTS),
    }


def guard(cur, before):
    loan = before['loan'][0]
    need((loan['id'], loan['org_id'], loan['contract_no'], loan['balance'],
          loan['rate'], loan['term_months'], loan['monthly_payment'], loan['end_date'],
          loan['holiday_start'], loan['holiday_end'], loan['holiday_months']) ==
         (LOAN_ID, ORG_ID, CONTRACT, Decimal('1804552.85'), Decimal('24.00'),
          75, Decimal('54389.80'), date(2030, 9, 30), date(2026, 6, 30),
          date(2026, 9, 30), 3), 'Loan state changed')
    payments = {p['id']: p for p in before['payments']}
    need(max((p['payment_date'], p['id']) for p in payments.values()) ==
         (date(2026, 10, 30), 2716), 'A later payment exists')
    need((payments[2045]['amount'], payments[2045]['principal_part'],
          payments[2045]['interest_part'], payments[2045]['payment_date']) ==
         (Decimal('95850.66'), Decimal('0'), Decimal('95850.66'), date(2026, 6, 3)),
         'June payment changed')
    need([(payments[n]['amount'], payments[n]['principal_part'],
           payments[n]['interest_part'], payments[n]['source_ref']) for n in OCT_PAYMENTS] ==
         [(Decimal('611.00'), Decimal('0'), Decimal('611.00'), 'bank_txn:741'),
          (Decimal('54389.80'), Decimal('0'), Decimal('54389.80'), 'bank_txn:746')],
         'October payments changed')
    rows = {s['payment_no']: s for s in before['schedule']}
    need(len(rows) == 75 and set(rows) == set(range(1, 76)),
         'Schedule composition changed')
    need((rows[20]['id'], rows[20]['paid_amount'], rows[20]['penalty_amount']) ==
         (138918, Decimal('35347.98'), Decimal('1375.04')),
         'February schedule row changed')
    need((rows[27]['id'], rows[27]['penalty_amount'], rows[28]['id'],
          rows[28]['penalty_amount'], rows[73]['id'], rows[73]['penalty_amount']) ==
         (138925, Decimal('430.56'), 138926, Decimal('48.80'),
          148652, Decimal('1263.60')), 'Holiday or duplicate rows changed')
    need(all(rows[n]['paid_amount'] == 0 for n in range(24, 76)),
         'A future or holiday row has been paid')
    need([(a['payment_id'], a['schedule_id'], a['component'], a['amount'])
          for a in before['allocations']] ==
         [(2711, 138918, 'interest', Decimal('611.00')),
          (2716, 138918, 'interest', Decimal('19285.37')),
          (2716, 138919, 'interest', Decimal('34967.15')),
          (2716, 138920, 'interest', Decimal('137.28'))],
         'Payment allocations changed')
    need(len(before['snapshots']) == len(before['events']) == 2 and
         all(e['status'] == 'new' for e in before['events']),
         'NBKI event state changed')
    need(all(s['evidence_sha256'].strip() == e['evidence_sha256'].strip()
             for s, e in zip(before['snapshots'], before['events'])),
         'NBKI evidence mismatch')
    ledger_by_row = {}
    for entry in before['penalty_ledger']:
        ledger_by_row.setdefault(entry['schedule_id'], []).append(entry)
    need({key: len(ledger_by_row.get(key, [])) for key in
          (138918, 138925, 138926, 148652)} ==
         {138918: 8, 138925: 8, 138926: 4, 148652: 4},
         'Daily penalty entries changed')
    need(all(entry['principal_base'] == Decimal('19041.82')
             for entry in ledger_by_row[138918]) and
         all(entry['principal_base'] == Decimal('22310.52')
             for entry in ledger_by_row[138926]),
         'Daily penalty basis changed')
    return rows, payments, ledger_by_row


def snapshot_schedule(original, rows, ids):
    frozen = [copy.deepcopy(s) for s in original if s['payment_no'] < 28]
    for item in frozen:
        no = item['payment_no']
        if no == 20:
            item['covered_principal_v2'] = str(JUNE_PRINCIPAL)
            item['covered_total_v2'] = str(JUNE_PRINCIPAL)
            item['penalty_amount'] = '1298.86'  # two corrected daily entries by posting
        if 24 <= no <= 27:
            item.update(payment_amount='0.00', principal_amount='0.00',
                        interest_amount='0.00', balance_after=str(OPENING),
                        penalty_amount='0.00', status='holiday')
    for row in rows:
        frozen.append({
            'id': ids[int(row['payment_no'])],
            'payment_no': int(row['payment_no']),
            'payment_date': row['payment_date'],
            'payment_amount': str(money(row['payment_amount'])),
            'principal_amount': str(money(row['principal_amount'])),
            'interest_amount': str(money(row['interest_amount'])),
            'balance_after': str(money(row['balance_after'])),
            'status': 'pending', 'paid_amount': '0.00', 'paid_date': None,
            'overdue_days': 0, 'penalty_amount': '0.00',
            'covered_interest_v2': '0', 'covered_principal_v2': '0',
            'covered_total_v2': '0',
        })
    return frozen


def change_frozen_payment(base, interest, principal, balance, status):
    result = copy.deepcopy(base)
    result['loan'].update(balance=str(balance), status=status)
    current = next(s for s in result['schedule'] if s['payment_no'] == 28)
    current.update(paid_amount=str(interest + principal), paid_date='2026-10-30',
                   status='partial', covered_interest_v2=str(interest),
                   covered_principal_v2=str(principal),
                   covered_total_v2=str(interest + principal))
    return result


def update_snapshots(cur, before, plan, ids):
    old = before['snapshots'][0]['evidence']
    base = copy.deepcopy(old['before'])
    base['loan'].update(balance=str(OPENING), end_date='2031-01-03',
                        term_months=79, monthly_payment='59388.11', status='overdue')
    base['schedule'] = snapshot_schedule(base['schedule'], plan, ids)
    first_after = change_frozen_payment(base, Decimal('611.00'), Decimal(0),
                                        OPENING, 'active')
    second_before = copy.deepcopy(first_after)
    second_before['loan']['status'] = 'overdue'
    second_after = change_frozen_payment(second_before, OCT_INTEREST,
                                         OCT_PRINCIPAL, BALANCE_AFTER, 'active')
    for payment_id, before_state, after_state in (
        (2711, base, first_after), (2716, second_before, second_after)
    ):
        original = next(s['evidence'] for s in before['snapshots']
                        if s['payment_id'] == payment_id)
        evidence = copy.deepcopy(original)
        evidence['before'] = before_state
        evidence['after'] = after_state
        evidence['correction'] = {'source_key': SOURCE_KEY,
                                  'basis': 'operator-approved post-holiday schedule; original evidence archived'}
        encoded = json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':'))
        digest = hashlib.sha256(encoded.encode('utf-8')).hexdigest()
        cur.execute('''UPDATE nbki_payment_posting_snapshots
            SET evidence=%s,evidence_sha256=%s WHERE payment_id=%s''',
            (Json(evidence), digest, payment_id))
        cur.execute('''UPDATE nbki_crm_events SET evidence_sha256=%s
            WHERE source_type='loan_payment' AND source_id=%s AND status='new' ''',
            (digest, payment_id))


def replace(cur):
    plan = plan_rows()
    cur.execute('SELECT pg_advisory_xact_lock(%s,%s)', (ORG_ID, LOAN_ID))
    cur.execute('''SELECT id FROM loans WHERE id=%s FOR UPDATE''', (LOAN_ID,))
    need(cur.fetchone(), 'Loan missing')
    cur.execute('''SELECT id FROM loan_payments WHERE loan_id=%s FOR UPDATE''', (LOAN_ID,))
    cur.fetchall()
    cur.execute('''SELECT id FROM loan_schedule WHERE loan_id=%s FOR UPDATE''', (LOAN_ID,))
    cur.fetchall()
    cur.execute('''SELECT 1 FROM approved_loan_schedule_replacements
        WHERE org_id=%s AND loan_id=%s AND source_key=%s''',
        (ORG_ID, LOAN_ID, SOURCE_KEY))
    need(cur.fetchone() is None, 'Correction already applied')
    before = state(cur)
    old_rows, _payments, ledger = guard(cur, before)
    summary = {'contract': CONTRACT, 'source_xlsx_sha256': SOURCE_XLSX_SHA256,
               'old_balance': str(before['loan'][0]['balance']),
               'opening_balance': str(OPENING),
               'june_principal_correction': str(JUNE_PRINCIPAL),
               'october_received': str(OCT_RECEIVED),
               'october_interest_including_membership': str(OCT_INTEREST),
               'october_principal': str(OCT_PRINCIPAL),
               'october_shortfall': '4387.31',
               'new_balance': str(BALANCE_AFTER),
               'new_end_date': '2031-01-03',
               'plan': plan}
    cur.execute('''INSERT INTO approved_loan_schedule_replacements
        (org_id,loan_id,source_key,source_note,approved_plan,before_state)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id''',
        (ORG_ID, LOAN_ID, SOURCE_KEY,
         'Approved XLSX: 17% loan interest + 7% membership in CRM 24%; June principal split confirmed by operator',
         Json(summary), Json(before, dumps=lambda v: json.dumps(v, default=str, ensure_ascii=False))))
    archive_id = cur.fetchone()['id']

    # The operator confirmed that 12,486.31 of the 3 June receipt repaid
    # principal. Its June 3 paid schedule row 20 has capacity for this part.
    cur.execute('''UPDATE loan_payments SET principal_part=%s,interest_part=%s
        WHERE id=%s''', (JUNE_PRINCIPAL, Decimal('83364.35'), JUNE_PAYMENT))
    cur.execute('''INSERT INTO loan_payment_allocations
        (payment_id,schedule_id,component,amount,allocation_mode)
        VALUES (%s,%s,'principal',%s,'manual')''',
        (JUNE_PAYMENT, old_rows[20]['id'], JUNE_PRINCIPAL))

    # The October receipts belong to the first installment after holidays.
    a = before['allocations']
    cur.execute('''UPDATE loan_payment_allocations SET schedule_id=%s
        WHERE id=%s''', (old_rows[28]['id'], a[0]['id']))
    cur.execute('''UPDATE loan_payment_allocations SET schedule_id=%s,amount=%s
        WHERE id=%s''', (old_rows[28]['id'], Decimal('35230.61'), a[1]['id']))
    cur.execute('''UPDATE loan_payment_allocations
        SET schedule_id=%s,component='principal',amount=%s WHERE id=%s''',
        (old_rows[28]['id'], OCT_PRINCIPAL, a[2]['id']))
    cur.execute('DELETE FROM loan_payment_allocations WHERE id=%s', (a[3]['id'],))
    cur.execute('''UPDATE loan_payments SET principal_part=%s,interest_part=%s
        WHERE id=%s''', (OCT_PRINCIPAL, Decimal('35230.61'), 2716))
    cur.execute('''UPDATE loan_schedule SET paid_amount=%s,paid_date=%s,
        payment_id=%s,status='overdue' WHERE id=%s''',
        (Decimal('15451.61'), date(2026, 6, 3), JUNE_PAYMENT, old_rows[20]['id']))
    for no in (21, 22):
        cur.execute('''UPDATE loan_schedule SET paid_amount=0,paid_date=NULL,
            payment_id=NULL,status='overdue' WHERE id=%s''', (old_rows[no]['id'],))

    # Reverse the wrong future rows and their daily penalty movements, all of
    # which are retained verbatim in the approved replacement audit.
    cur.execute('DELETE FROM loan_penalty_daily_accruals WHERE schedule_id IN (%s,%s)',
                (old_rows[27]['id'], old_rows[73]['id']))
    cur.execute('''DELETE FROM loan_schedule WHERE loan_id=%s AND payment_no>=29''',
                (LOAN_ID,))
    for no in range(24, 28):
        due = (date(2026, 6, 30), date(2026, 7, 30),
               date(2026, 8, 31), date(2026, 9, 30))[no - 24]
        cur.execute('''UPDATE loan_schedule SET payment_date=%s,payment_amount=0,
            principal_amount=0,interest_amount=0,balance_after=%s,status='holiday',
            paid_amount=0,paid_date=NULL,payment_id=NULL,overdue_days=0,
            penalty_amount=0 WHERE id=%s''',
            (due, OPENING, old_rows[no]['id']))

    ids = {28: old_rows[28]['id']}
    today = date.today()
    for item in plan:
        no = int(item['payment_no'])
        due = date.fromisoformat(item['payment_date'])
        values = (due, money(item['payment_amount']), money(item['principal_amount']),
                  money(item['interest_amount']), money(item['balance_after']))
        if no == 28:
            cur.execute('''UPDATE loan_schedule SET payment_date=%s,payment_amount=%s,
                principal_amount=%s,interest_amount=%s,balance_after=%s,
                status='overdue',paid_amount=%s,paid_date=%s,payment_id=%s,
                overdue_days=%s,penalty_amount=%s WHERE id=%s''',
                (*values, OCT_RECEIVED, date(2026, 10, 30), 2716,
                 max(0, (today - due).days), Decimal('16.80'), ids[28]))
        else:
            cur.execute('''INSERT INTO loan_schedule
                (loan_id,payment_no,payment_date,payment_amount,principal_amount,
                 interest_amount,balance_after,status,paid_amount,overdue_days,penalty_amount)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',0,0,0) RETURNING id''',
                (LOAN_ID, no, *values))
            ids[no] = cur.fetchone()['id']

    # June principal correction reduces the recorded daily penalty basis of
    # the still overdue February row. Older pre-ledger accrual is preserved.
    old_first = ledger[old_rows[20]['id']][0]['penalty_before']
    new_daily = money((old_rows[20]['principal_amount'] - JUNE_PRINCIPAL) * RATE)
    need(new_daily == Decimal('3.59'), 'February daily penalty differs')
    for index, entry in enumerate(ledger[old_rows[20]['id']]):
        cur.execute('''UPDATE loan_penalty_daily_accruals SET principal_base=%s,
            amount=%s,penalty_before=%s,penalty_after=%s WHERE id=%s''',
            (old_rows[20]['principal_amount'] - JUNE_PRINCIPAL, new_daily,
             old_first + new_daily * index,
             old_first + new_daily * (index + 1), entry['id']))
    cur.execute('UPDATE loan_schedule SET penalty_amount=%s WHERE id=%s',
                (old_first + new_daily * len(ledger[old_rows[20]['id']]),
                 old_rows[20]['id']))

    # October 30 is the contractual due date. Seven days of unpaid principal
    # have accrued by November 6; all these penalties remain unpaid until term.
    october_daily = money((money(plan[0]['principal_amount']) - OCT_PRINCIPAL) * RATE)
    need(october_daily == Decimal('2.40'), 'October daily penalty differs')
    penalty_days = [date(2026, 10, 31) + timedelta(days=i) for i in range(7)]
    need(penalty_days[-1] == today, 'Daily penalty period changed; re-review before applying')
    existing_oct = {entry['accrual_date']: entry for entry in ledger[old_rows[28]['id']]}
    for index, day in enumerate(penalty_days):
        values = (money(plan[0]['principal_amount']) - OCT_PRINCIPAL,
                  october_daily, october_daily * index,
                  october_daily * (index + 1))
        if day in existing_oct:
            cur.execute('''UPDATE loan_penalty_daily_accruals SET
                effective_due_date=%s,principal_base=%s,amount=%s,
                penalty_before=%s,penalty_after=%s WHERE id=%s''',
                (date(2026, 10, 30), *values, existing_oct[day]['id']))
        else:
            cur.execute('''INSERT INTO loan_penalty_daily_accruals
                (loan_id,schedule_id,accrual_date,effective_due_date,
                 principal_base,daily_rate,amount,penalty_before,penalty_after)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (LOAN_ID, old_rows[28]['id'], day, date(2026, 10, 30),
                 values[0], RATE, *values[1:]))

    cur.execute('''UPDATE loans SET balance=%s,monthly_payment=%s,end_date=%s,
        term_months=79,holiday_end=%s,status='overdue',updated_at=NOW()
        WHERE id=%s''',
        (BALANCE_AFTER, Decimal('59388.11'), date(2031, 1, 3),
         date(2026, 10, 1), LOAN_ID))
    update_snapshots(cur, before, plan, ids)

    after = state(cur)
    cur.execute('''UPDATE approved_loan_schedule_replacements SET after_state=%s
        WHERE id=%s''',
        (Json(after, dumps=lambda v: json.dumps(v, default=str, ensure_ascii=False)), archive_id))
    cur.execute('''SELECT COUNT(*) AS n, SUM(principal_amount) AS principal,
        SUM(interest_amount) AS interest, SUM(payment_amount) AS total
        FROM loan_schedule WHERE loan_id=%s AND payment_no BETWEEN 28 AND 79''',
        (LOAN_ID,))
    totals = cur.fetchone()
    need((totals['n'], totals['principal'], totals['interest'], totals['total']) ==
         (52, OPENING, Decimal('1026889.47'), Decimal('2818956.01')),
         'New schedule totals do not match approved XLSX')
    need(after['loan'][0]['balance'] ==
         after['loan'][0]['amount'] - sum((p['principal_part'] for p in after['payments']), Decimal(0)),
         'Principal ledger does not reconcile')
    need(after['schedule'][27]['paid_amount'] == OCT_RECEIVED and
         after['schedule'][27]['payment_amount'] - OCT_RECEIVED == Decimal('4387.31'),
         'October shortfall does not reconcile')
    need(all(s['evidence_sha256'].strip() == e['evidence_sha256'].strip()
             for s, e in zip(after['snapshots'], after['events'])),
         'Corrected NBKI evidence mismatch')
    for snapshot in after['snapshots']:
        encoded = json.dumps(snapshot['evidence'], ensure_ascii=False,
                             sort_keys=True, separators=(',', ':'))
        need(hashlib.sha256(encoded.encode('utf-8')).hexdigest() ==
             snapshot['evidence_sha256'].strip(),
             'Corrected snapshot digest is invalid')
    for payment_id in (JUNE_PAYMENT, *OCT_PAYMENTS):
        payment = next(p for p in after['payments'] if p['id'] == payment_id)
        need(payment['principal_part'] + payment['interest_part'] +
             payment['penalty_part'] == payment['amount'],
             f'Payment {payment_id} components do not sum')
    summary.update(archive_id=archive_id, actual_schedule_rows=len(after['schedule']),
                   october_penalty=str(after['schedule'][27]['penalty_amount']),
                   february_penalty=str(after['schedule'][19]['penalty_amount']))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            summary = replace(cursor)
            print(json.dumps({k: v for k, v in summary.items() if k != 'plan'},
                             ensure_ascii=False, indent=2))
            if not args.apply:
                connection.rollback()
                print('DRY RUN: rolled back')
            else:
                print('APPLIED')


if __name__ == '__main__':
    main()
