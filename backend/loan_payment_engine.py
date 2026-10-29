"""Unified, forward-only loan payment allocation engine (v2)."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
import re
from zoneinfo import ZoneInfo

try:
    from nbki_payment_posting_snapshot import capture_loan_state, store_payment_snapshot
except ImportError:
    from backend.nbki_payment_posting_snapshot import capture_loan_state, store_payment_snapshot

CENT = Decimal('0.01')
EPS = Decimal('0.005')
MOSCOW = ZoneInfo('Europe/Moscow')


def parse_event_time_msk(payment_date: date, value: str | None) -> datetime | None:
    """Parse operator-confirmed occurrence time, never the CRM creation time."""
    if not value:
        return None
    if not isinstance(value, str) or not re.fullmatch(r'\d{2}:\d{2}(?::\d{2})?', value):
        raise ValueError('Укажите фактическое время платежа в формате ЧЧ:ММ (МСК)')
    try:
        parsed = time.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Укажите фактическое время платежа в формате ЧЧ:ММ (МСК)') from exc
    if parsed.tzinfo is not None:
        raise ValueError('Время платежа указывается без часового пояса: МСК задана отдельно')
    occurred_at = datetime.combine(payment_date, parsed, tzinfo=MOSCOW)
    if occurred_at > datetime.now(MOSCOW) + timedelta(minutes=1):
        raise ValueError('Фактическое время платежа не может быть в будущем')
    return occurred_at


def money(value):
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def _month_end(d):
    if d.month == 12:
        return date(d.year + 1, 1, 1) - __import__('datetime').timedelta(days=1)
    return date(d.year, d.month + 1, 1) - __import__('datetime').timedelta(days=1)


def _insert_allocation(cur, payment_id, schedule_id, component, amount, mode):
    amount = money(amount)
    if amount > 0:
        cur.execute("""INSERT INTO loan_payment_allocations
            (payment_id,schedule_id,component,amount,allocation_mode)
            VALUES (%s,%s,%s,%s,%s)""",
            (payment_id, schedule_id, component, amount, mode))


def _covered_parts(cur, row):
    """Combine frozen legacy inference with exact v2 allocations."""
    principal, interest, paid = money(row[2]), money(row[3]), money(row[4])
    cur.execute("""SELECT COALESCE(SUM(amount) FILTER (WHERE component='interest'),0),
        COALESCE(SUM(amount) FILTER (WHERE component='principal'),0), COALESCE(SUM(amount),0)
        FROM loan_payment_allocations WHERE schedule_id=%s""", (row[0],))
    v2_interest, v2_principal, v2_total = map(money, cur.fetchone())
    legacy_paid = max(Decimal('0'), paid - v2_total)
    legacy_interest = min(legacy_paid, interest)
    legacy_principal = min(max(legacy_paid - legacy_interest, Decimal('0')), principal)
    return money(legacy_interest + v2_interest), money(legacy_principal + v2_principal)


def _refresh_row(cur, row_id, principal, interest, paid, due, payment_date, payment_id):
    required = money(principal) + money(interest)
    if paid + EPS >= required:
        status = 'paid'
    elif paid > EPS:
        status = 'overdue' if due < payment_date else 'partial'
    else:
        status = 'overdue' if due < payment_date else 'pending'
    overdue_days = max(0, (payment_date - due).days)
    cur.execute("""UPDATE loan_schedule SET paid_amount=%s, paid_date=CASE WHEN %s>0 THEN %s ELSE paid_date END,
        status=%s, overdue_days=%s, payment_id=CASE WHEN %s>0 THEN %s ELSE payment_id END WHERE id=%s""",
        (paid, paid, payment_date, status, overdue_days, paid, payment_id, row_id))


def _recalculate_future_in_place(cur, loan_id, balance, payment_date, include_current=False):
    """Reduce payment while preserving contractual dates, row IDs and term."""
    cur.execute("""SELECT id,payment_date FROM loan_schedule
        WHERE loan_id=%s AND payment_date>%s AND COALESCE(paid_amount,0)=0
          AND status IN ('pending','overdue','partial') ORDER BY payment_no,id FOR UPDATE""",
        (loan_id, payment_date if include_current else _month_end(payment_date)))
    rows = cur.fetchall()
    if not rows or balance <= EPS:
        return None
    cur.execute("SELECT rate,schedule_type FROM loans WHERE id=%s", (loan_id,))
    rate, schedule_type = cur.fetchone()
    rate_m = Decimal(str(rate)) / Decimal('1200')
    count = len(rows)
    if schedule_type == 'annuity' and rate_m:
        factor = (Decimal('1') + rate_m) ** count
        monthly = money(balance * rate_m * factor / (factor - Decimal('1')))
    else:
        monthly = money(balance / count)
    running = money(balance)
    for index, (sid, _) in enumerate(rows):
        interest = money(running * rate_m)
        principal = running if index == count - 1 else min(running, money(monthly - interest))
        payment = money(principal + interest)
        running = money(running - principal)
        cur.execute("""UPDATE loan_schedule SET payment_amount=%s,principal_amount=%s,
            interest_amount=%s,balance_after=%s,status='pending' WHERE id=%s""",
            (payment, principal, interest, running, sid))
    cur.execute("UPDATE loans SET monthly_payment=%s,updated_at=NOW() WHERE id=%s", (monthly, loan_id))
    return monthly


def _recalculate_future_reduce_term(cur, loan_id, balance, payment_date, include_current=False):
    """Keep the contractual payment and shorten the remaining schedule."""
    cur.execute("""SELECT id,payment_no,payment_date FROM loan_schedule
        WHERE loan_id=%s AND payment_date>%s AND COALESCE(paid_amount,0)=0
          AND status IN ('pending','overdue','partial') ORDER BY payment_no,id FOR UPDATE""",
        (loan_id, payment_date if include_current else _month_end(payment_date)))
    rows = cur.fetchall()
    if not rows or balance <= EPS:
        return None, None
    cur.execute("SELECT rate,monthly_payment FROM loans WHERE id=%s", (loan_id,))
    rate, fixed_payment = cur.fetchone()
    rate_m = Decimal(str(rate)) / Decimal('1200')
    fixed_payment = money(fixed_payment)
    if fixed_payment <= money(balance * rate_m):
        raise ValueError('Текущий платёж не покрывает проценты; сократить срок нельзя')

    running = money(balance)
    used = []
    for sid, payment_no, due in rows:
        interest = money(running * rate_m)
        principal = min(running, money(fixed_payment - interest))
        payment = money(principal + interest)
        running = money(running - principal)
        cur.execute("""UPDATE loan_schedule SET payment_amount=%s,principal_amount=%s,
            interest_amount=%s,balance_after=%s,status='pending' WHERE id=%s""",
            (payment, principal, interest, running, sid))
        used.append((sid, payment_no, due))
        if running <= EPS:
            break
    if running > EPS:
        raise ValueError('В оставшихся периодах нельзя сохранить текущий платёж')

    used_ids = {row[0] for row in used}
    for sid, _, _ in rows:
        if sid not in used_ids:
            cur.execute("DELETE FROM loan_schedule WHERE id=%s", (sid,))
    last_no, last_date = used[-1][1], used[-1][2]
    cur.execute("""UPDATE loans SET term_months=%s,end_date=%s,updated_at=NOW()
        WHERE id=%s""", (last_no, last_date, loan_id))
    return fixed_payment, last_no


def post_loan_payment(cur, loan_id, amount, payment_date, description='', source='manual',
                      source_ref=None, forced=None, early_strategy='reduce_payment',
                      event_time_msk=None):
    """Post one payment atomically. Caller owns commit/rollback."""
    payment_date = payment_date if isinstance(payment_date, date) else date.fromisoformat(str(payment_date))
    event_occurred_at = parse_event_time_msk(payment_date, event_time_msk)
    if event_occurred_at is not None and source != 'manual':
        raise ValueError('Время, введённое оператором, допустимо только для ручного платежа')
    amount = money(amount)
    if amount <= 0:
        raise ValueError('Сумма платежа должна быть больше нуля')
    if source_ref:
        cur.execute("SELECT id FROM loan_payments WHERE source=%s AND source_ref=%s", (source, source_ref))
        duplicate = cur.fetchone()
        if duplicate:
            return {'payment_id': duplicate[0], 'duplicate': True}
    cur.execute("SELECT balance,status,rate FROM loans WHERE id=%s FOR UPDATE", (loan_id,))
    loan = cur.fetchone()
    if not loan:
        raise ValueError('Договор займа не найден')
    old_balance, loan_status, annual_rate = money(loan[0]), loan[1], Decimal(str(loan[2]))
    if loan_status == 'closed' or old_balance <= EPS:
        raise ValueError('Договор займа закрыт')
    nbki_state_before = capture_loan_state(cur, loan_id)

    mode = 'manual' if forced else 'automatic'
    if forced:
        forced = {k: money(v) for k, v in forced.items() if k in ('interest','principal','penalty')}
        if money(sum(forced.values(), Decimal('0'))) != amount:
            raise ValueError('Принудительное распределение должно быть равно сумме платежа')

    cur.execute("""INSERT INTO loan_payments
        (loan_id,payment_date,amount,principal_part,interest_part,penalty_part,payment_type,
         description,source,source_ref,engine_version,nbki_recorded_at,
         nbki_event_occurred_at,nbki_event_time_basis)
        VALUES (%s,%s,%s,0,0,0,'regular',%s,%s,%s,'v2',clock_timestamp(),%s,%s)
        RETURNING id""",
        (loan_id, payment_date, amount, description or '', source, source_ref,
         event_occurred_at, 'operator_entered' if event_occurred_at else None))
    payment_id = cur.fetchone()[0]
    remaining = amount
    totals = {'interest': Decimal('0'), 'principal': Decimal('0'), 'penalty': Decimal('0'), 'early_principal': Decimal('0')}

    # При крупном досрочном платеже в текущем периоде проценты начисляются
    # за фактические дни от предыдущей даты графика, а не за полный месяц.
    cur.execute("""SELECT s.id,s.payment_no,s.payment_date,s.payment_amount,s.principal_amount,
        s.interest_amount,COALESCE(s.paid_amount,0) FROM loan_schedule s
        WHERE s.loan_id=%s AND s.payment_date>=%s AND s.payment_date<=%s
          AND s.status NOT IN ('paid','holiday','holiday_pending')
        ORDER BY s.payment_no LIMIT 1 FOR UPDATE""", (loan_id, payment_date, _month_end(payment_date)))
    current_row = cur.fetchone()
    if (current_row and payment_date < current_row[2] and
            amount > money(current_row[3]) + EPS and money(current_row[6]) <= EPS):
        cur.execute("""SELECT COUNT(*) FROM loan_schedule WHERE loan_id=%s AND payment_no<%s
            AND status NOT IN ('paid','holiday','holiday_pending')""", (loan_id, current_row[1]))
        if cur.fetchone()[0] == 0:
            cur.execute("SELECT MAX(payment_date) FROM loan_schedule WHERE loan_id=%s AND payment_no<%s", (loan_id, current_row[1]))
            previous_due = cur.fetchone()[0]
            if previous_due:
                actual_days = max(0, (payment_date - previous_due).days)
                actual_interest = money(old_balance * annual_rate / Decimal('100') * Decimal(actual_days) / Decimal('365'))
                cur.execute("""UPDATE loan_schedule SET interest_amount=%s,payment_amount=principal_amount+%s
                    WHERE id=%s""", (actual_interest, actual_interest, current_row[0]))

    cur.execute("""SELECT id,payment_no,principal_amount,interest_amount,COALESCE(paid_amount,0),payment_date
        FROM loan_schedule WHERE loan_id=%s AND payment_date<=%s
          AND status NOT IN ('paid','holiday','holiday_pending') ORDER BY payment_no,id FOR UPDATE""",
        (loan_id, _month_end(payment_date)))
    rows = [list(r) for r in cur.fetchall()]
    had_overdue = any(row[5] < payment_date for row in rows)

    # Если текущий период уже закрыт крупным досрочным платежом, начисляем
    # проценты только за дни до следующего перевода на уменьшившийся остаток.
    if not rows:
        cur.execute("""SELECT MAX(payment_date) FROM loan_payments WHERE loan_id=%s AND id<>%s
            AND engine_version='v2' AND payment_type IN ('early_partial','early_full')
            AND payment_date<%s""", (loan_id, payment_id, payment_date))
        previous_early_date = cur.fetchone()[0]
        if previous_early_date:
            actual_days = (payment_date - previous_early_date).days
            if actual_days > 0:
                interim_interest = min(remaining, money(old_balance * annual_rate / Decimal('100') * Decimal(actual_days) / Decimal('365')))
                if interim_interest > EPS:
                    _insert_allocation(cur, payment_id, None, 'interest', interim_interest, 'automatic')
                    totals['interest'] += interim_interest
                    remaining -= interim_interest

    if forced:
        # Forced allocation is explicit, but its interest/principal parts are still
        # attached to schedule rows so balances and statuses remain reproducible.
        for component, column in (('interest', 3), ('principal', 2)):
            component_left = forced.get(component, Decimal('0'))
            for row in rows:
                if component_left <= EPS:
                    break
                paid_i, paid_p = _covered_parts(cur, row)
                already = paid_i if component == 'interest' else paid_p
                capacity = max(Decimal('0'), money(row[column]) - already)
                take = min(component_left, capacity)
                if take > 0:
                    _insert_allocation(cur, payment_id, row[0], component, take, mode)
                    row[4] = money(row[4]) + take
                    totals[component] += take
                    component_left -= take
                    remaining -= take
            # Explicit principal beyond due rows is an intentional balance correction.
            if component == 'principal' and component_left > EPS:
                take = min(component_left, old_balance - totals['principal'])
                _insert_allocation(cur, payment_id, None, 'early_principal', take, mode)
                totals['early_principal'] += take
                remaining -= take
        penalty = forced.get('penalty', Decimal('0'))
        if penalty > EPS:
            _insert_allocation(cur, payment_id, None, 'penalty', penalty, mode)
            totals['penalty'] += penalty
            remaining -= penalty
    else:
        # При просрочке текущий период ещё не наступил: сначала закрываем все
        # просроченные проценты и основной долг, затем остаток идёт досрочно в ОД.
        allocation_rows = [row for row in rows if row[5] < payment_date] if had_overdue else rows
        cur.execute("""SELECT MAX(payment_no) FROM loan_schedule WHERE loan_id=%s
            AND status NOT IN ('holiday','holiday_pending')""", (loan_id,))
        final_no = cur.fetchone()[0]
        final_period_reached = any(row[1] == final_no for row in allocation_rows)
        for component, column in (('interest', 3), ('principal', 2)):
            if component == 'principal' and final_period_reached and remaining > EPS:
                # Penalties accrue in schedule rows but become payable only with
                # the final scheduled installment. They are not paid_amount.
                cur.execute("""SELECT COALESCE(SUM(penalty_amount),0)
                    FROM loan_schedule WHERE loan_id=%s""", (loan_id,))
                assessed_penalty = money(cur.fetchone()[0])
                cur.execute("""SELECT COALESCE(SUM(penalty_part),0)
                    FROM loan_payments WHERE loan_id=%s""", (loan_id,))
                paid_penalty = money(cur.fetchone()[0])
                if paid_penalty > assessed_penalty + CENT:
                    raise ValueError('Оплаченная пеня превышает начисленную по графику')
                take_penalty = min(remaining, max(Decimal('0'), assessed_penalty - paid_penalty))
                if take_penalty > EPS:
                    _insert_allocation(cur, payment_id, None, 'penalty', take_penalty, mode)
                    totals['penalty'] += take_penalty
                    remaining -= take_penalty
            for row in allocation_rows:
                if remaining <= EPS:
                    break
                paid_i, paid_p = _covered_parts(cur, row)
                already = paid_i if component == 'interest' else paid_p
                need = max(Decimal('0'), money(row[column]) - already)
                take = min(remaining, need)
                if take > 0:
                    _insert_allocation(cur, payment_id, row[0], component, take, mode)
                    row[4] = money(row[4]) + take
                    totals[component] += take
                    remaining -= take
        if remaining > EPS:
            take = min(remaining, max(Decimal('0'), old_balance - totals['principal']))
            _insert_allocation(cur, payment_id, None, 'early_principal', take, mode)
            totals['early_principal'] += take
            remaining -= take

    for row in rows:
        _refresh_row(cur, row[0], row[2], row[3], money(row[4]), row[5], payment_date, payment_id)
    if remaining > EPS:
        _insert_allocation(cur, payment_id, None, 'unapplied', remaining, mode)

    principal_total = money(totals['principal'] + totals['early_principal'])
    new_balance = max(Decimal('0'), money(old_balance - principal_total))
    payment_type = 'early_full' if new_balance <= EPS else ('early_partial' if totals['early_principal'] > 0 else 'regular')
    cur.execute("""UPDATE loan_payments SET principal_part=%s,interest_part=%s,penalty_part=%s,
        payment_type=%s WHERE id=%s""", (principal_total, totals['interest'], totals['penalty'], payment_type, payment_id))
    cur.execute("UPDATE loans SET balance=%s,status=%s,updated_at=NOW() WHERE id=%s",
                (new_balance, 'closed' if new_balance <= EPS else 'active', loan_id))
    if early_strategy not in ('reduce_payment', 'reduce_term'):
        raise ValueError('Неизвестный вариант досрочного погашения')
    new_monthly = None
    new_term = None
    if totals['early_principal'] > EPS:
        if new_balance <= EPS:
            cur.execute("""DELETE FROM loan_schedule WHERE loan_id=%s AND payment_date>%s
                AND COALESCE(paid_amount,0)=0""", (loan_id, _month_end(payment_date)))
            cur.execute("UPDATE loans SET end_date=%s,updated_at=NOW() WHERE id=%s", (payment_date, loan_id))
        elif early_strategy == 'reduce_term':
            new_monthly, new_term = _recalculate_future_reduce_term(cur, loan_id, new_balance, payment_date, had_overdue)
        else:
            new_monthly = _recalculate_future_in_place(cur, loan_id, new_balance, payment_date, had_overdue)
    nbki_state_after = capture_loan_state(cur, loan_id)
    store_payment_snapshot(cur, payment_id, loan_id, payment_date,
                           nbki_state_before, nbki_state_after)
    return {'payment_id': payment_id, 'principal_part': float(principal_total),
            'interest_part': float(totals['interest']), 'penalty_part': float(totals['penalty']),
            'early_principal': float(totals['early_principal']), 'unapplied': float(max(remaining, 0)),
            'new_balance': float(new_balance), 'new_monthly': float(new_monthly) if new_monthly else None,
            'new_term': new_term,
            'schedule_recalculated': bool(new_monthly),
            'engine_version': 'v2'}
