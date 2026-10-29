"""Read-only comparison of dated 1C facts with CRM source records.

These are review signals, not accounting corrections or NBKI acceptance proofs.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation


def parse_money(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(value.replace('\u00a0', '').replace(' ', '').replace(',', '.'))
    except InvalidOperation:
        return None


def parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%d.%m.%Y').date()
    except ValueError:
        return None


def compare_fact(indicators: dict, *, event_date, crm_end_date,
                 payments: list[tuple]) -> list[dict]:
    """Compare only fields with an explicit CRM counterpart at the event date."""
    def source(column):
        return (indicators.get(str(column)) or {}).get('value')

    checks = []
    source_end = parse_date(source(22))
    if source_end and crm_end_date:
        checks.append({'field': 'contract_end_date', 'source': source_end.isoformat(),
                       'crm': crm_end_date.isoformat(),
                       'status': 'same' if source_end == crm_end_date else 'different_definition',
                       'note': 'Дата окончания 1С и CRM; в CRM может быть дата графика, требуется проверка договора'})

    payment_date = parse_date(source(111))
    payment_amount = parse_money(source(112))
    if payment_date and payment_amount is not None and payment_date <= event_date:
        same_day = [(id_, paid, amount) for id_, paid, amount in payments if paid == payment_date]
        crm_total = sum((amount for _, _, amount in same_day), Decimal('0'))
        status = ('missing_in_crm' if not same_day else
                  'same' if abs(crm_total - payment_amount) <= Decimal('0.01') else 'review')
        candidates = []
        if status == 'missing_in_crm':
            nearby = [(id_, paid, amount) for id_, paid, amount in payments
                      if paid != payment_date and abs((paid - payment_date).days) <= 3
                      and abs(amount - payment_amount) <= Decimal('0.01')]
            if len(nearby) == 1:
                status, candidates = 'date_shift_candidate', nearby
        elif status == 'review':
            adjacent = [(id_, paid, amount) for id_, paid, amount in payments
                        if abs((paid - payment_date).days) <= 1]
            if len(adjacent) > len(same_day) and abs(sum(
                    (amount for _, _, amount in adjacent), Decimal('0')) - payment_amount
            ) <= Decimal('0.01'):
                status, candidates = 'adjacent_sum_candidate', adjacent
        checks.append({'field': 'last_payment', 'source': str(payment_amount),
                       'crm': str(crm_total) if same_day else None,
                       'payment_date': payment_date.isoformat(),
                       'status': status,
                       'candidate_payments': [{'id': id_, 'date': paid.isoformat(),
                                               'amount': str(amount)}
                                              for id_, paid, amount in candidates],
                       'note': 'Платежи CRM за дату ФЛ_28.1; возможное совпадение по соседним датам не подтверждает тождество операций'})
    return checks


def reconciliation_report(cur, org_id: int) -> dict:
    cur.execute("""SELECT f.loan_id,l.contract_no,f.uid,f.event_time,f.source_row_num,
        f.indicators,l.end_date
        FROM nbki_1c_loan_facts f JOIN loans l ON l.id=f.loan_id
        WHERE f.org_id=%s AND l.org_id=%s AND l.status IN ('active','overdue','holiday')
        ORDER BY l.contract_no,l.id""", (org_id, org_id))
    facts = cur.fetchall()
    rows = []
    for loan_id, contract_no, uid, event_time, row_num, indicators, end_date in facts:
        cur.execute("""SELECT id,payment_date,amount FROM loan_payments
            WHERE loan_id=%s AND payment_date<=%s ORDER BY payment_date,id""",
            (loan_id, event_time.date()))
        checks = compare_fact(indicators, event_date=event_time.date(),
                              crm_end_date=end_date, payments=cur.fetchall())
        rows.append({'loan_id': loan_id, 'contract_no': contract_no, 'uid': uid,
                     'event_time': event_time.isoformat(), 'source_row_num': row_num,
                     'checks': checks})
    return {'total_loans': len(rows),
            'review_loans': sum(any(c['status'] in ('review', 'missing_in_crm',
                                                  'date_shift_candidate', 'adjacent_sum_candidate')
                                    for c in row['checks']) for row in rows),
            'candidate_loans': sum(any(c['status'] in ('date_shift_candidate',
                                                     'adjacent_sum_candidate')
                                       for c in row['checks']) for row in rows),
            'unexplained_loans': sum(any(c['status'] in ('review', 'missing_in_crm')
                                         for c in row['checks']) for row in rows),
            'different_end_dates': sum(any(c['field'] == 'contract_end_date' and
                                           c['status'] == 'different_definition'
                                           for c in row['checks']) for row in rows),
            'rows': rows,
            'basis': 'Ориентир для проверки, не исправление CRM и не подтверждение приёма НБКИ'}
