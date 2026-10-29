"""Read-only, CRM-only decomposition of principal after the latest loan payment.

This calculates overdue scheduled amounts, not unrecorded accrued interest or
the complete regulatory FL_25-28 blocks. It fails closed for older payments.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal


ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT)


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
    return result
