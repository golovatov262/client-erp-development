"""Read-only penalty reconciliation after loan 90's approved schedule replacement.

The CRM has two historical penalty paths (a lump-sum catch-up and a daily
cron). This report applies the daily cron rule to the *approved* schedule,
using dated CRM payment allocations. It is evidence for review, not an
automatic correction of the loan ledger or a regulatory NBKI amount.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.nbki_payment_candidates import crm_effective_due_date


LOAN_ID = 90
CONTRACT_NO = '100-000000824062025'
SOURCE_KEY = 'operator_approved_holiday_schedule_2026_10_29'
DAILY_RATE = Decimal('0.000547')
CENT = Decimal('0.01')


def daily_penalty(principal, due_date, allocations, as_of):
    """Accrue from the day after effective due date, after dated payments.

    A payment dated D reduces the overdue principal from D+1. This follows
    the 00:05 daily cron timing; if a payment is backdated, the report remains
    an estimate and must not rewrite the already recorded penalty.
    """
    remaining = Decimal(str(principal))
    current = crm_effective_due_date(due_date) + timedelta(days=1)
    total = Decimal('0.00')
    days = 0
    while current <= as_of:
        for paid_date, amount in allocations:
            if paid_date == current - timedelta(days=1):
                remaining = max(Decimal('0'), remaining - Decimal(str(amount)))
        if remaining > 0:
            total += (remaining * DAILY_RATE).quantize(CENT, rounding=ROUND_HALF_UP)
            days += 1
        current += timedelta(days=1)
    return total, days


def reconcile(cur, as_of):
    cur.execute("""SELECT id FROM approved_loan_schedule_replacements
        WHERE loan_id=%s AND source_key=%s""", (LOAN_ID, SOURCE_KEY))
    archive = cur.fetchone()
    if not archive:
        raise ValueError('Не найден архив утверждённой замены графика')
    cur.execute('SELECT contract_no FROM loans WHERE id=%s', (LOAN_ID,))
    loan = cur.fetchone()
    if not loan or loan['contract_no'] != CONTRACT_NO:
        raise ValueError('Номер договора изменился')
    cur.execute("""SELECT id,payment_no,payment_date,principal_amount,
        penalty_amount,paid_amount,status FROM loan_schedule
        WHERE loan_id=%s AND payment_no BETWEEN 13 AND 28 ORDER BY payment_no""",
        (LOAN_ID,))
    schedule = cur.fetchall()
    if len(schedule) != 16:
        raise ValueError('Состав утверждённого графика изменился')
    cur.execute("""SELECT a.schedule_id,p.payment_date,a.amount
        FROM loan_payment_allocations a JOIN loan_payments p ON p.id=a.payment_id
        WHERE p.loan_id=%s AND a.component='principal'
        ORDER BY p.payment_date,p.id,a.id""", (LOAN_ID,))
    allocations = {}
    for item in cur.fetchall():
        allocations.setdefault(item['schedule_id'], []).append(
            (item['payment_date'], item['amount']))
    rows = []
    for row in schedule:
        if row['payment_date'] > as_of or not row['principal_amount']:
            continue
        amount, days = daily_penalty(row['principal_amount'], row['payment_date'],
                                     allocations.get(row['id'], []), as_of)
        recorded = Decimal(str(row['penalty_amount'] or 0))
        rows.append({'payment_no': row['payment_no'],
                     'due_date': row['payment_date'].isoformat(),
                     'effective_due_date': crm_effective_due_date(row['payment_date']).isoformat(),
                     'principal': str(row['principal_amount']),
                     'principal_allocations': [
                         {'date': paid.isoformat(), 'amount': str(value)}
                         for paid, value in allocations.get(row['id'], [])],
                     'days_with_penalty': days, 'daily_rule_estimate': str(amount),
                     'recorded_crm': str(recorded),
                     'difference_recorded_minus_estimate': str(recorded - amount)})
    estimate = sum((Decimal(row['daily_rule_estimate']) for row in rows), Decimal('0'))
    recorded = sum((Decimal(row['recorded_crm']) for row in rows), Decimal('0'))
    cur.execute('SELECT COALESCE(SUM(penalty_part),0) AS paid FROM loan_payments WHERE loan_id=%s AND payment_date<=%s',
                (LOAN_ID, as_of))
    paid = Decimal(str(cur.fetchone()['paid']))
    return {'loan_id': LOAN_ID, 'contract_no': CONTRACT_NO,
            'as_of': as_of.isoformat(), 'archive_id': archive['id'],
            'status': 'review_only', 'rows': rows,
            'daily_rule_estimate_total': str(estimate),
            'recorded_crm_total': str(recorded),
            'difference_recorded_minus_estimate': str(recorded - estimate),
            'paid_penalty_crm': str(paid),
            'note': 'Оценка по ежедневному правилу CRM; исторические доначисления не имеют построчного журнала. Без ручной сверки не менять CRM и не передавать в НБКИ.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--as-of', type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            print(json.dumps(reconcile(cur, args.as_of), ensure_ascii=False, indent=2))
            conn.rollback()


if __name__ == '__main__':
    main()
