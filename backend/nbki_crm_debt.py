"""Read-only, CRM-only decomposition of principal after the latest loan payment.

This calculates overdue scheduled amounts, not unrecorded accrued interest or
the complete regulatory FL_25-28 blocks. It fails closed for older payments.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP


ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def estimate_current_interest(cur, loan_id: int, payment_id: int,
                              event_date: date, *, latest_payment: bool,
                              principal_checked: bool = True) -> dict:
    """Preview actual-period interest under the CRM v2 daily-interest rule.

    The contract's day-count convention and any historical rate change are not
    stored in CRM, so this is evidence for review, never an XML-approved value.
    """
    result = {'status': 'unavailable', 'basis': 'CRM: ставка × фактические дни / 365; зачтённые проценты строки графика',
              'period_start': None, 'accrued_before_payment': None,
              'interest_covered_in_period': None, 'remaining_interest_candidate': None,
              'issues': []}
    if not latest_payment:
        result['issues'].append('Есть более поздние платежи; текущий график не фиксирует прежний срез')
        return result
    if not principal_checked:
        result['issues'].append('Остаток основного долга не прошёл сверку журнала CRM')
        return result
    cur.execute("""SELECT amount,rate,schedule_type,start_date,status
        FROM loans WHERE id=%s""", (loan_id,))
    loan = cur.fetchone()
    if not loan:
        result['issues'].append('Договор займа не найден в CRM')
        return result
    original, rate, schedule_type, start_date, status = loan
    if schedule_type != 'annuity' or rate is None or original is None or status == 'holiday':
        result['issues'].append('Для этого типа графика метод фактических дней ещё не проверен')
        return result
    if Decimal(str(rate)) < ZERO:
        result['issues'].append('Отрицательная ставка займа в CRM')
        return result
    cur.execute("""SELECT MAX(payment_date) FROM loan_schedule
        WHERE loan_id=%s AND payment_date<%s""", (loan_id, event_date))
    previous_due = cur.fetchone()[0]
    anchor = previous_due or start_date
    if anchor is None or anchor > event_date:
        result['issues'].append('Нет корректной начальной даты периода начисления')
        return result
    result['period_start'] = anchor.isoformat()
    cur.execute("""SELECT s.id,s.interest_amount,COALESCE(s.paid_amount,0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='interest'),0),
        COALESCE(SUM(a.amount),0)
        FROM loan_schedule s LEFT JOIN loan_payment_allocations a ON a.schedule_id=s.id
        WHERE s.loan_id=%s AND s.payment_date>=%s
        GROUP BY s.id ORDER BY s.payment_date,s.id LIMIT 1""",
        (loan_id, event_date))
    row = cur.fetchone()
    if not row:
        result['issues'].append('Нет строки графика для текущего периода')
        return result
    _, scheduled_interest, paid_amount, v2_interest, v2_total = row
    scheduled_interest, paid_amount, v2_interest, v2_total = map(
        _money, (scheduled_interest, paid_amount, v2_interest, v2_total))
    if v2_total > paid_amount + CENT or min(scheduled_interest, paid_amount, v2_interest, v2_total) < ZERO:
        result['issues'].append('Несогласованные суммы в строке графика CRM')
        return result
    legacy_paid = max(ZERO, paid_amount - v2_total)
    covered_interest = min(legacy_paid, scheduled_interest) + v2_interest
    if covered_interest > scheduled_interest + CENT:
        result['issues'].append('Зачтённые проценты превышают проценты строки графика')
        return result
    cur.execute("""SELECT id,payment_date,principal_part FROM loan_payments
        WHERE loan_id=%s AND (payment_date,id)<=(%s,%s)
        ORDER BY payment_date,id""", (loan_id, event_date, payment_id))
    payments = cur.fetchall()
    if not any(row[0] == payment_id for row in payments):
        result['issues'].append('Целевой платёж отсутствует в журнале CRM')
        return result
    balance = _money(original)
    rate = Decimal(str(rate))
    accrued = ZERO
    prior_date = anchor
    for pid, payment_date, principal_part in payments:
        if principal_part is None or payment_date < start_date:
            result['issues'].append('Некорректная запись основного долга в журнале CRM')
            return result
        if payment_date > anchor:
            days = (payment_date - prior_date).days
            if days > 0:
                accrued += _money(balance * rate * Decimal(days) / Decimal('36500'))
            prior_date = payment_date
        balance -= _money(principal_part)
        if balance < -CENT:
            result['issues'].append('Отрицательный остаток основного долга при восстановлении начисления')
            return result
    if prior_date < event_date:
        accrued += _money(balance * rate * Decimal((event_date - prior_date).days) / Decimal('36500'))
    result['accrued_before_payment'] = str(accrued)
    result['interest_covered_in_period'] = str(covered_interest)
    result['remaining_interest_candidate'] = str(max(ZERO, accrued - covered_interest))
    result['status'] = 'candidate_from_crm_formula'
    return result


def split_latest_crm_debt(cur, loan_id: int, payment_id: int,
                          event_date: date, principal_after) -> dict:
    """Reconstruct overdue schedule claims from CRM when no later payment exists."""
    cur.execute("""SELECT COUNT(*) FROM loan_payments
        WHERE loan_id=%s AND (payment_date,id)>(%s,%s)""",
        (loan_id, event_date, payment_id))
    later_count = cur.fetchone()[0]
    result = {'basis': 'Текущий график и распределения CRM; только последний платёж',
              'status': 'unavailable' if later_count else 'calculated_from_current_crm',
              'later_payments': later_count, 'overdue_principal': None,
              'overdue_interest': None, 'term_principal': None,
              'interest_debt': None, 'total_debt': None,
              'penalty_candidate': None,
              'rows': [], 'issues': []}
    if later_count:
        result['issues'].append('После события есть платежи: текущий график не является состоянием на дату события')
        return result
    if principal_after is None:
        result['issues'].append('Остаток основного долга CRM не рассчитан')
        result['status'] = 'unavailable'
        return result
    cur.execute("""SELECT s.id,s.payment_date,s.principal_amount,s.interest_amount,
        COALESCE(s.paid_amount,0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='interest'),0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='principal'),0),
        COALESCE(SUM(a.amount),0)
        FROM loan_schedule s LEFT JOIN loan_payment_allocations a ON a.schedule_id=s.id
        WHERE s.loan_id=%s AND s.payment_date<%s
        GROUP BY s.id ORDER BY s.payment_date,s.id""", (loan_id, event_date))
    overdue_principal = ZERO
    overdue_interest = ZERO
    for sid, due, principal, interest, paid, v2_interest, v2_principal, v2_total in cur.fetchall():
        principal, interest, paid = map(_money, (principal, interest, paid))
        v2_interest, v2_principal, v2_total = map(_money, (v2_interest, v2_principal, v2_total))
        if min(principal, interest, paid, v2_interest, v2_principal, v2_total) < ZERO:
            result['issues'].append(f'Отрицательная сумма в строке графика {sid}')
            continue
        if v2_total > paid + CENT:
            result['issues'].append(f'Распределения превышают оплату строки графика {sid}')
            continue
        legacy_paid = max(ZERO, paid - v2_total)
        covered_interest = min(interest, legacy_paid) + v2_interest
        covered_principal = min(principal, max(ZERO, legacy_paid - interest)) + v2_principal
        if covered_interest > interest + CENT or covered_principal > principal + CENT:
            result['issues'].append(f'Распределение превышает плановую сумму строки {sid}')
            continue
        remaining_interest = max(ZERO, interest - covered_interest)
        remaining_principal = max(ZERO, principal - covered_principal)
        overdue_interest += remaining_interest
        overdue_principal += remaining_principal
        result['rows'].append({'schedule_id': sid, 'due': due.isoformat(),
                               'overdue_principal': str(remaining_principal),
                               'overdue_interest': str(remaining_interest)})
    principal = _money(principal_after)
    if overdue_principal > principal + CENT:
        result['issues'].append('Просроченный основной долг больше остатка по журналу CRM')
    if result['issues']:
        result['status'] = 'review'
        return result
    result['overdue_principal'] = str(overdue_principal)
    result['overdue_interest'] = str(overdue_interest)
    result['term_principal'] = str(principal - overdue_principal)
    # Penalties are accounted separately from schedule paid_amount in CRM.
    # Their contractual due date is not encoded, so do not label them overdue.
    if overdue_principal == ZERO:
        cur.execute("""SELECT COALESCE(SUM(penalty_amount),0)
            FROM loan_schedule WHERE loan_id=%s""", (loan_id,))
        assessed_penalty = _money(cur.fetchone()[0])
        cur.execute("""SELECT COALESCE(SUM(penalty_part),0)
            FROM loan_payments WHERE loan_id=%s
              AND (payment_date,id)<=(%s,%s)""",
            (loan_id, event_date, payment_id))
        paid_penalty = _money(cur.fetchone()[0])
        if assessed_penalty < paid_penalty:
            result['status'] = 'review'
            result['issues'].append('Погашенные пени превышают начисленные в графике CRM')
        else:
            result['penalty_candidate'] = {
                'assessed_crm': str(assessed_penalty),
                'paid_crm': str(paid_penalty),
                'remaining': str(assessed_penalty - paid_penalty),
                'due_classification': 'unconfirmed'}
    return result
