"""Preview average monthly payment (ВСП/ФЛ_29) from CRM schedule only.

This is a review candidate because contract penalty treatment and the
regulatory 48-month cap category are not represented as verified CRM terms.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP


CENT = Decimal('0.01')
ZERO = Decimal('0.00')


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def remaining_months(event_date, end_date) -> int:
    if end_date <= event_date:
        return 0
    return ((end_date.year - event_date.year) * 12 +
            (end_date.month - event_date.month) +
            (1 if end_date.day > event_date.day else 0))


def _ceil_ruble(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def preview_smp(cur, loan_id: int, event_date, crm_debt: dict) -> dict:
    result = {'status': 'unavailable', 'basis': 'Пункт 5 приложения 1 к 758-П; оставшиеся платежи графика CRM',
              'months_uncapped': None, 'months_cap48': None,
              'remaining_schedule_payments': None, 'overdue_principal_interest': None,
              'penalty_candidate': None, 'value_without_penalty_uncapped': None,
              'value_with_penalty_uncapped': None, 'value_without_penalty_cap48': None,
              'value_with_penalty_cap48': None, 'principal_reconciled': False,
              'issues': []}
    if crm_debt.get('status') != 'calculated_from_current_crm':
        result['issues'].append('Нет сверенного среза основного долга и просрочки CRM')
        return result
    cur.execute("SELECT end_date,status FROM loans WHERE id=%s", (loan_id,))
    loan = cur.fetchone()
    if not loan or loan[1] == 'holiday':
        result['issues'].append('Срок договора отсутствует либо действует особый график каникул')
        return result
    end_date = loan[0]
    months = remaining_months(event_date, end_date)
    if months <= 0:
        result['issues'].append('Срок обязательства истёк; нужен отдельный сценарий ВСП')
        return result
    cur.execute("""SELECT s.id,s.payment_date,s.payment_amount,s.principal_amount,
        s.interest_amount,COALESCE(s.paid_amount,0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='interest'),0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='principal'),0),
        COALESCE(SUM(a.amount),0)
        FROM loan_schedule s LEFT JOIN loan_payment_allocations a ON a.schedule_id=s.id
        WHERE s.loan_id=%s AND s.payment_date>=%s
          AND s.status NOT IN ('holiday','holiday_pending')
        GROUP BY s.id ORDER BY s.payment_date,s.id""", (loan_id, event_date))
    rows = cur.fetchall()
    if not rows or rows[-1][1] != end_date:
        result['issues'].append('Дата последнего платежа графика не совпадает со сроком договора CRM')
        return result
    remaining_payments = ZERO
    remaining_principal = ZERO
    for sid, _, payment, principal, interest, paid, v2_interest, v2_principal, v2_total in rows:
        payment, principal, interest, paid, v2_interest, v2_principal, v2_total = map(
            money, (payment, principal, interest, paid, v2_interest, v2_principal, v2_total))
        if min(payment, principal, interest, paid, v2_interest, v2_principal, v2_total) < ZERO:
            result['issues'].append(f'Отрицательная сумма в строке графика {sid}')
            continue
        if abs(payment - principal - interest) > CENT or v2_total > paid + CENT:
            result['issues'].append(f'Строка графика {sid} не согласована с распределениями')
            continue
        legacy_paid = max(ZERO, paid - v2_total)
        covered_interest = min(interest, legacy_paid) + v2_interest
        covered_principal = min(principal, max(ZERO, legacy_paid - interest)) + v2_principal
        if covered_interest > interest + CENT or covered_principal > principal + CENT:
            result['issues'].append(f'Зачтено больше плановой суммы строки {sid}')
            continue
        principal_left = max(ZERO, principal - covered_principal)
        interest_left = max(ZERO, interest - covered_interest)
        remaining_principal += principal_left
        remaining_payments += principal_left + interest_left
    if result['issues']:
        result['status'] = 'review'
        return result
    expected_principal = money(crm_debt['term_principal'])
    result['principal_reconciled'] = abs(remaining_principal - expected_principal) <= CENT
    if not result['principal_reconciled']:
        result['status'] = 'review'
        result['issues'].append('Основной долг будущего графика не равен срочному остатку CRM')
        return result
    overdue = money(crm_debt['overdue_principal']) + money(crm_debt['overdue_interest'])
    penalty = crm_debt.get('penalty_candidate')
    penalty_amount = money(penalty['remaining']) if penalty else None
    result.update({'months_uncapped': months, 'months_cap48': min(months, 48),
                   'remaining_schedule_payments': str(remaining_payments),
                   'overdue_principal_interest': str(overdue),
                   'penalty_candidate': str(penalty_amount) if penalty_amount is not None else None,
                   'value_without_penalty_uncapped': _ceil_ruble(remaining_payments / months + overdue),
                   'value_without_penalty_cap48': _ceil_ruble(remaining_payments / min(months, 48) + overdue),
                   'status': 'candidate_from_crm_schedule'})
    if penalty_amount is not None:
        result['value_with_penalty_uncapped'] = _ceil_ruble(
            (remaining_payments + penalty_amount) / months + overdue)
        result['value_with_penalty_cap48'] = _ceil_ruble(
            (remaining_payments + penalty_amount) / min(months, 48) + overdue)
    return result
