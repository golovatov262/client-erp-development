import json
import os
import psycopg2
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def handler(event, context):
    """Ежедневный крон: начисление процентов на вклады + пометка просроченных займов. Вызывается по расписанию в 00:05."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400'}, 'body': ''}

    headers = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    conn = get_conn()
    cur = conn.cursor()

    try:
        accrual_date = body.get('date', date.today().isoformat())

        cur.execute("SELECT id, current_balance, rate, start_date FROM savings WHERE status='active'")
        savings_rows = cur.fetchall()
        count = 0
        total = Decimal('0')
        skipped = 0

        for row in savings_rows:
            s_id, s_bal, s_rate, s_start = row[0], Decimal(str(row[1])), Decimal(str(row[2])), str(row[3])
            if s_bal <= 0:
                skipped += 1
                continue
            if accrual_date <= s_start:
                skipped += 1
                continue
            daily_amount = (s_bal * s_rate / Decimal('100') / Decimal('365')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if daily_amount <= 0:
                skipped += 1
                continue
            cur.execute("SELECT id FROM savings_daily_accruals WHERE saving_id=%s AND accrual_date='%s'" % (s_id, accrual_date))
            if cur.fetchone():
                skipped += 1
                continue
            cur.execute("INSERT INTO savings_daily_accruals (saving_id, accrual_date, balance, rate, daily_amount) VALUES (%s, '%s', %s, %s, %s)" % (s_id, accrual_date, float(s_bal), float(s_rate), float(daily_amount)))
            cur.execute("UPDATE savings SET accrued_interest=accrued_interest+%s, updated_at=NOW() WHERE id=%s" % (float(daily_amount), s_id))
            count += 1
            total += daily_amount

        overdue_result = check_overdue_loans(cur, accrual_date)
        penalty_result = accrue_penalties(cur, accrual_date)
        push_result = send_payment_reminders(cur, conn, accrual_date)
        savings_push_result = send_savings_reminders(cur, conn, accrual_date)

        conn.commit()

        result = {
            'success': True,
            'date': accrual_date,
            'processed': count,
            'skipped': skipped,
            'total_accrued': float(total),
            'overdue': overdue_result,
            'penalties': penalty_result,
            'push_reminders': push_result,
            'savings_push_reminders': savings_push_result
        }
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps(result)}

    except Exception as e:
        conn.rollback()
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'error': str(e)})}
    finally:
        cur.close()
        conn.close()


def check_overdue_loans(cur, check_date):
    cur.execute("""
        SELECT DISTINCT ls.loan_id
        FROM loan_schedule ls
        JOIN loans l ON l.id = ls.loan_id
        WHERE l.status = 'active'
          AND ls.status = 'pending'
          AND ls.payment_date < '%s'
          AND COALESCE(ls.paid_amount, 0) < ls.payment_amount
    """ % check_date)
    overdue_loan_ids = [r[0] for r in cur.fetchall()]

    marked_overdue = 0
    for loan_id in overdue_loan_ids:
        cur.execute("UPDATE loans SET status='overdue', updated_at=NOW() WHERE id=%s AND status='active'" % loan_id)
        if cur.rowcount > 0:
            marked_overdue += 1

        cur.execute("""
            UPDATE loan_schedule
            SET status='overdue',
                overdue_days = (DATE '%s' - payment_date)
            WHERE loan_id=%s AND status='pending' AND payment_date < '%s'
              AND COALESCE(paid_amount, 0) < payment_amount
        """ % (check_date, loan_id, check_date))

    cur.execute("""
        SELECT DISTINCT l.id
        FROM loans l
        WHERE l.status = 'overdue'
          AND NOT EXISTS (
              SELECT 1 FROM loan_schedule ls
              WHERE ls.loan_id = l.id
                AND ls.status IN ('pending', 'overdue')
                AND ls.payment_date < '%s'
                AND COALESCE(ls.paid_amount, 0) < ls.payment_amount
          )
    """ % check_date)
    restored_ids = [r[0] for r in cur.fetchall()]
    restored = 0
    for loan_id in restored_ids:
        cur.execute("UPDATE loans SET status='active', updated_at=NOW() WHERE id=%s AND status='overdue'" % loan_id)
        if cur.rowcount > 0:
            restored += 1
        cur.execute("UPDATE loan_schedule SET status='pending', overdue_days=0 WHERE loan_id=%s AND status='overdue'" % loan_id)

    return {
        'checked_date': check_date,
        'marked_overdue': marked_overdue,
        'restored_active': restored,
        'total_overdue_loans': len(overdue_loan_ids)
    }


PENALTY_DAILY_RATE = Decimal('0.000547')

def accrue_penalties(cur, check_date):
    cur.execute("""
        SELECT ls.id, ls.loan_id, ls.principal_amount, COALESCE(ls.paid_amount, 0), ls.penalty_amount
        FROM loan_schedule ls
        JOIN loans l ON l.id = ls.loan_id
        WHERE ls.status = 'overdue'
          AND l.status = 'overdue'
          AND ls.payment_date < '%s'
    """ % check_date)
    rows = cur.fetchall()

    total_penalty = Decimal('0')
    updated = 0

    for row in rows:
        ls_id, loan_id, principal, paid, current_penalty = row
        principal = Decimal(str(principal))
        paid = Decimal(str(paid))
        current_penalty = Decimal(str(current_penalty)) if current_penalty else Decimal('0')

        overdue_principal = principal - min(paid, principal)
        if overdue_principal <= 0:
            continue

        daily_penalty = (overdue_principal * PENALTY_DAILY_RATE).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if daily_penalty <= 0:
            continue

        new_penalty = current_penalty + daily_penalty
        cur.execute("UPDATE loan_schedule SET penalty_amount=%s WHERE id=%s" % (float(new_penalty), ls_id))
        total_penalty += daily_penalty
        updated += 1

    return {
        'schedules_penalized': updated,
        'total_daily_penalty': float(total_penalty)
    }


def get_push_settings(cur):
    try:
        cur.execute("SELECT key, value FROM push_settings")
        return {r[0]: r[1] for r in cur.fetchall()}
    except Exception:
        return {'enabled': 'true', 'reminder_days': '3,1,0', 'overdue_notify': 'true', 'remind_time': '09:00'}


def send_payment_reminders(cur, conn, check_date):
    settings = get_push_settings(cur)

    if settings.get('enabled', 'true') != 'true':
        return {'skipped': True, 'reason': 'Push reminders disabled'}

    vapid_private = os.environ.get('VAPID_PRIVATE_KEY', '')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY', '')
    vapid_email = os.environ.get('VAPID_EMAIL', 'mailto:admin@example.com')
    if not vapid_private or not vapid_public:
        return {'skipped': True, 'reason': 'VAPID keys not configured'}

    try:
        from pywebpush import webpush
    except ImportError:
        return {'skipped': True, 'reason': 'pywebpush not installed'}

    today_str = check_date if isinstance(check_date, str) else check_date.isoformat()
    today_date = date.fromisoformat(today_str) if isinstance(check_date, str) else check_date

    reminder_days_str = settings.get('reminder_days', '3,1,0')
    reminder_days = []
    for d in reminder_days_str.split(','):
        d = d.strip()
        if d.isdigit():
            reminder_days.append(int(d))

    overdue_enabled = settings.get('overdue_notify', 'true') == 'true'

    reminders = []
    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            reminders.append(
                ('reminder_today', target_date, 'pending',
                 'Платёж сегодня',
                 'Сегодня дата платежа по займу %s. Сумма: %s руб.'))
        elif days == 1:
            reminders.append(
                ('reminder_1d', target_date, 'pending',
                 'Платёж завтра',
                 'До даты платежа по займу %s остался 1 день. Сумма: %s руб.'))
        else:
            reminders.append(
                ('reminder_%dd' % days, target_date, 'pending',
                 'Платёж через %d дн.' % days,
                 'До даты платежа по займу %%s осталось %d дн. Сумма: %%s руб.' % days))

    if overdue_enabled:
        reminders.append(
            ('overdue_1d', today_str, 'overdue',
             'Просрочка платежа',
             'Платёж по займу %s просрочен. Сумма: %s руб. Во избежание пени оплатите как можно скорее.'))

    sent_total = 0
    failed_total = 0
    errors = []

    for rtype, target_date, sched_status, title_tpl, body_tpl in reminders:
        cur.execute("""
            SELECT ls.id, ls.loan_id, ls.payment_amount, l.contract_no, l.member_id
            FROM loan_schedule ls
            JOIN loans l ON l.id = ls.loan_id
            WHERE ls.payment_date = '%s'
              AND ls.status = '%s'
              AND COALESCE(ls.paid_amount, 0) < ls.payment_amount
        """ % (target_date, sched_status))
        schedules = cur.fetchall()

        for ls_id, loan_id, pay_amount, contract_no, member_id in schedules:
            cur.execute("""
                SELECT u.id FROM users u
                WHERE u.member_id = %d AND u.role = 'client' AND u.status = 'active'
            """ % member_id)
            user_rows = cur.fetchall()

            for (user_id,) in user_rows:
                cur.execute("""
                    SELECT id FROM push_auto_log
                    WHERE loan_id=%d AND schedule_id=%d AND user_id=%d AND reminder_type='%s'
                """ % (loan_id, ls_id, user_id, rtype))
                if cur.fetchone():
                    continue

                cur.execute("""
                    SELECT id, endpoint, p256dh, auth FROM push_subscriptions
                    WHERE user_id=%d AND user_agent != 'unsubscribed' AND user_agent != 'expired'
                """ % user_id)
                subs = cur.fetchall()
                if not subs:
                    continue

                amount_str = '{:,.2f}'.format(float(pay_amount)).replace(',', ' ')
                title = title_tpl
                body_text = body_tpl % (contract_no, amount_str)
                payload = json.dumps({'title': title, 'body': body_text, 'url': '/'})

                sub_sent = False
                for sub_id, endpoint, p256dh, auth_key in subs:
                    try:
                        webpush(
                            subscription_info={'endpoint': endpoint, 'keys': {'p256dh': p256dh, 'auth': auth_key}},
                            data=payload,
                            vapid_private_key=vapid_private,
                            vapid_claims={'sub': vapid_email}
                        )
                        sent_total += 1
                        sub_sent = True
                    except Exception as e:
                        failed_total += 1
                        err = str(e)[:200]
                        errors.append(err)
                        if '410' in err or '404' in err:
                            cur.execute("UPDATE push_subscriptions SET user_agent='expired' WHERE id=%d" % sub_id)

                if sub_sent:
                    cur.execute("""
                        INSERT INTO push_auto_log (loan_id, schedule_id, user_id, reminder_type)
                        VALUES (%d, %d, %d, '%s')
                        ON CONFLICT DO NOTHING
                    """ % (loan_id, ls_id, user_id, rtype))

    return {'sent': sent_total, 'failed': failed_total, 'errors': errors[:5]}


def send_savings_reminders(cur, conn, check_date):
    settings = get_push_settings(cur)

    if settings.get('savings_enabled', 'true') != 'true':
        return {'skipped': True, 'reason': 'Savings push reminders disabled'}

    vapid_private = os.environ.get('VAPID_PRIVATE_KEY', '')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY', '')
    vapid_email = os.environ.get('VAPID_EMAIL', 'mailto:admin@example.com')
    if not vapid_private or not vapid_public:
        return {'skipped': True, 'reason': 'VAPID keys not configured'}

    try:
        from pywebpush import webpush
    except ImportError:
        return {'skipped': True, 'reason': 'pywebpush not installed'}

    today_str = check_date if isinstance(check_date, str) else check_date.isoformat()
    today_date = date.fromisoformat(today_str) if isinstance(check_date, str) else check_date

    reminder_days_str = settings.get('savings_reminder_days', '30,15,7')
    reminder_days = []
    for d in reminder_days_str.split(','):
        d = d.strip()
        if d.isdigit():
            reminder_days.append(int(d))

    sent_total = 0
    failed_total = 0
    errors = []

    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            rtype = 'savings_end_today'
            title = 'Договор сбережений истекает сегодня'
            body_tpl = 'Сегодня истекает срок договора сбережений %s. Сумма: %s руб.'
        elif days == 1:
            rtype = 'savings_end_1d'
            title = 'Договор сбережений истекает завтра'
            body_tpl = 'Завтра истекает срок договора сбережений %s. Сумма: %s руб.'
        else:
            rtype = 'savings_end_%dd' % days
            title = 'Окончание договора сбережений через %d дн.' % days
            body_tpl = 'Через %d дн. истекает срок договора сбережений %%s. Сумма: %%s руб.' % days

        cur.execute("""
            SELECT s.id, s.contract_no, s.current_balance, s.member_id
            FROM savings s
            WHERE s.status = 'active'
              AND s.end_date = '%s'
        """ % target_date)
        savings_rows = cur.fetchall()

        for s_id, contract_no, balance, member_id in savings_rows:
            cur.execute("""
                SELECT u.id FROM users u
                WHERE u.member_id = %d AND u.role = 'client' AND u.status = 'active'
            """ % member_id)
            user_rows = cur.fetchall()

            for (user_id,) in user_rows:
                cur.execute("""
                    SELECT id FROM push_auto_log
                    WHERE loan_id=%d AND schedule_id=0 AND user_id=%d AND reminder_type='%s'
                """ % (s_id, user_id, rtype))
                if cur.fetchone():
                    continue

                cur.execute("""
                    SELECT id, endpoint, p256dh, auth FROM push_subscriptions
                    WHERE user_id=%d AND user_agent != 'unsubscribed' AND user_agent != 'expired'
                """ % user_id)
                subs = cur.fetchall()
                if not subs:
                    continue

                amount_str = '{:,.2f}'.format(float(balance)).replace(',', ' ')
                body_text = body_tpl % (contract_no, amount_str)
                payload = json.dumps({'title': title, 'body': body_text, 'url': '/'})

                sub_sent = False
                for sub_id, endpoint, p256dh, auth_key in subs:
                    try:
                        webpush(
                            subscription_info={'endpoint': endpoint, 'keys': {'p256dh': p256dh, 'auth': auth_key}},
                            data=payload,
                            vapid_private_key=vapid_private,
                            vapid_claims={'sub': vapid_email}
                        )
                        sent_total += 1
                        sub_sent = True
                    except Exception as e:
                        failed_total += 1
                        err = str(e)[:200]
                        errors.append(err)
                        if '410' in err or '404' in err:
                            cur.execute("UPDATE push_subscriptions SET user_agent='expired' WHERE id=%d" % sub_id)

                if sub_sent:
                    cur.execute("""
                        INSERT INTO push_auto_log (loan_id, schedule_id, user_id, reminder_type)
                        VALUES (%d, 0, %d, '%s')
                        ON CONFLICT DO NOTHING
                    """ % (s_id, user_id, rtype))

    return {'sent': sent_total, 'failed': failed_total, 'errors': errors[:5]}