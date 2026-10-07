"""Unified, forward-only loan payment allocation engine (v2)."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal('0.01')
EPS = Decimal('0.005')


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
    cur.execute("""UPDATE loan_schedule SET paid_amount=%s, paid_date=CASE WHEN %s>0 THEN %s ELSE paid_date END,
        status=%s, payment_id=CASE WHEN %s>0 THEN %s ELSE payment_id END WHERE id=%s""",
        (paid, paid, payment_date, status, paid, payment_id, row_id))


def _recalculate_future_in_place(cur, loan_id, balance, payment_date):
    """Reduce payment while preserving contractual dates, row IDs and term."""
    cur.execute("""SELECT id,payment_date FROM loan_schedule
        WHERE loan_id=%s AND payment_date>%s AND COALESCE(paid_amount,0)=0
          AND status IN ('pending','overdue','partial') ORDER BY payment_no,id FOR UPDATE""",
        (loan_id, _month_end(payment_date)))
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


def _recalculate_future_reduce_term(cur, loan_id, balance, payment_date):
    """Keep the contractual payment and shorten the remaining schedule."""
    cur.execute("""SELECT id,payment_no,payment_date FROM loan_schedule
        WHERE loan_id=%s AND payment_date>%s AND COALESCE(paid_amount,0)=0
          AND status IN ('pending','overdue','partial') ORDER BY payment_no,id FOR UPDATE""",
        (loan_id, _month_end(payment_date)))
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
                      source_ref=None, forced=None, early_strategy='reduce_payment'):
    """Post one payment atomically. Caller owns commit/rollback."""
    payment_date = payment_date if isinstance(payment_date, date) else date.fromisoformat(str(payment_date))
    amount = money(amount)
    if amount <= 0:
        raise ValueError('Сумма платежа должна быть больше нуля')
    if source_ref:
        cur.execute("SELECT id FROM loan_payments WHERE source=%s AND source_ref=%s", (source, source_ref))
        duplicate = cur.fetchone()
        if duplicate:
            return {'payment_id': duplicate[0], 'duplicate': True}
    cur.execute("SELECT balance,status FROM loans WHERE id=%s FOR UPDATE", (loan_id,))
    loan = cur.fetchone()
    if not loan:
        raise ValueError('Договор займа не найден')
    old_balance, loan_status = money(loan[0]), loan[1]
    if loan_status == 'closed' or old_balance <= EPS:
        raise ValueError('Договор займа закрыт')

    mode = 'manual' if forced else 'automatic'
    if forced:
        forced = {k: money(v) for k, v in forced.items() if k in ('interest','principal','penalty')}
        if money(sum(forced.values(), Decimal('0'))) != amount:
            raise ValueError('Принудительное распределение должно быть равно сумме платежа')

    cur.execute("""INSERT INTO loan_payments
        (loan_id,payment_date,amount,principal_part,interest_part,penalty_part,payment_type,
         description,source,source_ref,engine_version)
        VALUES (%s,%s,%s,0,0,0,'regular',%s,%s,%s,'v2') RETURNING id""",
        (loan_id, payment_date, amount, description or '', source, source_ref))
    payment_id = cur.fetchone()[0]
    remaining = amount
    totals = {'interest': Decimal('0'), 'principal': Decimal('0'), 'penalty': Decimal('0'), 'early_principal': Decimal('0')}

    cur.execute("""SELECT id,payment_no,principal_amount,interest_amount,COALESCE(paid_amount,0),payment_date
        FROM loan_schedule WHERE loan_id=%s AND payment_date<=%s
          AND status NOT IN ('paid','holiday','holiday_pending') ORDER BY payment_no,id FOR UPDATE""",
        (loan_id, _month_end(payment_date)))
    rows = [list(r) for r in cur.fetchall()]

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
        # Global waterfall: all due interest, then all due principal, oldest first.
        for component, column in (('interest', 3), ('principal', 2)):
            for row in rows:
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
            new_monthly, new_term = _recalculate_future_reduce_term(cur, loan_id, new_balance, payment_date)
        else:
            new_monthly = _recalculate_future_in_place(cur, loan_id, new_balance, payment_date)
    return {'payment_id': payment_id, 'principal_part': float(principal_total),
            'interest_part': float(totals['interest']), 'penalty_part': float(totals['penalty']),
            'early_principal': float(totals['early_principal']), 'unapplied': float(max(remaining, 0)),
            'new_balance': float(new_balance), 'new_monthly': float(new_monthly) if new_monthly else None,
            'new_term': new_term,
            'schedule_recalculated': bool(new_monthly),
            'engine_version': 'v2'}
