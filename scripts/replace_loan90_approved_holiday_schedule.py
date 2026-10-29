"""One-time, guarded replacement of loan 90's CRM schedule from approved terms.

The operator supplied and confirmed the schedule on 2026-10-29. Existing
loan_payments and their monetary components are never updated. Run --check
before --apply; the latter archives every old row in the database atomically.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import Json, RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.nbki_payment_candidates import crm_effective_due_date


ORG_ID = 2
LOAN_ID = 90
CONTRACT_NO = '100-000000824062025'
PAYMENT_ID = 2417
SOURCE_KEY = 'operator_approved_holiday_schedule_2026_10_29'
SOURCE_NOTE = 'Утверждённый график после каникул, подтверждён пользователем 29.10.2026; платежи CRM не переразносятся'
D = Decimal
HOLIDAY_ACCRUALS = (
    ('2026-04-30', '894.00'),
    ('2026-05-30', '865.00'),
    ('2026-06-30', '865.00'),
)
# payment_no, contractual due date, principal, interest, planned balance after
REGULAR = (
    (13, '2026-07-30', '1930.29', '865.35', '32683.60'),
    (14, '2026-08-31', '1978.55', '817.09', '30705.05'),
    (15, '2026-09-30', '2028.01', '767.63', '28677.04'),
    (16, '2026-10-30', '2078.71', '716.93', '26598.33'),
    (17, '2026-11-30', '2130.68', '664.96', '24467.65'),
    (18, '2026-12-30', '2183.95', '611.69', '22283.70'),
    (19, '2027-02-01', '2238.55', '557.09', '20045.15'),
    (20, '2027-03-01', '2294.51', '501.13', '17750.64'),
    (21, '2027-03-30', '2351.87', '443.77', '15398.77'),
    (22, '2027-04-30', '2410.67', '384.97', '12988.10'),
    (23, '2027-05-31', '2470.94', '324.70', '10517.16'),
    (24, '2027-06-30', '2532.71', '262.93', '7984.45'),
    (25, '2027-07-30', '2596.03', '199.61', '5388.42'),
    (26, '2027-08-30', '2660.93', '134.71', '2727.49'),
    (27, '2027-09-23', '2727.49', '68.19', '0.00'),
)
FINAL_INTEREST = ('2027-10-23', D('2624.00'))


def validate_approved_plan() -> dict:
    assert len(REGULAR) == 15
    assert [row[0] for row in REGULAR] == list(range(13, 28))
    assert all(date.fromisoformat(REGULAR[i][1]) < date.fromisoformat(REGULAR[i + 1][1])
               for i in range(len(REGULAR) - 1))
    accrued = sum((D(value) for _, value in HOLIDAY_ACCRUALS), D('0'))
    principal = sum((D(row[2]) for row in REGULAR), D('0'))
    regular_interest = sum((D(row[3]) for row in REGULAR), D('0'))
    assert accrued == FINAL_INTEREST[1] == D('2624.00')
    assert principal == D('34613.89')
    assert regular_interest + accrued == D('9944.75')
    assert principal + regular_interest + accrued == D('44558.64')
    assert all(D(row[2]) + D(row[3]) ==
               (D('2795.68') if row[0] == 27 else D('2795.64')) for row in REGULAR)
    assert REGULAR[-1][4] == '0.00'
    return {'opening_principal': str(principal),
            'holiday_accruals': [{'date': day, 'interest': amount}
                                 for day, amount in HOLIDAY_ACCRUALS],
            'regular': [{'payment_no': number, 'due_date': due,
                         'principal': principal_part, 'interest': interest,
                         'planned_balance_after': balance}
                        for number, due, principal_part, interest, balance in REGULAR],
            'final_interest_due': FINAL_INTEREST[0],
            'final_interest_amount': str(FINAL_INTEREST[1]),
            'total_interest': '9944.75', 'total_payments': '44558.64'}


def _state(cur) -> str:
    cur.execute("""SELECT jsonb_build_object(
        'loan', (SELECT to_jsonb(l) FROM loans l WHERE l.id=%s),
        'schedule', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.payment_no,s.id)
                     FROM loan_schedule s WHERE s.loan_id=%s),
        'payment', (SELECT to_jsonb(p) FROM loan_payments p WHERE p.id=%s),
        'allocations', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb)
                        FROM loan_payment_allocations a WHERE a.payment_id=%s))::text""",
                (LOAN_ID, LOAN_ID, PAYMENT_ID, PAYMENT_ID))
    return cur.fetchone()[0]


def _guard(cur) -> tuple[dict, dict[int, dict]]:
    cur.execute("SELECT 1 FROM approved_loan_schedule_replacements WHERE org_id=%s AND loan_id=%s AND source_key=%s",
                (ORG_ID, LOAN_ID, SOURCE_KEY))
    if cur.fetchone():
        raise ValueError('Корректировка уже применена; повторная запись запрещена')
    cur.execute("""SELECT id,org_id,contract_no,amount,balance,rate,term_months,
        monthly_payment,start_date,end_date,status,holiday_start,holiday_end,holiday_months
        FROM loans WHERE id=%s FOR UPDATE""", (LOAN_ID,))
    loan = cur.fetchone()
    if not loan or (loan['org_id'], loan['contract_no'], loan['amount'],
                   loan['balance'], loan['rate'], loan['term_months'],
                   loan['monthly_payment'], loan['end_date'], loan['status'],
                   loan['holiday_start'], loan['holiday_end'], loan['holiday_months']) != (
                       ORG_ID, CONTRACT_NO, D('50000.00'), D('33351.88'),
                       D('30.00'), 27, D('2877.79'), date(2027, 9, 28),
                       'overdue', date(2026, 4, 1), date(2026, 7, 1), 3):
        raise ValueError('Реквизиты займа изменились; корректировка остановлена')
    cur.execute("SELECT * FROM loan_schedule WHERE loan_id=%s ORDER BY payment_no,id FOR UPDATE", (LOAN_ID,))
    rows = {row['payment_no']: row for row in cur.fetchall()}
    if len(rows) != 27 or set(rows) != set(range(1, 28)):
        raise ValueError('Состав графика изменился; корректировка остановлена')
    if (rows[13]['id'] != 138297 or rows[13]['payment_id'] != PAYMENT_ID or
            rows[13]['paid_amount'] != D('2000.00') or
            any(rows[n]['paid_amount'] != 0 or rows[n]['payment_id'] is not None
                for n in range(10, 28) if n != 13) or
            any(rows[n]['payment_amount'] != D('12475.72') for n in (25, 26, 27))):
        raise ValueError('Связи платежа или добавленные строки изменились; корректировка остановлена')
    cur.execute("""SELECT id,loan_id,payment_date,amount,principal_part,interest_part,
        penalty_part FROM loan_payments WHERE id=%s FOR UPDATE""", (PAYMENT_ID,))
    payment = cur.fetchone()
    if not payment or (payment['loan_id'], payment['payment_date'], payment['amount'],
                       payment['principal_part'], payment['interest_part'],
                       payment['penalty_part']) != (
                           LOAN_ID, date(2026, 9, 16), D('2000.00'),
                           D('1262.01'), D('737.99'), D('0.00')):
        raise ValueError('Платёж 16.09 изменился; корректировка остановлена')
    cur.execute("SELECT COUNT(*) AS n FROM loan_payment_allocations WHERE payment_id=%s", (PAYMENT_ID,))
    if cur.fetchone()['n']:
        raise ValueError('Распределение платежа уже записано; корректировка остановлена')
    cur.execute("SELECT COUNT(*) AS n,MAX(id) AS latest_id FROM loan_payments WHERE loan_id=%s", (LOAN_ID,))
    ledger = cur.fetchone()
    if (ledger['n'], ledger['latest_id']) != (6, PAYMENT_ID):
        raise ValueError('Состав журнала платежей изменился; корректировка остановлена')
    return loan, rows


def replace(cur, *, apply: bool) -> dict:
    plan = validate_approved_plan()
    cur.execute('SELECT pg_advisory_xact_lock(%s,%s)', (ORG_ID, LOAN_ID))
    loan, rows = _guard(cur)
    result = {'loan_id': LOAN_ID, 'contract_no': CONTRACT_NO,
              'old_end_date': str(loan['end_date']),
              'new_end_date': FINAL_INTEREST[0],
              'old_schedule_rows': len(rows), 'new_schedule_rows': 28,
              'payment_id_preserved': PAYMENT_ID,
              'old_penalty_on_replaced_rows': str(sum(
                  (rows[n]['penalty_amount'] for n in (25, 26, 27)), D('0'))),
              'approved_plan': plan}
    if not apply:
        return result

    before = _state(cur)
    cur.execute("""INSERT INTO approved_loan_schedule_replacements
        (org_id,loan_id,source_key,source_note,approved_plan,before_state)
        VALUES (%s,%s,%s,%s,%s,%s::jsonb) RETURNING id""",
        (ORG_ID, LOAN_ID, SOURCE_KEY, SOURCE_NOTE, Json(plan), before))
    archive_id = cur.fetchone()['id']
    for number in (10, 11, 12):
        cur.execute("""UPDATE loan_schedule SET payment_amount=0,principal_amount=0,
            interest_amount=0,balance_after=%s,penalty_amount=0
            WHERE id=%s""", (D('34613.89'), rows[number]['id']))

    today = datetime.now(ZoneInfo('Europe/Moscow')).date()
    for number, due_text, principal, interest, planned_balance in REGULAR:
        due = date.fromisoformat(due_text)
        old = rows[number]
        paid = old['paid_amount'] or D('0')
        effective_due = crm_effective_due_date(due)
        status = ('paid' if paid >= D(principal) + D(interest) else
                  'overdue' if effective_due < today else
                  'partial' if paid > 0 else 'pending')
        penalty = old['penalty_amount'] if number <= 24 else D('0')
        cur.execute("""UPDATE loan_schedule SET payment_date=%s,
            payment_amount=%s,principal_amount=%s,interest_amount=%s,
            balance_after=%s,status=%s,overdue_days=%s,penalty_amount=%s
            WHERE id=%s""", (due, D(principal) + D(interest), D(principal),
                D(interest), D(planned_balance), status,
                max(0, (today - effective_due).days) if status == 'overdue' else 0,
                penalty, old['id']))

    cur.execute("""INSERT INTO loan_schedule
        (loan_id,payment_no,payment_date,payment_amount,principal_amount,
         interest_amount,balance_after,status,paid_amount,overdue_days,penalty_amount)
        VALUES (%s,28,%s,%s,0,%s,0,'pending',0,0,0) RETURNING id""",
        (LOAN_ID, date.fromisoformat(FINAL_INTEREST[0]),
         FINAL_INTEREST[1], FINAL_INTEREST[1]))
    final_row_id = cur.fetchone()['id']
    # Explicitly preserve the legacy CRM payment's original component split.
    # These rows make later debt reconstruction use 737.99/1262.01 exactly,
    # not an inferred interest-first split from the replaced contractual row.
    for component, amount in (('interest', D('737.99')),
                              ('principal', D('1262.01'))):
        cur.execute("""INSERT INTO loan_payment_allocations
            (payment_id,schedule_id,component,amount,allocation_mode)
            VALUES (%s,%s,%s,%s,'manual')""",
            (PAYMENT_ID, rows[13]['id'], component, amount))
    cur.execute("""UPDATE loans SET end_date=%s,term_months=28,
        monthly_payment=%s,updated_at=NOW() WHERE id=%s""",
        (date.fromisoformat(FINAL_INTEREST[0]), D('2795.64'), LOAN_ID))

    cur.execute("""SELECT COUNT(*) AS n,SUM(principal_amount) AS principal,
        SUM(interest_amount) AS interest,SUM(payment_amount) AS payments
        FROM loan_schedule WHERE loan_id=%s AND payment_no BETWEEN 13 AND 28""",
        (LOAN_ID,))
    check = cur.fetchone()
    if (check['n'], check['principal'], check['interest'], check['payments']) != (
            16, D('34613.89'), D('9944.75'), D('44558.64')):
        raise ValueError('Итоги нового графика не совпали с утверждённым графиком')
    cur.execute("""SELECT amount,principal_part,interest_part,penalty_part
        FROM loan_payments WHERE id=%s""", (PAYMENT_ID,))
    unchanged = cur.fetchone()
    if (unchanged['amount'], unchanged['principal_part'], unchanged['interest_part'],
            unchanged['penalty_part']) != (
                D('2000.00'), D('1262.01'), D('737.99'), D('0.00')):
        raise ValueError('Части проведённого платежа изменились')
    after = _state(cur)
    cur.execute("""UPDATE approved_loan_schedule_replacements
        SET after_state=%s::jsonb WHERE id=%s""", (after, archive_id))
    result.update({'archive_id': archive_id, 'final_schedule_row_id': final_row_id,
                   'verified_principal': str(check['principal']),
                   'verified_interest': str(check['interest'])})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Commit guarded replacement')
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            result = replace(cur, apply=args.apply)
            print(result)
            if not args.apply:
                conn.rollback()


if __name__ == '__main__':
    main()
