"""Preview average monthly payment (ВСП/ФЛ_29) from CRM schedule only.

This is a review candidate because contract penalty treatment and the
regulatory 48-month cap category are not represented as verified CRM terms.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
import hashlib
import json


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


def _matured_smp(result, debt, snapshot=False):
    if not debt.get('matured_at') or money(debt.get('term_principal')) != ZERO:
        result['issues'].append('Срок истёк, но полный остаток просроченной задолженности не подтверждён')
        return result
    overdue = money(debt['overdue_principal']) + money(debt['overdue_interest'])
    penalty = money(debt['penalty_candidate']['remaining'])
    # 758-П, appendix 1: after maturity SMP equals all overdue claims.
    total = _ceil_ruble(overdue + penalty)
    result.update(status=('candidate_from_posting_snapshot_schedule' if snapshot else 'candidate_from_crm_schedule'),
                  basis='758-П, приложение 1: после окончания срока ВСП равен просроченной задолженности',
                  months_uncapped=0, months_cap48=0, remaining_schedule_payments='0.00',
                  remaining_schedule_principal='0.00', expected_term_principal='0.00',
                  principal_difference='0.00', principal_reconciled=True,
                  overdue_principal_interest=str(overdue), penalty_candidate=str(penalty),
                  value_without_penalty_uncapped=total, value_without_penalty_cap48=total,
                  value_with_penalty_uncapped=total, value_with_penalty_cap48=total)
    return result


def preview_smp(cur, loan_id: int, event_date, crm_debt: dict) -> dict:
    result = {'status': 'unavailable', 'basis': 'Пункт 5 приложения 1 к 758-П; оставшиеся платежи графика CRM',
              'months_uncapped': None, 'months_cap48': None,
              'remaining_schedule_payments': None, 'overdue_principal_interest': None,
              'remaining_schedule_principal': None, 'expected_term_principal': None,
              'principal_difference': None,
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
        return _matured_smp(result, crm_debt)
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
    result.update({'remaining_schedule_principal': str(remaining_principal),
                   'expected_term_principal': str(expected_principal),
                   'principal_difference': str(remaining_principal - expected_principal)})
    result['principal_reconciled'] = abs(remaining_principal - expected_principal) <= CENT
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
    if not result['principal_reconciled']:
        result['warnings'] = ['Сумма основного долга в графике отличается от срочного остатка CRM; долг в XML берётся из учётного среза CRM, график используется для среднемесячного платежа']
    if penalty_amount is not None:
        result['value_with_penalty_uncapped'] = _ceil_ruble(
            (remaining_payments + penalty_amount) / months + overdue)
        result['value_with_penalty_cap48'] = _ceil_ruble(
            (remaining_payments + penalty_amount) / min(months, 48) + overdue)
    return result


def preview_smp_from_posting_snapshot(evidence: dict, expected_sha256: str,
                                      loan_id: int, payment_id: int,
                                      event_date: date, crm_debt: dict) -> dict:
    """Calculate an SMP candidate from the immutable post-payment CRM schedule.

    This is still a review candidate, not an approved regulatory value. Unlike
    ``preview_smp``, it never reads a mutable current schedule for a historical
    payment event.
    """
    result = {'status': 'unavailable',
              'basis': 'Снимок графика CRM после проведения платежа; кандидат для сверки',
              'months_uncapped': None, 'months_cap48': None,
              'remaining_schedule_payments': None, 'overdue_principal_interest': None,
              'remaining_schedule_principal': None, 'expected_term_principal': None,
              'principal_difference': None,
              'penalty_candidate': None, 'value_without_penalty_uncapped': None,
              'value_with_penalty_uncapped': None, 'value_without_penalty_cap48': None,
              'value_with_penalty_cap48': None, 'principal_reconciled': False,
              'issues': []}

    encoded = json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':')).encode('utf-8')
    if hashlib.sha256(encoded).hexdigest() != (expected_sha256 or '').strip():
        result['issues'].append('Контрольная сумма снимка графика не совпала')
        return result
    if (evidence.get('loan_id') != loan_id or evidence.get('payment_id') != payment_id or
            evidence.get('payment_date') != event_date.isoformat()):
        result['issues'].append('Снимок относится к другому займу, платежу или дате')
        return result

    after = evidence.get('after') or {}
    loan = after.get('loan') or {}
    rows = after.get('schedule') or []
    if not rows or not loan.get('end_date'):
        result['issues'].append('В снимке нет графика или срока договора')
        return result
    try:
        end_date = date.fromisoformat(str(loan['end_date'])[:10])
    except ValueError:
        result['issues'].append('Некорректная дата окончания договора в снимке')
        return result
    months = remaining_months(event_date, end_date)
    if months <= 0:
        return _matured_smp(result, crm_debt, snapshot=True)

    eligible = []
    for row in rows:
        try:
            due = date.fromisoformat(str(row['payment_date'])[:10])
            if due < event_date or row.get('status') in ('holiday', 'holiday_pending'):
                continue
            required = ('payment_amount', 'principal_amount', 'interest_amount',
                        'paid_amount', 'covered_interest_v2', 'covered_principal_v2',
                        'covered_total_v2')
            if any(key not in row for key in required):
                result['issues'].append(f"Снимок не содержит точное распределение строки {row.get('id')}")
                continue
            payment, principal, interest, paid, v2_interest, v2_principal, v2_total = map(
                money, (row['payment_amount'], row['principal_amount'], row['interest_amount'],
                        row['paid_amount'], row['covered_interest_v2'],
                        row['covered_principal_v2'], row['covered_total_v2']))
            if min(payment, principal, interest, paid, v2_interest, v2_principal, v2_total) < ZERO:
                result['issues'].append(f"Отрицательная сумма в строке графика {row.get('id')}")
                continue
            if abs(payment - principal - interest) > CENT or v2_total > paid + CENT:
                result['issues'].append(f"Строка графика {row.get('id')} не согласована с распределениями")
                continue
            legacy_paid = max(ZERO, paid - v2_total)
            covered_interest = min(legacy_paid, interest) + v2_interest
            covered_principal = min(principal, max(ZERO, legacy_paid - interest)) + v2_principal
            if covered_interest > interest + CENT or covered_principal > principal + CENT:
                result['issues'].append(f"Зачтено больше плановой суммы строки {row.get('id')}")
                continue
            eligible.append((due, max(ZERO, principal - covered_principal),
                             max(ZERO, interest - covered_interest)))
        except (KeyError, TypeError, ValueError, ArithmeticError):
            result['issues'].append(f"Некорректные данные строки графика {row.get('id')}")

    eligible.sort(key=lambda row: row[0])
    if not eligible or eligible[-1][0] != end_date:
        result['issues'].append('Последняя строка снимка не совпадает со сроком договора')
    if result['issues']:
        result['status'] = 'review'
        return result

    remaining_principal = sum((row[1] for row in eligible), ZERO)
    remaining_payments = sum((row[1] + row[2] for row in eligible), ZERO)
    try:
        expected_principal = money(crm_debt['term_principal'])
        overdue = money(crm_debt['overdue_principal']) + money(crm_debt['overdue_interest'])
    except (KeyError, TypeError, ValueError, ArithmeticError):
        result['issues'].append('В расчёте задолженности отсутствует срочная или просроченная часть')
        result['status'] = 'review'
        return result
    result['principal_reconciled'] = abs(remaining_principal - expected_principal) <= CENT
    result.update({'remaining_schedule_principal': str(remaining_principal),
                   'expected_term_principal': str(expected_principal),
                   'principal_difference': str(remaining_principal - expected_principal)})
    penalty = crm_debt.get('penalty_candidate')
    penalty_amount = money(penalty['remaining']) if penalty and penalty.get('remaining') is not None else None
    result.update({'status': 'candidate_from_posting_snapshot_schedule',
                   'months_uncapped': months, 'months_cap48': min(months, 48),
                   'remaining_schedule_payments': str(remaining_payments),
                   'overdue_principal_interest': str(overdue),
                   'penalty_candidate': str(penalty_amount) if penalty_amount is not None else None,
                   'value_without_penalty_uncapped': _ceil_ruble(remaining_payments / months + overdue),
                   'value_without_penalty_cap48': _ceil_ruble(remaining_payments / min(months, 48) + overdue)})
    if not result['principal_reconciled']:
        result['warnings'] = ['Сумма основного долга в историческом графике отличается от срочного остатка CRM; долг в XML берётся из снимка учёта CRM, график используется для среднемесячного платежа']
    if penalty_amount is not None:
        result['value_with_penalty_uncapped'] = _ceil_ruble(
            (remaining_payments + penalty_amount) / months + overdue)
        result['value_with_penalty_cap48'] = _ceil_ruble(
            (remaining_payments + penalty_amount) / min(months, 48) + overdue)
    return result
