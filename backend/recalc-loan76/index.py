import json
import os
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import psycopg2

DAILY = Decimal('0.21') / Decimal('365')
LOAN_ID = 76
START = date(2024, 1, 23)
INITIAL_OD = Decimal('711500.00')


def q2(x):
    return Decimal(x).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def handler(event, context):
    """Одноразовый пересчёт разнесения платежей по займу 76 (Лозина).
    Политика: проценты по фактическим дням между плановыми датами графика,
    платёж сначала гасит долг по процентам, остаток на ОД, недобор копится как долг."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors(), 'body': ''}

    body = json.loads(event.get('body') or '{}')
    apply_changes = bool(body.get('apply'))

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    schema = 't_p25513958_client_erp_developme'

    cur.execute(
        "SELECT id, payment_no, payment_date, payment_amount, paid_amount, penalty_amount, payment_id, status "
        "FROM %s.loan_schedule WHERE loan_id=%d ORDER BY payment_no" % (schema, LOAN_ID)
    )
    rows = cur.fetchall()

    od = INITIAL_OD
    int_debt = Decimal('0')
    prev = START
    report = []
    updates = []  # (schedule_id, new_principal, new_interest, new_od_after)

    for r in rows:
        sid, pno, pdate, pay_amt, paid, penalty = r[0], r[1], r[2], r[3], r[4], r[5]
        if isinstance(pdate, str):
            pdate = date.fromisoformat(pdate)
        days = (pdate - prev).days
        int_due = q2(od * DAILY * Decimal(str(days)))

        paid_d = Decimal(str(paid or 0))
        penalty_d = Decimal(str(penalty or 0))
        avail = paid_d - penalty_d
        if avail < 0:
            avail = Decimal('0')

        int_debt += int_due
        to_int = min(avail, int_debt)
        int_debt -= to_int
        avail -= to_int

        to_principal = min(avail, od)
        od -= to_principal

        report.append({
            'payment_no': pno,
            'date': pdate.isoformat(),
            'days': days,
            'paid': float(paid_d),
            'penalty': float(penalty_d),
            'interest_due_period': float(int_due),
            'interest_paid': float(to_int),
            'principal_paid': float(to_principal),
            'od_after': float(od),
            'interest_debt_after': float(int_debt),
        })
        updates.append((sid, q2(to_principal), q2(to_int), q2(od)))
        prev = pdate

    result = {
        'loan_id': LOAN_ID,
        'initial_od': float(INITIAL_OD),
        'final_od': float(od),
        'final_interest_debt': float(int_debt),
        'applied': False,
        'report': report,
    }

    cur.execute("DROP TABLE IF EXISTS %s._recalc76_report" % schema)
    cur.execute(
        "CREATE TABLE %s._recalc76_report ("
        "payment_no int, sched_date date, days int, paid numeric, penalty numeric, "
        "interest_due_period numeric, interest_paid numeric, principal_paid numeric, "
        "od_after numeric, interest_debt_after numeric)" % schema
    )
    for it in report:
        cur.execute(
            "INSERT INTO %s._recalc76_report VALUES (%d,'%s',%d,%s,%s,%s,%s,%s,%s,%s)" % (
                schema, it['payment_no'], it['date'], it['days'], it['paid'], it['penalty'],
                it['interest_due_period'], it['interest_paid'], it['principal_paid'],
                it['od_after'], it['interest_debt_after'])
        )
    conn.commit()

    if apply_changes:
        for sid, pp, ip, od_after in updates:
            cur.execute(
                "UPDATE %s.loan_schedule SET principal_amount=%s, interest_amount=%s WHERE id=%d"
                % (schema, float(pp), float(ip), sid)
            )
        # обновляем фактические платежи (loan_payments) — разносим principal/interest заново
        # сопоставляем платежи к периодам через payment_id
        cur.execute("UPDATE %s.loans SET balance=%s, updated_at=NOW() WHERE id=%d"
                    % (schema, float(q2(od)), LOAN_ID))
        conn.commit()
        result['applied'] = True

    cur.close()
    conn.close()
    return {'statusCode': 200, 'headers': _cors(), 'body': json.dumps(result, ensure_ascii=False)}


def _cors():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }