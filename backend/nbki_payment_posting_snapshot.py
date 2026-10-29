"""Freeze CRM loan/schedule state around a new v2 payment.

This is internal accounting evidence, not a regulatory debt calculation.
"""

from __future__ import annotations

import hashlib
import json

from psycopg2.extras import Json


def capture_loan_state(cur, loan_id: int) -> dict:
    cur.execute("""SELECT amount,balance,rate,term_months,schedule_type,
        monthly_payment,start_date,end_date,status FROM loans WHERE id=%s""", (loan_id,))
    loan = cur.fetchone()
    if loan is None:
        raise ValueError('Договор займа не найден при фиксации платежа')
    loan_fields = ('amount','balance','rate','term_months','schedule_type',
                   'monthly_payment','start_date','end_date','status')
    cur.execute("""SELECT s.id,s.payment_no,s.payment_date,s.payment_amount,
        s.principal_amount,s.interest_amount,s.balance_after,s.status,s.paid_amount,
        s.paid_date,s.overdue_days,s.penalty_amount,
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='interest'),0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='principal'),0),
        COALESCE(SUM(a.amount),0)
        FROM loan_schedule s LEFT JOIN loan_payment_allocations a ON a.schedule_id=s.id
        WHERE s.loan_id=%s GROUP BY s.id ORDER BY s.payment_no,s.id""", (loan_id,))
    schedule_fields = ('id','payment_no','payment_date','payment_amount',
                       'principal_amount','interest_amount','balance_after',
                       'status','paid_amount','paid_date','overdue_days','penalty_amount',
                       'covered_interest_v2','covered_principal_v2','covered_total_v2')
    schedule = [dict(zip(schedule_fields, row)) for row in cur.fetchall()]
    cur.execute("""SELECT COALESCE(SUM(penalty_part),0) FROM loan_payments
        WHERE loan_id=%s""", (loan_id,))
    return {'loan': dict(zip(loan_fields, loan)),
            'schedule': schedule, 'paid_penalty_to_date': cur.fetchone()[0]}


def store_payment_snapshot(cur, payment_id: int, loan_id: int,
                           payment_date, before: dict, after: dict) -> str:
    payload = {'payment_id': payment_id, 'loan_id': loan_id,
               'payment_date': payment_date, 'before': before, 'after': after,
               'basis': 'CRM posting transaction; not a regulatory debt statement'}
    encoded = json.dumps(payload, default=str, ensure_ascii=False,
                         sort_keys=True, separators=(',', ':'))
    digest = hashlib.sha256(encoded.encode('utf-8')).hexdigest()
    cur.execute("""INSERT INTO nbki_payment_posting_snapshots
        (payment_id,loan_id,payment_date,evidence_sha256,evidence)
        VALUES (%s,%s,%s,%s,%s)""",
        (payment_id, loan_id, payment_date, digest, Json(json.loads(encoded))))
    return digest
