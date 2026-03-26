import json
import os
import psycopg2
import urllib.request
import urllib.parse
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

        cur.execute("SELECT id, current_balance, rate, start_date, end_date FROM savings WHERE status='active'")
        savings_rows = cur.fetchall()
        count = 0
        total = Decimal('0')
        skipped = 0

        for row in savings_rows:
            s_id, s_bal, s_rate, s_start, s_end = row[0], Decimal(str(row[1])), Decimal(str(row[2])), str(row[3]), str(row[4]) if row[4] else None
            if s_bal <= 0:
                skipped += 1
                continue
            if accrual_date <= s_start:
                skipped += 1
                continue
            if s_end and accrual_date > s_end:
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
        tg_result = send_telegram_payment_reminders(cur, conn, accrual_date)
        tg_savings_result = send_telegram_savings_reminders(cur, conn, accrual_date)
        max_result = send_max_payment_reminders(cur, conn, accrual_date)
        max_savings_result = send_max_savings_reminders(cur, conn, accrual_date)

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
            'savings_push_reminders': savings_push_result,
            'telegram_reminders': tg_result,
            'telegram_savings_reminders': tg_savings_result,
            'max_reminders': max_result,
            'max_savings_reminders': max_savings_result
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

    tpl_payment_today_title = settings.get('tpl_payment_today_title', 'Платёж сегодня')
    tpl_payment_today_body = settings.get('tpl_payment_today_body', 'Сегодня дата платежа по займу {contract_no}. Сумма: {amount} руб.')
    tpl_payment_tomorrow_title = settings.get('tpl_payment_tomorrow_title', 'Платёж завтра')
    tpl_payment_tomorrow_body = settings.get('tpl_payment_tomorrow_body', 'До даты платежа по займу {contract_no} остался 1 день. Сумма: {amount} руб.')
    tpl_payment_days_title = settings.get('tpl_payment_days_title', 'Платёж через {days} дн.')
    tpl_payment_days_body = settings.get('tpl_payment_days_body', 'До даты платежа по займу {contract_no} осталось {days} дн. Сумма: {amount} руб.')
    tpl_overdue_title = settings.get('tpl_overdue_title', 'Просрочка платежа')
    tpl_overdue_body = settings.get('tpl_overdue_body', 'Платёж по займу {contract_no} просрочен. Сумма: {amount} руб. Во избежание пени оплатите как можно скорее.')

    reminders = []
    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            reminders.append(
                ('reminder_today', target_date, 'pending',
                 tpl_payment_today_title,
                 tpl_payment_today_body))
        elif days == 1:
            reminders.append(
                ('reminder_1d', target_date, 'pending',
                 tpl_payment_tomorrow_title,
                 tpl_payment_tomorrow_body))
        else:
            reminders.append(
                ('reminder_%dd' % days, target_date, 'pending',
                 tpl_payment_days_title.format(days=days),
                 tpl_payment_days_body.format(contract_no='{contract_no}', amount='{amount}', days=days)))

    if overdue_enabled:
        reminders.append(
            ('overdue_1d', today_str, 'overdue',
             tpl_overdue_title,
             tpl_overdue_body))

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
                title = title_tpl.format(contract_no=contract_no, amount=amount_str)
                body_text = body_tpl.format(contract_no=contract_no, amount=amount_str)
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

    tpl_savings_today_title = settings.get('tpl_savings_today_title', 'Договор сбережений истекает сегодня')
    tpl_savings_today_body = settings.get('tpl_savings_today_body', 'Сегодня истекает срок договора сбережений {contract_no}. Сумма: {amount} руб.')
    tpl_savings_tomorrow_title = settings.get('tpl_savings_tomorrow_title', 'Договор сбережений истекает завтра')
    tpl_savings_tomorrow_body = settings.get('tpl_savings_tomorrow_body', 'Завтра истекает срок договора сбережений {contract_no}. Сумма: {amount} руб.')
    tpl_savings_days_title = settings.get('tpl_savings_days_title', 'Окончание договора сбережений через {days} дн.')
    tpl_savings_days_body = settings.get('tpl_savings_days_body', 'Через {days} дн. истекает срок договора сбережений {contract_no}. Сумма: {amount} руб.')

    sent_total = 0
    failed_total = 0
    errors = []

    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            rtype = 'savings_end_today'
            title = tpl_savings_today_title
            body_tpl = tpl_savings_today_body
        elif days == 1:
            rtype = 'savings_end_1d'
            title = tpl_savings_tomorrow_title
            body_tpl = tpl_savings_tomorrow_body
        else:
            rtype = 'savings_end_%dd' % days
            title = tpl_savings_days_title.format(days=days)
            body_tpl = tpl_savings_days_body.format(contract_no='{contract_no}', amount='{amount}', days=days)

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
                body_text = body_tpl.format(contract_no=contract_no, amount=amount_str)
                title_text = title.format(contract_no=contract_no, amount=amount_str)
                payload = json.dumps({'title': title_text, 'body': body_text, 'url': '/'})

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


def get_telegram_settings(cur):
    try:
        cur.execute("SELECT key, value FROM telegram_settings")
        return {r[0]: r[1] for r in cur.fetchall()}
    except Exception:
        return {'enabled': 'false', 'reminder_days': '3,1,0', 'overdue_notify': 'true', 'savings_enabled': 'false', 'savings_reminder_days': '30,15,7'}


def get_bot_token(cur):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token:
        try:
            cur.execute("SELECT settings FROM notification_channels WHERE channel='telegram'")
            row = cur.fetchone()
            if row:
                ch = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                token = ch.get('bot_token', '')
        except Exception:
            pass
    return token


def send_tg_message(bot_token, chat_id, text):
    url = 'https://api.telegram.org/bot%s/sendMessage' % bot_token
    data = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=10)
    resp.read()


def send_max_message(bot_token, chat_id, text):
    url = 'https://botapi.max.ru/messages?access_token=%s&chat_id=%s' % (urllib.parse.quote(bot_token), chat_id)
    data = json.dumps({'text': text, 'format': 'html'}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=10)
    resp.read()


def get_max_bot_token():
    return os.environ.get('MAX_BOT_TOKEN', '')


def get_max_settings(cur):
    try:
        cur.execute("SELECT key, value FROM max_settings")
        rows = cur.fetchall()
        return {r[0]: r[1] for r in rows}
    except:
        return {}


def send_max_payment_reminders(cur, conn, check_date):
    settings = get_max_settings(cur)

    if settings.get('enabled', 'false') != 'true':
        return {'skipped': True, 'reason': 'MAX reminders disabled'}

    bot_token = get_max_bot_token()
    if not bot_token:
        return {'skipped': True, 'reason': 'MAX bot token not configured'}

    today_str = check_date if isinstance(check_date, str) else check_date.isoformat()
    today_date = date.fromisoformat(today_str) if isinstance(check_date, str) else check_date

    reminder_days_str = settings.get('reminder_days', '3,1,0')
    reminder_days = []
    for d in reminder_days_str.split(','):
        d = d.strip()
        if d.isdigit():
            reminder_days.append(int(d))

    overdue_enabled = settings.get('overdue_notify', 'true') == 'true'

    tpl_payment_today = settings.get('tpl_payment_today', 'Сегодня дата платежа по займу <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_payment_tomorrow = settings.get('tpl_payment_tomorrow', 'До даты платежа по займу <b>{contract_no}</b> остался <b>1 день</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_payment_days = settings.get('tpl_payment_days', 'До даты платежа по займу <b>{contract_no}</b> осталось <b>{days} дн.</b>\nСумма: <b>{amount}</b> руб.')
    tpl_overdue = settings.get('tpl_overdue', 'Платёж по займу <b>{contract_no}</b> просрочен.\nСумма: <b>{amount}</b> руб.\n\nВо избежание пени оплатите как можно скорее.')

    reminders = []
    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            reminders.append(('max_reminder_today', target_date, 'pending',
                tpl_payment_today))
        elif days == 1:
            reminders.append(('max_reminder_1d', target_date, 'pending',
                tpl_payment_tomorrow))
        else:
            reminders.append(('max_reminder_%dd' % days, target_date, 'pending',
                tpl_payment_days.format(contract_no='{contract_no}', amount='{amount}', days=days)))

    if overdue_enabled:
        reminders.append(('max_overdue_1d', today_str, 'overdue',
            tpl_overdue))

    sent_total = 0
    failed_total = 0
    errors = []

    for rtype, target_date, sched_status, body_tpl in reminders:
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
                    SELECT ns.setting_value FROM notification_settings ns
                    WHERE ns.user_id=%d AND ns.channel='max' AND ns.setting_key='loan_reminders'
                """ % user_id)
                ns_row = cur.fetchone()
                if ns_row and ns_row[0] == 'false':
                    continue

                cur.execute("""
                    SELECT id FROM max_auto_log
                    WHERE loan_id=%d AND schedule_id=%d AND user_id=%d AND reminder_type='%s'
                """ % (loan_id, ls_id, user_id, rtype))
                if cur.fetchone():
                    continue

                cur.execute("""
                    SELECT chat_id FROM max_subscribers
                    WHERE user_id=%d AND active=true
                """ % user_id)
                max_subs = cur.fetchall()
                if not max_subs:
                    continue

                amount_str = '{:,.2f}'.format(float(pay_amount)).replace(',', ' ')
                text = body_tpl.format(contract_no=contract_no, amount=amount_str)

                sub_sent = False
                for (chat_id,) in max_subs:
                    try:
                        send_max_message(bot_token, chat_id, text)
                        sent_total += 1
                        sub_sent = True
                    except Exception as e:
                        failed_total += 1
                        errors.append(str(e)[:200])

                if sub_sent:
                    cur.execute("""
                        INSERT INTO max_auto_log (loan_id, schedule_id, user_id, reminder_type)
                        VALUES (%d, %d, %d, '%s')
                        ON CONFLICT DO NOTHING
                    """ % (loan_id, ls_id, user_id, rtype))

    return {'sent': sent_total, 'failed': failed_total, 'errors': errors[:5]}


def send_max_savings_reminders(cur, conn, check_date):
    settings = get_max_settings(cur)

    if settings.get('savings_enabled', 'false') != 'true':
        return {'skipped': True, 'reason': 'MAX savings reminders disabled'}

    bot_token = get_max_bot_token()
    if not bot_token:
        return {'skipped': True, 'reason': 'MAX bot token not configured'}

    today_str = check_date if isinstance(check_date, str) else check_date.isoformat()
    today_date = date.fromisoformat(today_str) if isinstance(check_date, str) else check_date

    reminder_days_str = settings.get('savings_reminder_days', '30,15,7')
    reminder_days = []
    for d in reminder_days_str.split(','):
        d = d.strip()
        if d.isdigit():
            reminder_days.append(int(d))

    tpl_savings_today = settings.get('tpl_savings_today', 'Сегодня истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_savings_tomorrow = settings.get('tpl_savings_tomorrow', 'Завтра истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_savings_days = settings.get('tpl_savings_days', 'Через <b>{days} дн.</b> истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')

    sent_total = 0
    failed_total = 0
    errors = []

    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            rtype = 'max_savings_end_today'
            body_tpl = tpl_savings_today
        elif days == 1:
            rtype = 'max_savings_end_1d'
            body_tpl = tpl_savings_tomorrow
        else:
            rtype = 'max_savings_end_%dd' % days
            body_tpl = tpl_savings_days.format(contract_no='{contract_no}', amount='{amount}', days=days)

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
                    SELECT ns.setting_value FROM notification_settings ns
                    WHERE ns.user_id=%d AND ns.channel='max' AND ns.setting_key='savings_reminders'
                """ % user_id)
                ns_row = cur.fetchone()
                if ns_row and ns_row[0] == 'false':
                    continue

                cur.execute("""
                    SELECT id FROM max_auto_log
                    WHERE loan_id=%d AND schedule_id=0 AND user_id=%d AND reminder_type='%s'
                """ % (s_id, user_id, rtype))
                if cur.fetchone():
                    continue

                cur.execute("""
                    SELECT chat_id FROM max_subscribers
                    WHERE user_id=%d AND active=true
                """ % user_id)
                max_subs = cur.fetchall()
                if not max_subs:
                    continue

                amount_str = '{:,.2f}'.format(float(balance)).replace(',', ' ')
                text = body_tpl.format(contract_no=contract_no, amount=amount_str)

                sub_sent = False
                for (chat_id,) in max_subs:
                    try:
                        send_max_message(bot_token, chat_id, text)
                        sent_total += 1
                        sub_sent = True
                    except Exception as e:
                        failed_total += 1
                        errors.append(str(e)[:200])

                if sub_sent:
                    cur.execute("""
                        INSERT INTO max_auto_log (loan_id, schedule_id, user_id, reminder_type)
                        VALUES (%d, 0, %d, '%s')
                        ON CONFLICT DO NOTHING
                    """ % (s_id, user_id, rtype))

    return {'sent': sent_total, 'failed': failed_total, 'errors': errors[:5]}


def send_telegram_payment_reminders(cur, conn, check_date):
    settings = get_telegram_settings(cur)

    if settings.get('enabled', 'false') != 'true':
        return {'skipped': True, 'reason': 'Telegram reminders disabled'}

    bot_token = get_bot_token(cur)
    if not bot_token:
        return {'skipped': True, 'reason': 'Bot token not configured'}

    today_str = check_date if isinstance(check_date, str) else check_date.isoformat()
    today_date = date.fromisoformat(today_str) if isinstance(check_date, str) else check_date

    reminder_days_str = settings.get('reminder_days', '3,1,0')
    reminder_days = []
    for d in reminder_days_str.split(','):
        d = d.strip()
        if d.isdigit():
            reminder_days.append(int(d))

    overdue_enabled = settings.get('overdue_notify', 'true') == 'true'

    tpl_payment_today = settings.get('tpl_payment_today', 'Сегодня дата платежа по займу <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_payment_tomorrow = settings.get('tpl_payment_tomorrow', 'До даты платежа по займу <b>{contract_no}</b> остался <b>1 день</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_payment_days = settings.get('tpl_payment_days', 'До даты платежа по займу <b>{contract_no}</b> осталось <b>{days} дн.</b>\nСумма: <b>{amount}</b> руб.')
    tpl_overdue = settings.get('tpl_overdue', 'Платёж по займу <b>{contract_no}</b> просрочен.\nСумма: <b>{amount}</b> руб.\n\nВо избежание пени оплатите как можно скорее.')

    reminders = []
    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            reminders.append(('tg_reminder_today', target_date, 'pending',
                tpl_payment_today))
        elif days == 1:
            reminders.append(('tg_reminder_1d', target_date, 'pending',
                tpl_payment_tomorrow))
        else:
            reminders.append(('tg_reminder_%dd' % days, target_date, 'pending',
                tpl_payment_days.format(contract_no='{contract_no}', amount='{amount}', days=days)))

    if overdue_enabled:
        reminders.append(('tg_overdue_1d', today_str, 'overdue',
            tpl_overdue))

    sent_total = 0
    failed_total = 0
    errors = []

    for rtype, target_date, sched_status, body_tpl in reminders:
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
                    SELECT id FROM telegram_auto_log
                    WHERE loan_id=%d AND schedule_id=%d AND user_id=%d AND reminder_type='%s'
                """ % (loan_id, ls_id, user_id, rtype))
                if cur.fetchone():
                    continue

                cur.execute("""
                    SELECT chat_id FROM telegram_subscribers
                    WHERE user_id=%d AND active=true
                """ % user_id)
                tg_subs = cur.fetchall()
                if not tg_subs:
                    continue

                amount_str = '{:,.2f}'.format(float(pay_amount)).replace(',', ' ')
                text = body_tpl.format(contract_no=contract_no, amount=amount_str)

                sub_sent = False
                for (chat_id,) in tg_subs:
                    try:
                        send_tg_message(bot_token, chat_id, text)
                        sent_total += 1
                        sub_sent = True
                    except Exception as e:
                        failed_total += 1
                        errors.append(str(e)[:200])

                if sub_sent:
                    cur.execute("""
                        INSERT INTO telegram_auto_log (loan_id, schedule_id, user_id, reminder_type)
                        VALUES (%d, %d, %d, '%s')
                        ON CONFLICT DO NOTHING
                    """ % (loan_id, ls_id, user_id, rtype))

    return {'sent': sent_total, 'failed': failed_total, 'errors': errors[:5]}


def send_telegram_savings_reminders(cur, conn, check_date):
    settings = get_telegram_settings(cur)

    if settings.get('savings_enabled', 'false') != 'true':
        return {'skipped': True, 'reason': 'Telegram savings reminders disabled'}

    bot_token = get_bot_token(cur)
    if not bot_token:
        return {'skipped': True, 'reason': 'Bot token not configured'}

    today_str = check_date if isinstance(check_date, str) else check_date.isoformat()
    today_date = date.fromisoformat(today_str) if isinstance(check_date, str) else check_date

    reminder_days_str = settings.get('savings_reminder_days', '30,15,7')
    reminder_days = []
    for d in reminder_days_str.split(','):
        d = d.strip()
        if d.isdigit():
            reminder_days.append(int(d))

    tpl_savings_today = settings.get('tpl_savings_today', 'Сегодня истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_savings_tomorrow = settings.get('tpl_savings_tomorrow', 'Завтра истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')
    tpl_savings_days = settings.get('tpl_savings_days', 'Через <b>{days} дн.</b> истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб.')

    sent_total = 0
    failed_total = 0
    errors = []

    for days in reminder_days:
        target_date = (today_date + timedelta(days=days)).isoformat()
        if days == 0:
            rtype = 'tg_savings_end_today'
            body_tpl = tpl_savings_today
        elif days == 1:
            rtype = 'tg_savings_end_1d'
            body_tpl = tpl_savings_tomorrow
        else:
            rtype = 'tg_savings_end_%dd' % days
            body_tpl = tpl_savings_days.format(contract_no='{contract_no}', amount='{amount}', days=days)

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
                    SELECT id FROM telegram_auto_log
                    WHERE loan_id=%d AND schedule_id=0 AND user_id=%d AND reminder_type='%s'
                """ % (s_id, user_id, rtype))
                if cur.fetchone():
                    continue

                cur.execute("""
                    SELECT chat_id FROM telegram_subscribers
                    WHERE user_id=%d AND active=true
                """ % user_id)
                tg_subs = cur.fetchall()
                if not tg_subs:
                    continue

                amount_str = '{:,.2f}'.format(float(balance)).replace(',', ' ')
                text = body_tpl.format(contract_no=contract_no, amount=amount_str)

                sub_sent = False
                for (chat_id,) in tg_subs:
                    try:
                        send_tg_message(bot_token, chat_id, text)
                        sent_total += 1
                        sub_sent = True
                    except Exception as e:
                        failed_total += 1
                        errors.append(str(e)[:200])

                if sub_sent:
                    cur.execute("""
                        INSERT INTO telegram_auto_log (loan_id, schedule_id, user_id, reminder_type)
                        VALUES (%d, 0, %d, '%s')
                        ON CONFLICT DO NOTHING
                    """ % (s_id, user_id, rtype))

    return {'sent': sent_total, 'failed': failed_total, 'errors': errors[:5]}