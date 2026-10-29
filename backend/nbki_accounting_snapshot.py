"""Internal principal ledger checks for NBKI payment candidates.

These calculations are not the regulatory FL_25-28 debt breakdown.
"""

from __future__ import annotations

from decimal import Decimal


CENT = Decimal('0.01')


def audit_payment_allocations(payment: tuple, allocations: list[tuple], loan_id: int) -> dict:
    """Verify v2 allocation evidence without deriving regulatory debt."""
    payment_id, _, amount, principal, interest, penalty, engine_version = payment
    if engine_version != 'v2':
        return {'payment_id': payment_id, 'status': 'unavailable',
                'issues': ['Точные распределения для платежа до движка v2 недоступны'],
                'components': {}, 'allocations': []}
    totals = {key: Decimal('0') for key in
              ('interest', 'principal', 'early_principal', 'penalty', 'unapplied')}
    issues = []
    evidence = []
    for allocation_id, schedule_id, component, value, mode, schedule_loan_id in allocations:
        if component not in totals or value is None or value < 0:
            issues.append('Недопустимый компонент распределения платежа')
            continue
        if schedule_id is not None and schedule_loan_id != loan_id:
            issues.append('Строка графика распределения отсутствует или принадлежит другому займу')
        totals[component] += value
        evidence.append({'id': allocation_id, 'schedule_id': schedule_id,
                         'component': component, 'amount': str(value), 'mode': mode})
    if any(value is None for value in (amount, principal, interest, penalty)):
        issues.append('Не все части платежа заполнены в CRM')
    else:
        if abs(totals['principal'] + totals['early_principal'] - principal) > CENT:
            issues.append('Распределение основного долга не равно части платежа')
        if abs(totals['interest'] - interest) > CENT:
            issues.append('Распределение процентов не равно части платежа')
        if abs(totals['penalty'] - penalty) > CENT:
            issues.append('Распределение пени не равно части платежа')
        if abs(sum(totals.values(), Decimal('0')) - amount) > CENT:
            issues.append('Общая сумма распределений не равна платежу')
    if totals['unapplied'] > CENT:
        issues.append('Есть нераспределённая часть платежа')
    return {'payment_id': payment_id, 'status': 'checked' if not issues else 'review',
            'issues': issues, 'components': {key: str(value) for key, value in totals.items()},
            'allocations': evidence}


def build_accounting_snapshot(original_amount: Decimal | None,
                              current_balance: Decimal | None,
                              payments: list[tuple], payment_id: int) -> dict:
    """Reconstruct principal immediately before/after one CRM payment."""
    ordered = sorted(payments, key=lambda row: (row[1], row[0]))
    matches = [index for index, row in enumerate(ordered) if row[0] == payment_id]
    if len(matches) != 1 or original_amount is None:
        raise ValueError('Платёж не найден в журнале CRM или отсутствует сумма займа')
    index = matches[0]
    target = ordered[index]
    issues = []
    if any(row[3] is None for row in ordered[:index + 1]):
        issues.append('Не во всех платежах до даты события указана часть основного долга')
        principal_before = principal_after = None
    else:
        principal_before = original_amount - sum(
            (row[3] for row in ordered[:index]), Decimal('0'))
        principal_after = principal_before - target[3]
        if principal_before < -CENT or principal_after < -CENT:
            issues.append('Расчётный остаток основного долга отрицателен')
    amount, principal, interest, penalty = target[2:6]
    if any(value is None for value in (amount, principal, interest, penalty)):
        issues.append('Не все части платежа заполнены в CRM')
        components_total = None
    else:
        components_total = principal + interest + penalty
        if abs(components_total - amount) > CENT:
            issues.append('Сумма частей платежа не равна сумме платежа CRM')
    is_latest_payment = index == len(ordered) - 1
    if is_latest_payment and principal_after is not None and current_balance is not None:
        if abs(principal_after - current_balance) > CENT:
            issues.append('Остаток по журналу платежей не равен текущему остатку займа CRM')
    return {'payment_id': payment_id,
            'principal_before': str(principal_before) if principal_before is not None else None,
            'principal_after': str(principal_after) if principal_after is not None else None,
            'components_total': str(components_total) if components_total is not None else None,
            'current_balance_checked': is_latest_payment and current_balance is not None,
            'current_balance': str(current_balance) if is_latest_payment and current_balance is not None else None,
            'issues': issues, 'status': 'checked' if not issues else 'review',
            'basis': 'Журнал платежей CRM; не нормативная детализация задолженности НБКИ'}
