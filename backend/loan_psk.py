"""Reconstruct initial contractual PSK under article 6 of 353-FZ.

The current payment schedule is mutable.  This calculation intentionally uses
the CRM loan's origination amount, rate, term and schedule-generation rules.
It is evidence for review, not proof that later-edited CRM terms were original.
"""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal('0.01')


def money(value):
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year, month = day.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def month_end(day: date) -> date:
    return date(day.year, day.month, calendar.monthrange(day.year, day.month)[1])


def initial_cashflows(amount, rate, term: int, start: date, schedule_type: str):
    """Use the same initial schedule rules as backend/api/index.py."""
    principal = money(amount)
    annual_rate = Decimal(str(rate))
    if principal <= 0 or annual_rate < 0 or term < 1 or schedule_type not in ('annuity', 'end_of_term'):
        raise ValueError('Неполные или некорректные условия первоначального займа')
    monthly_rate = annual_rate / Decimal('1200')
    if schedule_type == 'annuity':
        factor = (1 + monthly_rate) ** term
        payment = money(principal * monthly_rate * factor / (factor - 1)) if monthly_rate else money(principal / term)
    balance = principal
    flows = []
    previous_due = start
    for index in range(1, term + 1):
        due = add_months(start, term) if index == term else month_end(add_months(start, index))
        if schedule_type == 'annuity':
            interest = money(balance * monthly_rate)
            repaid = balance if index == term else min(balance, max(Decimal('0'), payment - interest))
        else:
            days = (due - previous_due).days
            interest = money(balance * annual_rate * Decimal(days) / Decimal('36000'))
            repaid = balance if index == term else Decimal('0')
        if due <= previous_due or repaid < 0:
            raise ValueError('Невозможный первоначальный график')
        flows.append((due, money(repaid + interest), interest))
        balance = money(balance - repaid)
        previous_due = due
    if balance != 0:
        raise ValueError('Первоначальный график не закрывает основной долг')
    return flows


def _period_fraction(start: date, due: date) -> float:
    """q + e for a one-month base period, counting equal calendar months."""
    q = max(0, (due.year - start.year) * 12 + due.month - start.month - 1)
    while add_months(start, q + 1) <= due:
        q += 1
    while q and add_months(start, q) > due:
        q -= 1
    boundary = add_months(start, q)
    next_boundary = add_months(start, q + 1)
    return q + (due - boundary).days / (next_boundary - boundary).days


def calculate_psk(amount, rate, term: int, start: date, schedule_type: str) -> dict:
    flows = initial_cashflows(amount, rate, term, start, schedule_type)
    principal = money(amount)
    fractions = [(_period_fraction(start, due), float(payment)) for due, payment, _ in flows]

    def npv(period_rate: float) -> float:
        return -float(principal) + sum(value / ((1 + period_rate) ** periods) for periods, value in fractions)

    if npv(0) < -0.01:
        raise ValueError('Сумма исходных платежей меньше выданной суммы')
    low, high = 0.0, 1.0
    while npv(high) > 0 and high < 1000000:
        high *= 2
    if npv(high) > 0:
        raise ValueError('Не найдено положительное решение для ПСК')
    for _ in range(100):
        middle = (low + high) / 2
        if npv(middle) > 0:
            low = middle
        else:
            high = middle
    percent = Decimal(str((low + high) / 2 * 1200)).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
    # Part 4.1: ruble PSK is interest + mandatory fees, excluding principal.
    rubles = money(sum((interest for _, _, interest in flows), Decimal('0')))
    return {'percent': percent, 'amount': rubles, 'period': 'month',
            'flow_count': len(flows), 'method': '353-FZ art.6; CRM initial schedule reconstruction'}


def classify_psk(calculated: dict, source_percent=None, source_amount=None,
                 source_status=None) -> tuple[str, str]:
    if source_status != 'source_consistent' or source_percent is None or source_amount is None:
        return 'review', 'Не подтверждены первоначальные условия договора независимым источником'
    percent_gap = abs(calculated['percent'] - Decimal(str(source_percent)))
    amount_gap = abs(calculated['amount'] - money(source_amount))
    if percent_gap <= Decimal('0.020') and amount_gap <= Decimal('1.00'):
        return 'cross_checked', 'Исходные условия CRM согласуются с историческим расчетом 1С'
    return 'review', f'Расхождение с историческим расчетом: {percent_gap}% и {amount_gap} руб.'
