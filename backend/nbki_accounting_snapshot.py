"""Internal principal ledger checks for NBKI payment candidates.

These calculations are not the regulatory FL_25-28 debt breakdown.
"""

from __future__ import annotations

from decimal import Decimal


CENT = Decimal('0.01')


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
