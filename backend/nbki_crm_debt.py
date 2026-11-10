"""Read-only, CRM-only decomposition of principal after the latest loan payment.

This calculates overdue scheduled amounts, not unrecorded accrued interest or
the complete regulatory FL_25-28 blocks. It fails closed for older payments.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json


ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def split_posting_snapshot_debt(evidence: dict, expected_sha256: str,
                                loan_id: int, payment_id: int,
                                event_date: date) -> dict:
    """Split due claims from immutable CRM posting evidence, never from later rows."""
    result = {'status': 'unavailable', 'basis': 'Неизменяемый снимок CRM после проведения платежа',
              'overdue_principal': None, 'overdue_interest': None,
              'term_principal': None, 'penalty_candidate': None,
              'rows': [], 'issues': []}
    encoded = json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':')).encode('utf-8')
    if hashlib.sha256(encoded).hexdigest() != expected_sha256.strip():
        result['issues'].append('Контрольная сумма снимка графика не совпала')
        return result
    if (evidence.get('loan_id') != loan_id or evidence.get('payment_id') != payment_id or
            evidence.get('payment_date') != event_date.isoformat()):
        result['issues'].append('Снимок относится к другому займу, платежу или дате')
        return result
    after = evidence.get('after') or {}
    loan = after.get('loan') or {}
    schedule = after.get('schedule') or []
    if not schedule or 'paid_penalty_to_date' not in after:
        result['issues'].append('Старый снимок не содержит распределения и пени; восстановление невозможно')
        return result
    balance = _money(loan.get('balance'))
    if balance < ZERO:
        result['issues'].append('Отрицательный основной долг в снимке')
        return result
    overdue_principal = overdue_interest = assessed_penalty = ZERO
    last_due = None
    for row in schedule:
        if not all(key in row for key in ('covered_interest_v2','covered_principal_v2','covered_total_v2')):
            result['issues'].append('Снимок не содержит точного распределения')
            return result
        due = date.fromisoformat(str(row['payment_date']))
        last_due = max(last_due, due) if last_due else due
        principal, interest, paid = map(_money, (row['principal_amount'],
                                                  row['interest_amount'], row['paid_amount']))
        v2_interest, v2_principal, v2_total = map(_money, (row['covered_interest_v2'],
                                                           row['covered_principal_v2'],
                                                           row['covered_total_v2']))
        assessed_penalty += _money(row['penalty_amount'])
        if min(principal, interest, paid, v2_interest, v2_principal, v2_total) < ZERO or v2_total > paid + CENT:
            result['issues'].append(f'Несогласованные суммы строки графика {row["id"]}')
            continue
        legacy_paid = max(ZERO, paid - v2_total)
        covered_interest = min(interest, legacy_paid) + v2_interest
        covered_principal = min(principal, max(ZERO, legacy_paid - interest)) + v2_principal
        if covered_interest > interest + CENT or covered_principal > principal + CENT:
            result['issues'].append(f'Оплата превышает сумму строки графика {row["id"]}')
            continue
        # Legacy schedule rows can be marked paid even when the historical
        # paid_amount differs from principal + interest by a few rounding cents.
        # The CRM status is authoritative for whether the installment remains
        # overdue; do not turn a closed installment into a fresh debt claim.
        if due < event_date and row['status'] not in ('paid','holiday','holiday_pending'):
            remaining_principal = max(ZERO, principal - covered_principal)
            remaining_interest = max(ZERO, interest - covered_interest)
            overdue_principal += remaining_principal
            overdue_interest += remaining_interest
            result['rows'].append({'schedule_id': row['id'], 'due': due.isoformat(),
                                   'overdue_principal': str(remaining_principal),
                                   'overdue_interest': str(remaining_interest)})
    paid_penalty = _money(after['paid_penalty_to_date'])
    if assessed_penalty < paid_penalty:
        result['issues'].append('Оплаченная пеня превышает начисленную')
    if overdue_principal > balance + CENT:
        result['issues'].append('Просроченный основной долг превышает остаток')
    if result['issues']:
        result['status'] = 'review'
        return result
    penalty_remaining = assessed_penalty - paid_penalty
    result.update({'status': 'calculated_from_posting_snapshot',
                   'overdue_principal': str(overdue_principal),
                   'overdue_interest': str(overdue_interest),
                   'term_principal': str(balance - overdue_principal),
                   'penalty_candidate': {'assessed_crm': str(assessed_penalty),
                       'paid_crm': str(paid_penalty), 'remaining': str(penalty_remaining),
                       'due_at': last_due.isoformat(),
                       'due_classification': ('term_until_final_scheduled_payment'
                                              if last_due > event_date else 'review_after_final_due')}})
    return result


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
    cur.execute("""SELECT EXISTS (SELECT 1 FROM approved_loan_schedule_replacements
        WHERE loan_id=%s AND (applied_at AT TIME ZONE 'Europe/Moscow')::date >= %s)""",
        (loan_id, event_date))
    if cur.fetchone()[0]:
        result['issues'].append('После даты события утверждён новый график: текущая строка процентов не является снимком на дату платежа')
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
    # The target payment may be allocated to an overdue installment. That
    # allocation reduces overdue interest in split_latest_crm_debt; it must not
    # be subtracted from the current installment's accrued interest here.
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
        result['status'] = 'review'
        return result
    legacy_paid = max(ZERO, paid_amount - v2_total)
    covered_interest = min(legacy_paid, scheduled_interest) + v2_interest
    if covered_interest > scheduled_interest + CENT:
        result['issues'].append('Зачтённые проценты превышают проценты строки графика')
        result['status'] = 'review'
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
    # The payment engine can allocate the full scheduled installment interest
    # before the contractual due date. In that case CRM has already covered all
    # interest accrued through this payment date; the excess is an advance
    # payment against the scheduled amount, not negative debt.
    result['remaining_interest_candidate'] = str(max(ZERO, accrued - covered_interest))
    result['status'] = 'candidate_from_crm_formula'
    return result


def estimate_posting_snapshot_interest(cur, evidence: dict, expected_sha256: str,
                                       loan_id: int, payment_id: int,
                                       event_date: date) -> dict:
    """Estimate accrued current-period interest from immutable CRM postings.

    Every payment after the schedule-period anchor must have its own valid
    posting snapshot. Principal reductions are taken from snapshot balance
    deltas and cross-checked against the payment ledger; mutable current loan
    balances and schedules are not used.
    """
    result = {'status': 'unavailable',
              'basis': 'Снимки проведения платежей CRM: фактические дни / 365',
              'period_start': None, 'accrued_before_payment': None,
              'interest_covered_in_period': None,
              'remaining_interest_candidate': None, 'issues': []}

    def review(message):
        result['status'] = 'review'
        result['issues'].append(message)
        return result

    encoded = json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':')).encode('utf-8')
    if hashlib.sha256(encoded).hexdigest() != (expected_sha256 or '').strip():
        result['issues'].append('Контрольная сумма снимка проведения не совпала')
        return result
    if (evidence.get('loan_id') != loan_id or evidence.get('payment_id') != payment_id or
            evidence.get('payment_date') != event_date.isoformat()):
        result['issues'].append('Снимок относится к другому займу, платежу или дате')
        return result

    after = evidence.get('after') or {}
    loan = after.get('loan') or {}
    schedule = after.get('schedule') or []
    rate_value = loan.get('rate')
    start_value = loan.get('start_date')
    if (loan.get('schedule_type') != 'annuity' or rate_value is None or
            not start_value or loan.get('status') == 'holiday' or loan.get('amount') is None):
        result['issues'].append('Формула фактических дней по этому типу графика/статусу не подтверждена')
        return result
    rate = Decimal(str(rate_value))
    if rate < ZERO:
        return review('Отрицательная ставка займа в снимке')
    try:
        start_date = date.fromisoformat(str(start_value)[:10])
        previous_due = [date.fromisoformat(str(row['payment_date'])[:10])
                        for row in schedule
                        if date.fromisoformat(str(row['payment_date'])[:10]) < event_date]
    except (KeyError, TypeError, ValueError):
        return review('В снимке нет корректных дат графика или займа')
    anchor = max(previous_due) if previous_due else start_date
    if anchor > event_date:
        return review('Нет корректной начальной даты периода начисления')
    result['period_start'] = anchor.isoformat()

    current_rows = []
    for row in schedule:
        try:
            due = date.fromisoformat(str(row['payment_date'])[:10])
        except (KeyError, TypeError, ValueError):
            return review('Некорректная дата строки графика в снимке')
        if due >= event_date and row.get('status') not in ('holiday', 'holiday_pending'):
            current_rows.append((due, row))
    if not current_rows:
        return review('Нет строки графика для текущего периода в снимке')
    _, current_row = min(current_rows, key=lambda item: item[0])
    try:
        scheduled_interest, paid_amount, v2_interest, v2_total = map(
            _money, (current_row['interest_amount'], current_row['paid_amount'],
                     current_row['covered_interest_v2'], current_row['covered_total_v2']))
    except (KeyError, TypeError, ValueError, ArithmeticError):
        return review('В снимке нет точного распределения процентов текущей строки')
    if (v2_total > paid_amount + CENT or
            min(scheduled_interest, paid_amount, v2_interest, v2_total) < ZERO):
        return review('Несогласованные суммы в текущей строке графика снимка')
    legacy_paid = max(ZERO, paid_amount - v2_total)
    covered_interest = min(legacy_paid, scheduled_interest) + v2_interest
    if covered_interest > scheduled_interest + CENT:
        return review('Зачтённые проценты превышают проценты текущей строки графика')

    if event_date == anchor:
        cur.execute("""SELECT COALESCE(SUM(principal_part),0) FROM loan_payments
            WHERE loan_id=%s AND (payment_date,id)<(%s,%s)""",
            (loan_id, anchor, payment_id))
    else:
        cur.execute("""SELECT COALESCE(SUM(principal_part),0) FROM loan_payments
            WHERE loan_id=%s AND payment_date<=%s""", (loan_id, anchor))
    principal_paid_at_anchor = _money(cur.fetchone()[0])
    balance_at_anchor = _money(loan['amount']) - principal_paid_at_anchor
    if balance_at_anchor < ZERO:
        return review('Отрицательный остаток ОД по журналу платежей на начало периода')

    cur.execute("""SELECT p.id,p.payment_date,p.principal_part,
        ps.evidence_sha256,ps.evidence
        FROM loan_payments p LEFT JOIN nbki_payment_posting_snapshots ps
          ON ps.payment_id=p.id AND ps.loan_id=p.loan_id
        WHERE p.loan_id=%s AND p.payment_date>%s
          AND (p.payment_date,p.id)<=(%s,%s)
        ORDER BY p.payment_date,p.id""",
        (loan_id, anchor, event_date, payment_id))
    payments = cur.fetchall()
    if event_date > anchor and (not payments or payments[-1][0] != payment_id):
        return review('Целевой платёж или предшествующая часть периода отсутствует в журнале CRM')
    if event_date == anchor:
        before_loan = (evidence.get('before') or {}).get('loan') or {}
        try:
            before_balance = _money(before_loan['balance'])
        except (KeyError, TypeError, ValueError, ArithmeticError):
            return review('В снимке целевого платежа нет остатка ОД на начало периода')
        if abs(balance_at_anchor - before_balance) > CENT:
            return review('Остаток по журналу CRM не равен снимку на начало периода')
        result.update({'status': 'candidate_from_posting_snapshot_formula',
                       'accrued_before_payment': str(ZERO),
                       'interest_covered_in_period': str(covered_interest),
                       'remaining_interest_candidate': str(max(ZERO, ZERO - covered_interest))})
        return result

    accrued = ZERO
    prior_date = anchor
    running_balance = None
    target_seen = False
    for pid, payment_date, principal_part, snapshot_hash, payment_evidence in payments:
        target = pid == payment_id
        if target:
            target_seen = True
            payment_evidence = evidence
            snapshot_hash = expected_sha256
        if not payment_evidence or not snapshot_hash:
            return review(f'Для платежа {pid} внутри периода нет неизменяемого снимка CRM')
        encoded_payment = json.dumps(payment_evidence, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode('utf-8')
        if hashlib.sha256(encoded_payment).hexdigest() != snapshot_hash.strip():
            return review(f'Контрольная сумма снимка платежа {pid} не совпала')
        if (payment_evidence.get('loan_id') != loan_id or
                payment_evidence.get('payment_id') != pid or
                payment_evidence.get('payment_date') != payment_date.isoformat()):
            return review(f'Снимок платежа {pid} относится к другой операции')
        before_loan = (payment_evidence.get('before') or {}).get('loan') or {}
        after_loan = (payment_evidence.get('after') or {}).get('loan') or {}
        try:
            before_balance = _money(before_loan['balance'])
            after_balance = _money(after_loan['balance'])
            before_rate = Decimal(str(before_loan['rate']))
            after_rate = Decimal(str(after_loan['rate']))
            payment_day = date.fromisoformat(str(payment_date)[:10])
            recorded_principal = _money(principal_part)
        except (KeyError, TypeError, ValueError, ArithmeticError):
            return review(f'В снимке платежа {pid} нет достоверного остатка или ставки')
        if before_rate != after_rate or before_rate != rate:
            return review('Внутри периода менялась ставка; требуется версия условий на даты начисления')
        if before_balance < ZERO or after_balance < ZERO or before_balance < after_balance:
            return review(f'Несогласованный остаток основного долга в снимке платежа {pid}')
        principal_delta = before_balance - after_balance
        if abs(principal_delta - recorded_principal) > CENT:
            return review(f'Снижение остатка в снимке платежа {pid} не равно части ОД журнала CRM')
        if running_balance is None:
            running_balance = before_balance
            if abs(running_balance - balance_at_anchor) > CENT:
                return review('Остаток ОД по журналу CRM не совпадает с первым снимком периода')
        elif abs(running_balance - before_balance) > CENT:
            return review(f'Разрыв остатков между снимками платежей до операции {pid}')
        days = (payment_day - prior_date).days
        if days < 0:
            return review('Нарушен порядок дат платежей внутри периода')
        if days:
            accrued += _money(running_balance * rate * Decimal(days) / Decimal('36500'))
        running_balance = after_balance
        prior_date = payment_day

    if not target_seen:
        return review('Целевой платёж отсутствует среди снимков периода')
    if prior_date < event_date:
        days = (event_date - prior_date).days
        accrued += _money(running_balance * rate * Decimal(days) / Decimal('36500'))
    result.update({'status': 'candidate_from_posting_snapshot_formula',
                   'accrued_before_payment': str(accrued),
                   'interest_covered_in_period': str(covered_interest),
                   'remaining_interest_candidate': str(max(ZERO, accrued - covered_interest))})
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
    cur.execute("""SELECT EXISTS (SELECT 1 FROM approved_loan_schedule_replacements
        WHERE loan_id=%s AND (applied_at AT TIME ZONE 'Europe/Moscow')::date >= %s)""",
        (loan_id, event_date))
    if cur.fetchone()[0]:
        result['issues'].append('График утверждён заново после даты события; текущие сроки и пени нельзя считать историческим срезом')
        result['status'] = 'review'
        return result
    cur.execute("""SELECT s.id,s.payment_date,s.principal_amount,s.interest_amount,
        COALESCE(s.paid_amount,0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='interest'),0),
        COALESCE(SUM(a.amount) FILTER (WHERE a.component='principal'),0),
        COALESCE(SUM(a.amount),0),s.status
        FROM loan_schedule s LEFT JOIN loan_payment_allocations a ON a.schedule_id=s.id
        WHERE s.loan_id=%s AND s.payment_date<%s
        GROUP BY s.id ORDER BY s.payment_date,s.id""", (loan_id, event_date))
    overdue_principal = ZERO
    overdue_interest = ZERO
    for sid, due, principal, interest, paid, v2_interest, v2_principal, v2_total, status in cur.fetchall():
        if status in ('paid', 'holiday', 'holiday_pending'):
            continue
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
    # Penalties are separate from paid_amount. Operator confirmed that they
    # accrue daily and become payable with the final scheduled installment.
    # The current schedule is mutable, so this remains an event-date candidate.
    cur.execute("""SELECT COALESCE(SUM(penalty_amount),0),MAX(payment_date)
        FROM loan_schedule WHERE loan_id=%s""", (loan_id,))
    assessed_raw, last_due = cur.fetchone()
    assessed_penalty = _money(assessed_raw)
    cur.execute("""SELECT COALESCE(SUM(penalty_part),0)
        FROM loan_payments WHERE loan_id=%s
          AND (payment_date,id)<=(%s,%s)""",
        (loan_id, event_date, payment_id))
    paid_penalty = _money(cur.fetchone()[0])
    if assessed_penalty < paid_penalty or last_due is None:
        variance = assessed_penalty is not None and paid_penalty - assessed_penalty or None
        decision = None
        if last_due is not None and variance is not None:
            cur.execute("""SELECT accepted_variance, note FROM nbki_penalty_reconciliation_decisions
                WHERE loan_id=%s""", (loan_id,))
            decision = cur.fetchone()
        if decision and variance <= _money(decision[0]):
            result['penalty_candidate'] = {
                'assessed_crm': str(assessed_penalty),
                'paid_crm': str(paid_penalty),
                'remaining': '0.00',
                'due_at': last_due.isoformat(),
                'due_classification': ('term_until_final_scheduled_payment'
                                       if last_due > event_date else 'review_after_final_due'),
                'reconciliation_note': decision[1]}
        else:
            result['status'] = 'review'
            result['issues'].append('Пени или дата последнего платежа не согласованы с графиком CRM')
    else:
        result['penalty_candidate'] = {
            'assessed_crm': str(assessed_penalty),
            'paid_crm': str(paid_penalty),
            'remaining': str(assessed_penalty - paid_penalty),
            'due_at': last_due.isoformat(),
            'due_classification': ('term_until_final_scheduled_payment'
                                   if last_due > event_date else 'review_after_final_due')}
    return result
