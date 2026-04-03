import json
import os
import re
import imaplib
import email
from email.header import decode_header
from datetime import date, datetime, timedelta
from decimal import Decimal
import psycopg2

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
}

IMAP_HOST = os.environ.get('BANK_IMAP_HOST', 'mail.jino.ru')
IMAP_PORT = int(os.environ.get('BANK_IMAP_PORT', '143'))
IMAP_USER = os.environ.get('BANK_IMAP_USER', 'cber@sll-expert.ru')
IMAP_PASS = os.environ.get('BANK_IMAP_PASSWORD', '')
NOTIFY_EMAIL = 'info@sll-expert.ru'


def cors_json(data, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(data, default=str),
    }


def esc(s):
    if s is None:
        return ''
    return str(s).replace("'", "''")


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def send_error_notification(subject, body_text):
    """Отправляет уведомление об ошибке на info@sll-expert.ru через SMTP из настроек БД."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT settings FROM notification_channels WHERE channel='email'")
        row = cur.fetchone()
        conn.close()
        if not row:
            return
        ch = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        smtp_host = ch.get('smtp_host', '')
        smtp_port = int(ch.get('smtp_port', 587))
        smtp_user = ch.get('smtp_user', '')
        smtp_pass = ch.get('smtp_pass', '')
        from_email = ch.get('from_email', '')
        from_name = ch.get('from_name', 'Система')
        if not smtp_host or not smtp_user or not from_email:
            return
        import smtplib
        from email.mime.text import MIMEText
        msg = MIMEText(body_text, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = '%s <%s>' % (from_name, from_email) if from_name else from_email
        msg['To'] = NOTIFY_EMAIL
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_email, [NOTIFY_EMAIL], msg.as_string())
    except Exception:
        pass


# ─── Парсер формата 1С (1CClientBankExchange v1.03) ────────────────────────

def parse_1c_statement(text):
    """Парсит текстовый файл формата 1CClientBankExchange.
    Возвращает список секций выписок, каждая содержит:
    - account: номер расчётного счёта
    - date_from, date_to: период выписки
    - opening_balance, closing_balance
    - transactions: список операций
    """
    sections = []
    current_section = None
    current_txn = None
    lines = text.splitlines()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line == 'СекцияДокумент=Платёжное поручение' or line.startswith('СекцияДокумент='):
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
            current_txn = {'doc_type': line.split('=', 1)[1] if '=' in line else ''}
            continue

        if line == 'КонецДокумента':
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
            current_txn = None
            continue

        if line == 'СекцияРас662чёт662Сч' or line.startswith('СекцияРас662чётСч') or line == 'СекцияРасч662Сч' or '=' not in line:
            if line == 'КонецРасч662Сч' or line == 'КонецФайла':
                if current_section:
                    sections.append(current_section)
                    current_section = None
            continue

        if '=' not in line:
            continue

        key, val = line.split('=', 1)
        key = key.strip()
        val = val.strip()

        if key == 'РасsчётСч' or key == 'РасsчётныйСчёт' or key == 'РасsчСч':
            pass

        if current_txn is not None:
            if key == 'Номер':
                current_txn['document_number'] = val
            elif key == 'Дата':
                current_txn['document_date'] = val
            elif key == 'Сумма':
                current_txn['amount'] = val
            elif key == 'ПлательщикСчет':
                current_txn['payer_account'] = val
            elif key == 'Плательщик':
                current_txn['payer_name'] = val
            elif key == 'ПлательщикИНН':
                current_txn['payer_inn'] = val
            elif key == 'ПлательщикБанк1':
                current_txn['payer_bank'] = val
            elif key == 'ПлательщикБИК':
                current_txn['payer_bik'] = val
            elif key == 'ПолучательСчет':
                current_txn['payee_account'] = val
            elif key == 'Получатель':
                current_txn['payee_name'] = val
            elif key == 'ПолучательИНН':
                current_txn['payee_inn'] = val
            elif key == 'ПолучательБанк1':
                current_txn['payee_bank'] = val
            elif key == 'ПолучательБИК':
                current_txn['payee_bik'] = val
            elif key == 'НазначениеПлатежа':
                current_txn['purpose'] = val
            elif key == 'ДатаСписwordsано' or key == 'ДатаСписано':
                current_txn['debit_date'] = val
            elif key == 'ДатаПоступwordsило' or key == 'ДатаПоступило':
                current_txn['credit_date'] = val
        else:
            if key == 'РасsчёткнійСч' or key == 'РасчСч' or key == 'РасчётныйСчёт':
                pass

        if key == 'ДатаНачала' and current_section is None:
            pass
        if key == 'ДатаКонца' and current_section is None:
            pass

    if current_section:
        sections.append(current_section)

    return sections


def parse_1c_file(text):
    """Более robust парсер формата 1CClientBankExchange v1.03 UTF-8."""
    sections = []
    current_section = None
    current_txn = None
    in_section = False
    lines = text.splitlines()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith('СекцияРасч'):
            if current_section:
                sections.append(current_section)
            current_section = {
                'account': '',
                'date_from': '',
                'date_to': '',
                'opening_balance': 0.0,
                'closing_balance': 0.0,
                'transactions': [],
            }
            in_section = True
            current_txn = None
            continue

        if line.startswith('КонецРасч'):
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
                current_txn = None
            if current_section:
                sections.append(current_section)
                current_section = None
            in_section = False
            continue

        if line.startswith('СекцияДокумент'):
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
            doc_type = line.split('=', 1)[1] if '=' in line else ''
            current_txn = {'doc_type': doc_type}
            continue

        if line == 'КонецДокумента':
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
            current_txn = None
            continue

        if line == 'КонецФайла':
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
                current_txn = None
            if current_section:
                sections.append(current_section)
                current_section = None
            break

        if '=' not in line:
            continue

        key, val = line.split('=', 1)
        key = key.strip()
        val = val.strip()

        if current_txn is not None:
            txn_map = {
                'Номер': 'document_number',
                'Дата': 'document_date',
                'Сумма': 'amount',
                'ПлательщикСчет': 'payer_account',
                'Плательщик': 'payer_name',
                'ПлательщикИНН': 'payer_inn',
                'ПлательщикКПП': 'payer_kpp',
                'ПлательщикБанк1': 'payer_bank',
                'ПлательщикБИК': 'payer_bik',
                'ПлательщикКорpsчёт': 'payer_corr',
                'ПолучательСчет': 'payee_account',
                'Получатель': 'payee_name',
                'ПолучательИНН': 'payee_inn',
                'ПолучательКПП': 'payee_kpp',
                'ПолучательБанк1': 'payee_bank',
                'ПолучательБИК': 'payee_bik',
                'ПолучательКорpsчёт': 'payee_corr',
                'НазначениеПлатежа': 'purpose',
                'ДатаСписано': 'debit_date',
                'ДатаПоступило': 'credit_date',
                'Плательщик1': 'payer_name_full',
                'Получатель1': 'payee_name_full',
            }
            field = txn_map.get(key)
            if field:
                current_txn[field] = val
        elif current_section is not None:
            if key == 'РасsчётныйСчёт' or key == 'РасчСч' or 'РасчетныйСчет' in key or 'РасчётныйСчёт' in key:
                current_section['account'] = val
            elif key == 'ДатаНачала':
                current_section['date_from'] = val
            elif key == 'ДатаКонца':
                current_section['date_to'] = val
            elif key == 'НачsальныйОстаток' or 'НачальныйОстаток' in key:
                current_section['opening_balance'] = safe_float(val)
            elif key == 'КонечныйОстаток' or 'Конечный' in key and 'Остаток' in key:
                current_section['closing_balance'] = safe_float(val)
        else:
            pass

    return sections


def robust_parse_1c(text):
    """Самый надёжный парсер 1С — работает с любыми вариациями ключей."""
    sections = []
    current_section = None
    current_txn = None
    lines = text.splitlines()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        lower = line.lower()

        if lower.startswith('секциярасч'):
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
                current_txn = None
            if current_section:
                sections.append(current_section)
            current_section = {
                'account': '', 'date_from': '', 'date_to': '',
                'opening_balance': 0.0, 'closing_balance': 0.0,
                'transactions': [],
            }
            continue

        if lower.startswith('конецрасч'):
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
                current_txn = None
            if current_section:
                sections.append(current_section)
                current_section = None
            continue

        if lower.startswith('секциядокумент'):
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
            doc_type = line.split('=', 1)[1].strip() if '=' in line else ''
            current_txn = {'doc_type': doc_type}
            continue

        if lower == 'конецдокумента':
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
            current_txn = None
            continue

        if lower == 'конецфайла':
            if current_txn and current_section:
                current_section['transactions'].append(current_txn)
                current_txn = None
            if current_section:
                sections.append(current_section)
                current_section = None
            break

        if '=' not in line:
            continue

        key, val = line.split('=', 1)
        key = key.strip()
        val = val.strip()
        kl = key.lower()

        if current_txn is not None:
            if kl == 'номер':
                current_txn['document_number'] = val
            elif kl == 'дата':
                current_txn['document_date'] = val
            elif kl == 'сумма':
                current_txn['amount'] = val
            elif kl == 'плательщиксчет':
                current_txn['payer_account'] = val
            elif kl in ('плательщик', 'плательщик1'):
                current_txn.setdefault('payer_name', val)
            elif kl == 'плательщикинн':
                current_txn['payer_inn'] = val
            elif kl in ('плательщикбанк1', 'плательщикбанк'):
                current_txn['payer_bank'] = val
            elif kl == 'плательщикбик':
                current_txn['payer_bik'] = val
            elif kl == 'получательсчет':
                current_txn['payee_account'] = val
            elif kl in ('получатель', 'получатель1'):
                current_txn.setdefault('payee_name', val)
            elif kl == 'получательинн':
                current_txn['payee_inn'] = val
            elif kl in ('получательбанк1', 'получательбанк'):
                current_txn['payee_bank'] = val
            elif kl == 'получательбик':
                current_txn['payee_bik'] = val
            elif kl == 'назначениеплатежа':
                current_txn['purpose'] = val
            elif kl == 'датасписано':
                current_txn['debit_date'] = val
            elif kl == 'датапоступило':
                current_txn['credit_date'] = val
        elif current_section is not None:
            if 'расч' in kl and ('счет' in kl or 'сч' in kl or 'счёт' in kl):
                current_section['account'] = val
            elif kl == 'датаначала':
                current_section['date_from'] = val
            elif kl == 'датаконца':
                current_section['date_to'] = val
            elif 'начальн' in kl and 'остаток' in kl:
                current_section['opening_balance'] = safe_float(val)
            elif 'конечн' in kl and 'остаток' in kl:
                current_section['closing_balance'] = safe_float(val)

    if current_txn and current_section:
        current_section['transactions'].append(current_txn)
    if current_section:
        sections.append(current_section)

    return sections


def safe_float(val):
    try:
        return float(val.replace(',', '.').replace(' ', ''))
    except (ValueError, AttributeError):
        return 0.0


def parse_1c_date(val):
    """Парсит дату из формата 1С: ДД.ММ.ГГГГ"""
    if not val:
        return None
    try:
        parts = val.split('.')
        if len(parts) == 3:
            return '%s-%s-%s' % (parts[2], parts[1], parts[0])
    except Exception:
        pass
    return val


# ─── IMAP: получение писем с вложениями ────────────────────────────────────

def fetch_emails_from_imap(target_date=None):
    """Подключается к IMAP, ищет письма с вложениями .txt за указанную дату.
    Возвращает список dict: {subject, date, attachments: [{filename, content}]}
    """
    if not IMAP_PASS:
        return [], 'BANK_IMAP_PASSWORD не задан'

    results = []
    try:
        mail = imaplib.IMAP4(IMAP_HOST, IMAP_PORT)
        mail.login(IMAP_USER, IMAP_PASS)
        mail.select('INBOX')

        search_criteria = 'ALL'
        if target_date:
            if isinstance(target_date, str):
                dt = datetime.strptime(target_date, '%Y-%m-%d')
            else:
                dt = target_date
            date_str = dt.strftime('%d-%b-%Y')
            search_criteria = '(SINCE "%s")' % date_str

        status, msg_ids = mail.search(None, search_criteria)
        if status != 'OK' or not msg_ids[0]:
            mail.logout()
            return [], None

        for msg_id in msg_ids[0].split():
            status, msg_data = mail.fetch(msg_id, '(RFC822)')
            if status != 'OK':
                continue

            msg = email.message_from_bytes(msg_data[0][1])
            subject = ''
            raw_subject = msg.get('Subject', '')
            if raw_subject:
                decoded = decode_header(raw_subject)
                parts = []
                for data, charset in decoded:
                    if isinstance(data, bytes):
                        parts.append(data.decode(charset or 'utf-8', errors='replace'))
                    else:
                        parts.append(data)
                subject = ''.join(parts)

            msg_date = msg.get('Date', '')

            attachments = []
            for part in msg.walk():
                content_disposition = str(part.get('Content-Disposition', ''))
                if 'attachment' not in content_disposition:
                    continue
                filename = part.get_filename()
                if filename:
                    decoded_fn = decode_header(filename)
                    fn_parts = []
                    for data, charset in decoded_fn:
                        if isinstance(data, bytes):
                            fn_parts.append(data.decode(charset or 'utf-8', errors='replace'))
                        else:
                            fn_parts.append(data)
                    filename = ''.join(fn_parts)

                if not filename or not filename.lower().endswith('.txt'):
                    continue

                content = part.get_payload(decode=True)
                if content:
                    try:
                        text = content.decode('utf-8')
                    except UnicodeDecodeError:
                        try:
                            text = content.decode('windows-1251')
                        except UnicodeDecodeError:
                            text = content.decode('utf-8', errors='replace')

                    if '1CClientBankExchange' in text or 'СекцияРасч' in text.replace(' ', ''):
                        attachments.append({'filename': filename, 'content': text})

            if attachments:
                results.append({
                    'subject': subject,
                    'date': msg_date,
                    'msg_id': msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id),
                    'attachments': attachments,
                })

        mail.logout()
        return results, None

    except Exception as e:
        return [], 'Ошибка IMAP: %s' % str(e)


# ─── Бизнес-логика: разнесение по договорам ───────────────────────────────

def extract_contract_no(purpose_text):
    if not purpose_text:
        return None
    patterns = [
        r'(?:договор[у]?|дог\.?|д\.?)\s*(?:№|N|#|номер)?\s*([А-Яа-яA-Za-z]?[\-]?\d{3}[\-]\d{5,18})',
        r'(?:№|N|#)\s*([А-Яа-яA-Za-z]?[\-]?\d{3}[\-]\d{5,18})',
        r'\b(\d{3}[\-]\d{5,18})\b',
    ]
    for pattern in patterns:
        m = re.search(pattern, purpose_text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def match_contract(cur, contract_no):
    if not contract_no:
        return None, None, None
    cur.execute("SELECT id, 'loan' as entity FROM loans WHERE contract_no='%s' AND status IN ('active','overdue') UNION ALL SELECT id, 'saving' as entity FROM savings WHERE contract_no='%s' AND status='active'" % (esc(contract_no), esc(contract_no)))
    row = cur.fetchone()
    if row:
        return contract_no, row[1], row[0]
    cur.execute("SELECT id, 'loan' as entity FROM loans WHERE contract_no='%s' UNION ALL SELECT id, 'saving' as entity FROM savings WHERE contract_no='%s'" % (esc(contract_no), esc(contract_no)))
    row = cur.fetchone()
    if row:
        return contract_no, row[1], row[0]
    return contract_no, None, None


def process_loan_payment(cur, conn, loan_id, amount, payment_date, description):
    cur.execute("SELECT balance, rate, schedule_type, status FROM loans WHERE id=%s" % loan_id)
    loan = cur.fetchone()
    if not loan or loan[3] == 'closed':
        return None, 'Loan closed or not found'
    bal = float(loan[0])
    amt = float(amount)
    cur.execute("""
        SELECT id, payment_amount, principal_amount, interest_amount,
               COALESCE(paid_amount, 0), COALESCE(penalty_amount, 0)
        FROM loan_schedule WHERE loan_id=%s AND status IN ('pending','partial','overdue')
        ORDER BY payment_date ASC
    """ % loan_id)
    rows = cur.fetchall()
    principal_part = Decimal('0')
    interest_part = Decimal('0')
    penalty_part = Decimal('0')
    remaining = Decimal(str(amt))
    for row in rows:
        sid, s_amt, s_principal, s_interest, s_paid, s_penalty = row
        s_penalty = Decimal(str(s_penalty or 0))
        s_interest = Decimal(str(s_interest or 0))
        s_principal = Decimal(str(s_principal or 0))
        s_paid = Decimal(str(s_paid or 0))
        s_due = Decimal(str(s_amt or 0)) + s_penalty - s_paid
        if remaining <= 0 or s_due <= 0:
            continue
        allocated = min(remaining, s_due)
        if s_penalty > 0:
            pnp = min(remaining, s_penalty)
            penalty_part += pnp
            remaining -= pnp
        if remaining > 0 and s_interest > 0:
            ip = min(remaining, s_interest)
            interest_part += ip
            remaining -= ip
        if remaining > 0 and s_principal > 0:
            pp = min(remaining, s_principal)
            principal_part += pp
            remaining -= pp
        new_paid = s_paid + allocated
        ns = 'paid' if new_paid >= Decimal(str(s_amt)) + s_penalty else 'partial'
        cur.execute("UPDATE loan_schedule SET paid_amount=%s, paid_date='%s', status='%s' WHERE id=%s" % (float(new_paid), payment_date, ns, sid))
    if remaining > 0:
        extra_principal = min(remaining, Decimal(str(bal)) - principal_part)
        if extra_principal > 0:
            principal_part += extra_principal
    cur.execute("INSERT INTO loan_payments (loan_id, payment_date, amount, principal_part, interest_part, penalty_part, payment_type, description) VALUES (%s, '%s', %s, %s, %s, %s, 'regular', '%s') RETURNING id" % (loan_id, payment_date, amt, float(principal_part), float(interest_part), float(penalty_part), esc(description)))
    pay_id = cur.fetchone()[0]
    cur.execute("UPDATE loan_schedule SET payment_id=%s WHERE loan_id=%s AND paid_date='%s' AND payment_id IS NULL AND status IN ('paid','partial')" % (pay_id, loan_id, payment_date))
    nb = Decimal(str(bal)) - principal_part
    if nb < 0:
        nb = Decimal('0')
    cur.execute("UPDATE loans SET balance=%s, updated_at=NOW() WHERE id=%s" % (float(nb), loan_id))
    if nb == 0:
        cur.execute("UPDATE loans SET status='closed', updated_at=NOW() WHERE id=%s" % loan_id)
    return pay_id, None


def process_savings_deposit(cur, conn, saving_id, amount, payment_date, description):
    cur.execute("SELECT current_balance, status FROM savings WHERE id=%s" % saving_id)
    sav = cur.fetchone()
    if not sav or sav[1] != 'active':
        return None, 'Saving not active'
    amt = float(amount)
    cur.execute("INSERT INTO savings_transactions (saving_id,transaction_date,amount,transaction_type,is_cash,description) VALUES (%s,'%s',%s,'deposit',false,'%s')" % (saving_id, payment_date, amt, esc(description)))
    cur.execute("UPDATE savings SET current_balance=current_balance+%s, amount=amount+%s, updated_at=NOW() WHERE id=%s" % (amt, amt, saving_id))
    return True, None


# ─── Определение direction (CREDIT/DEBIT) по счёту организации ─────────────

def determine_direction(txn, org_account):
    """Определяет направление операции: CREDIT (поступление) или DEBIT (списание)
    на основании того, является ли счёт организации плательщиком или получателем."""
    if txn.get('credit_date'):
        return 'CREDIT'
    if txn.get('debit_date'):
        return 'DEBIT'
    payee_acc = txn.get('payee_account', '')
    payer_acc = txn.get('payer_account', '')
    if payee_acc == org_account:
        return 'CREDIT'
    if payer_acc == org_account:
        return 'DEBIT'
    return 'UNKNOWN'


# ─── Загрузка выписки из распарсенного файла 1С ───────────────────────────

def load_statement_from_1c(cur, conn, section, connection_id):
    """Загружает выписку из распарсенной секции файла 1С в БД.
    Возвращает dict с результатом."""
    account = section.get('account', '')
    date_from = parse_1c_date(section.get('date_from', ''))
    date_to = parse_1c_date(section.get('date_to', ''))
    stmt_date = date_to or date_from
    if not stmt_date:
        return {'error': 'Не указана дата выписки'}

    cur.execute("SELECT id FROM bank_statements WHERE connection_id=%s AND statement_date='%s'" % (connection_id, esc(stmt_date)))
    if cur.fetchone():
        return {'skipped': True, 'reason': 'Выписка за %s уже загружена' % stmt_date}

    ob = section.get('opening_balance', 0.0)
    cb = section.get('closing_balance', 0.0)
    txns = section.get('transactions', [])

    dt_val = 0.0
    ct_val = 0.0
    for txn in txns:
        amt = safe_float(txn.get('amount', '0'))
        direction = determine_direction(txn, account)
        if direction == 'DEBIT':
            dt_val += amt
        elif direction == 'CREDIT':
            ct_val += amt

    cur.execute("INSERT INTO bank_statements (connection_id, statement_date, opening_balance, closing_balance, debit_turnover, credit_turnover, transaction_count, status) VALUES (%s, '%s', %s, %s, %s, %s, %s, 'loaded') RETURNING id" % (connection_id, esc(stmt_date), ob, cb, dt_val, ct_val, len(txns)))
    stmt_id = cur.fetchone()[0]

    matched = 0
    unmatched = 0

    for txn in txns:
        doc_number = txn.get('document_number', '')
        doc_date = parse_1c_date(txn.get('document_date', '')) or stmt_date
        amount_val = safe_float(txn.get('amount', '0'))
        direction = determine_direction(txn, account)
        purpose = txn.get('purpose', '')
        payer_name = txn.get('payer_name', '')
        payer_inn = txn.get('payer_inn', '')
        payer_account = txn.get('payer_account', '')
        payer_bank = txn.get('payer_bank', '')
        payer_bik = txn.get('payer_bik', '')
        payee_name = txn.get('payee_name', '')
        payee_inn = txn.get('payee_inn', '')
        payee_account = txn.get('payee_account', '')
        payee_bank = txn.get('payee_bank', '')
        payee_bik = txn.get('payee_bik', '')

        sber_uuid = 'doc_%s_%s_%s' % (doc_number, doc_date, amount_val)
        cur.execute("SELECT id FROM bank_transactions WHERE sber_uuid='%s' AND statement_id=%s" % (esc(sber_uuid), stmt_id))
        if cur.fetchone():
            continue

        contract_no = extract_contract_no(purpose)
        m_contract, m_entity, m_entity_id = match_contract(cur, contract_no)
        m_status = 'matched' if m_entity_id else ('no_contract' if not contract_no else 'not_found')

        op_date = doc_date + 'T00:00:00' if doc_date and 'T' not in doc_date else doc_date

        cur.execute("INSERT INTO bank_transactions (statement_id, sber_uuid, operation_date, document_date, document_number, amount, direction, payment_purpose, payer_name, payer_inn, payer_account, payer_bank_name, payer_bik, payee_name, payee_inn, payee_account, payee_bank_name, payee_bik, matched_contract_no, matched_entity, matched_entity_id, match_status) VALUES (%s, '%s', '%s', '%s', '%s', %s, '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', %s, %s, %s, '%s') RETURNING id" % (
            stmt_id, esc(sber_uuid), esc(op_date), esc(doc_date), esc(doc_number),
            amount_val, esc(direction), esc(purpose),
            esc(payer_name), esc(payer_inn), esc(payer_account), esc(payer_bank), esc(payer_bik),
            esc(payee_name), esc(payee_inn), esc(payee_account), esc(payee_bank), esc(payee_bik),
            ("'%s'" % esc(m_contract)) if m_contract else 'NULL',
            ("'%s'" % esc(m_entity)) if m_entity else 'NULL',
            m_entity_id if m_entity_id else 'NULL',
            m_status))
        txn_id = cur.fetchone()[0]

        if m_status == 'matched' and direction == 'CREDIT' and amount_val > 0:
            pay_date = doc_date or stmt_date
            desc = 'Авто из выписки %s' % stmt_date
            if m_entity == 'loan':
                pay_id, _ = process_loan_payment(cur, conn, m_entity_id, Decimal(str(amount_val)), pay_date, desc)
                if pay_id:
                    cur.execute("UPDATE bank_transactions SET match_status='applied', payment_id=%s WHERE id=%s" % (pay_id, txn_id))
                    matched += 1
                else:
                    cur.execute("UPDATE bank_transactions SET match_status='error' WHERE id=%s" % txn_id)
                    unmatched += 1
            elif m_entity == 'saving':
                ok, _ = process_savings_deposit(cur, conn, m_entity_id, Decimal(str(amount_val)), pay_date, desc)
                if ok:
                    cur.execute("UPDATE bank_transactions SET match_status='applied' WHERE id=%s" % txn_id)
                    matched += 1
                else:
                    cur.execute("UPDATE bank_transactions SET match_status='error' WHERE id=%s" % txn_id)
                    unmatched += 1
        else:
            if m_status != 'matched':
                unmatched += 1

    cur.execute("UPDATE bank_statements SET matched_count=%s, unmatched_count=%s WHERE id=%s" % (matched, unmatched, stmt_id))
    cur.execute("UPDATE bank_connections SET last_sync_at=NOW(), last_sync_status='ok', last_sync_error='', updated_at=NOW() WHERE id=%s" % connection_id)
    conn.commit()
    return {'total': len(txns), 'matched': matched, 'unmatched': unmatched, 'statement_date': stmt_date}


# ─── Handlers ──────────────────────────────────────────────────────────────

def handle_connections():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT bc.id, bc.org_id, o.short_name, bc.account_number,
               bc.is_active, bc.last_sync_at, bc.last_sync_status, bc.last_sync_error,
               bc.created_at
        FROM bank_connections bc
        LEFT JOIN organizations o ON o.id = bc.org_id
        ORDER BY bc.id
    """)
    rows = cur.fetchall()
    conn.close()
    return [{
        'id': r[0], 'org_id': r[1], 'org_name': r[2] or '', 'account_number': r[3],
        'is_active': r[4], 'last_sync_at': r[5], 'last_sync_status': r[6] or 'never',
        'last_sync_error': r[7] or '', 'created_at': r[8],
        'has_token': True, 'token_expires_at': None,
    } for r in rows]


def handle_save_connection(body):
    org_id = body.get('org_id')
    account = body.get('account_number', '').strip()
    if not org_id or not account:
        return {'error': 'org_id и account_number обязательны'}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO bank_connections (org_id, account_number, is_active) VALUES (%s, '%s', true)" % (int(org_id), esc(account)))
    conn.commit()
    conn.close()
    return {'success': True}


def handle_toggle_connection(body):
    cid = body.get('connection_id')
    is_active = body.get('is_active', False)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE bank_connections SET is_active=%s, updated_at=NOW() WHERE id=%s" % ('true' if is_active else 'false', int(cid)))
    conn.commit()
    conn.close()
    return {'success': True}


def handle_fetch_from_email(body):
    """Загрузить выписки из почтового ящика."""
    target_date = body.get('date')
    if not target_date:
        target_date = (date.today() - timedelta(days=1)).isoformat()

    source = body.get('source', 'manual')

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO bank_sync_log (source, status, started_at) VALUES ('%s', 'running', NOW()) RETURNING id" % esc(source))
    log_id = cur.fetchone()[0]
    conn.commit()

    emails, err = fetch_emails_from_imap(target_date)
    if err:
        cur.execute("UPDATE bank_sync_log SET status='error', finished_at=NOW(), errors='%s' WHERE id=%s" % (esc(err), log_id))
        conn.commit()
        conn.close()
        send_error_notification(
            'Ошибка получения банковских выписок',
            'Не удалось подключиться к почте %s:\n%s\n\nДата: %s' % (IMAP_USER, err, target_date)
        )
        return {'error': err}

    if not emails:
        cur.execute("UPDATE bank_sync_log SET status='ok', finished_at=NOW(), emails_found=0 WHERE id=%s" % log_id)
        conn.commit()
        conn.close()
        return {'message': 'Писем с выписками не найдено', 'emails_found': 0, 'results': []}

    cur.execute("SELECT id, account_number, org_id FROM bank_connections WHERE is_active=true")
    connections = cur.fetchall()
    conn_map = {}
    for c in connections:
        conn_map[c[1]] = {'id': c[0], 'org_id': c[2]}

    all_results = []
    errors = []

    for eml in emails:
        for att in eml['attachments']:
            try:
                sections = robust_parse_1c(att['content'])
                if not sections:
                    errors.append('Файл %s: не удалось распарсить формат 1С' % att['filename'])
                    continue

                for section in sections:
                    account = section.get('account', '')
                    conn_info = conn_map.get(account)
                    if not conn_info:
                        cur.execute("SELECT id FROM bank_connections WHERE account_number='%s'" % esc(account))
                        row = cur.fetchone()
                        if row:
                            conn_info = {'id': row[0]}
                        else:
                            errors.append('Счёт %s не найден в подключениях' % account)
                            continue

                    result = load_statement_from_1c(cur, conn, section, conn_info['id'])
                    result['account'] = account
                    result['filename'] = att['filename']
                    all_results.append(result)
            except Exception as e:
                errors.append('Файл %s: %s' % (att['filename'], str(e)))

    loaded = [r for r in all_results if not r.get('error') and not r.get('skipped')]
    total_txns = sum(r.get('total', 0) for r in loaded)
    total_matched = sum(r.get('matched', 0) for r in loaded)
    log_status = 'error' if errors else 'ok'

    cur.execute("UPDATE bank_sync_log SET status='%s', finished_at=NOW(), emails_found=%s, statements_loaded=%s, transactions_total=%s, transactions_matched=%s, errors=%s, details='%s' WHERE id=%s" % (
        log_status, len(emails), len(loaded), total_txns, total_matched,
        ("'%s'" % esc('\n'.join(errors))) if errors else 'NULL',
        esc(json.dumps(all_results, default=str)),
        log_id
    ))
    conn.commit()
    conn.close()

    if errors:
        send_error_notification(
            'Ошибки при загрузке банковских выписок',
            'Дата: %s\n\nОшибки:\n%s\n\nУспешно загружено: %d' % (
                target_date, '\n'.join(errors), len(loaded)
            )
        )

    return {
        'emails_found': len(emails),
        'results': all_results,
        'errors': errors,
    }


def handle_statements(params):
    conn = get_conn()
    cur = conn.cursor()
    cid = params.get('connection_id')
    limit = int(params.get('limit', '30'))
    offset = int(params.get('offset', '0'))
    where = ''
    if cid:
        where = 'WHERE bs.connection_id=%s' % int(cid)
    cur.execute("""
        SELECT bs.id, bs.connection_id, o.short_name,
               bs.statement_date, bs.opening_balance, bs.closing_balance,
               bs.debit_turnover, bs.credit_turnover,
               bs.transaction_count, bs.matched_count, bs.unmatched_count,
               bs.status, bs.created_at
        FROM bank_statements bs
        JOIN bank_connections bc ON bc.id = bs.connection_id
        LEFT JOIN organizations o ON o.id = bc.org_id
        %s
        ORDER BY bs.statement_date DESC, bs.id DESC
        LIMIT %s OFFSET %s
    """ % (where, limit, offset))
    rows = cur.fetchall()
    count_where = where
    cur.execute("SELECT COUNT(*) FROM bank_statements bs JOIN bank_connections bc ON bc.id = bs.connection_id %s" % count_where)
    total = cur.fetchone()[0]
    conn.close()
    items = [{
        'id': r[0], 'connection_id': r[1], 'org_name': r[2] or '',
        'statement_date': r[3], 'opening_balance': float(r[4] or 0),
        'closing_balance': float(r[5] or 0), 'debit_turnover': float(r[6] or 0),
        'credit_turnover': float(r[7] or 0), 'transaction_count': r[8],
        'matched_count': r[9], 'unmatched_count': r[10], 'status': r[11],
        'created_at': r[12],
    } for r in rows]
    return {'items': items, 'total': total}


def handle_transactions(params):
    conn = get_conn()
    cur = conn.cursor()
    stmt_id = params.get('statement_id')
    match_status = params.get('match_status')
    where_parts = []
    if stmt_id:
        where_parts.append('bt.statement_id=%s' % int(stmt_id))
    if match_status:
        where_parts.append("bt.match_status='%s'" % esc(match_status))
    where = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''
    cur.execute("""
        SELECT bt.id, bt.statement_id, bt.sber_uuid, bt.operation_date, bt.document_date,
               bt.document_number, bt.amount, bt.direction, bt.payment_purpose,
               bt.payer_name, bt.payer_inn, bt.payee_name, bt.payee_inn,
               bt.matched_contract_no, bt.matched_entity, bt.matched_entity_id,
               bt.match_status, bt.payment_id, bt.created_at
        FROM bank_transactions bt
        %s
        ORDER BY bt.operation_date DESC, bt.id DESC
        LIMIT 500
    """ % where)
    rows = cur.fetchall()
    conn.close()
    return [{
        'id': r[0], 'statement_id': r[1], 'sber_uuid': r[2],
        'operation_date': r[3], 'document_date': r[4], 'document_number': r[5],
        'amount': float(r[6] or 0), 'direction': r[7], 'payment_purpose': r[8],
        'payer_name': r[9], 'payer_inn': r[10], 'payee_name': r[11], 'payee_inn': r[12],
        'matched_contract_no': r[13], 'matched_entity': r[14], 'matched_entity_id': r[15],
        'match_status': r[16], 'payment_id': r[17], 'created_at': r[18],
    } for r in rows]


def handle_status():
    """Статус системы: последняя синхронизация, настройки IMAP."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, account_number, last_sync_at, last_sync_status, last_sync_error
        FROM bank_connections WHERE is_active=true
        ORDER BY id
    """)
    rows = cur.fetchall()
    conn.close()
    return {
        'imap_host': IMAP_HOST,
        'imap_user': IMAP_USER,
        'imap_configured': bool(IMAP_PASS),
        'connections': [{
            'id': r[0], 'account_number': r[1],
            'last_sync_at': r[2], 'last_sync_status': r[3], 'last_sync_error': r[4],
        } for r in rows],
    }


def handle_sync_log(params):
    """Лог загрузок выписок."""
    conn = get_conn()
    cur = conn.cursor()
    limit = int(params.get('limit', '20'))
    cur.execute("""
        SELECT id, started_at, finished_at, source, status,
               emails_found, statements_loaded, transactions_total,
               transactions_matched, errors
        FROM bank_sync_log
        ORDER BY id DESC
        LIMIT %s
    """ % limit)
    rows = cur.fetchall()
    conn.close()
    return [{
        'id': r[0], 'started_at': r[1], 'finished_at': r[2],
        'source': r[3], 'status': r[4], 'emails_found': r[5],
        'statements_loaded': r[6], 'transactions_total': r[7],
        'transactions_matched': r[8], 'errors': r[9],
    } for r in rows]


# ─── Крон: автоматическая загрузка (вызов без action) ──────────────────────

def cron_fetch():
    """Автоматическая загрузка выписок из почты. Вызывается по крону в 08:30 МСК."""
    target_date = (date.today() - timedelta(days=1)).isoformat()
    result = handle_fetch_from_email({'date': target_date, 'source': 'cron'})
    return result


# ─── Main handler ─────────────────────────────────────────────────────────────

def handler(event, context):
    """Загрузка банковских выписок из почты в формате 1С и разнесение по договорам."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    method = event.get('httpMethod', 'GET')

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    if not action and body.get('action'):
        action = body['action']

    try:
        if action == 'connections':
            return cors_json(handle_connections())

        if action == 'statements':
            return cors_json(handle_statements(params))

        if action == 'transactions':
            return cors_json(handle_transactions(params))

        if action == 'status':
            return cors_json(handle_status())

        if action == 'sync_log':
            return cors_json(handle_sync_log(params))

        if action == 'save_connection':
            result = handle_save_connection(body)
            if 'error' in result:
                return cors_json(result, 400)
            return cors_json(result)

        if action == 'toggle_connection':
            return cors_json(handle_toggle_connection(body))

        if action == 'fetch' or action == 'fetch_all':
            result = handle_fetch_from_email(body)
            if 'error' in result:
                return cors_json(result, 400)
            return cors_json(result)

        if method == 'POST' and not action:
            result = cron_fetch()
            return cors_json(result)

        return cors_json({'error': 'Unknown action: %s' % action}, 400)

    except Exception as e:
        import traceback
        error_msg = str(e)
        send_error_notification(
            'Критическая ошибка банковских выписок',
            'Ошибка: %s\n\n%s' % (error_msg, traceback.format_exc())
        )
        return cors_json({'error': error_msg, 'trace': traceback.format_exc()}, 500)