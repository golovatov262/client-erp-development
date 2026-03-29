import json
import os
import re
import ssl
import tempfile
import requests
from datetime import date, datetime, timedelta
from decimal import Decimal
import psycopg2

SBER_API_BASE = "https://fintech.sberbank.ru:9443"
SBER_AUTH_URL = "https://fintech.sberbank.ru:9443/ic/sso/api/v2/oauth/token"
SBER_STATEMENT_URL = SBER_API_BASE + "/fintech/api/v2/statement/transactions"

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Content-Type': 'application/json'
}

def esc(s):
    if s is None: return ''
    return str(s).replace("'", "''")

def get_db():
    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()
    return conn, cur

def get_staff_session(params, headers, cur):
    token = headers.get('x-auth-token') or params.get('staff_token', '')
    if not token: return None
    cur.execute("SELECT cs.user_id, u.name, u.role FROM client_sessions cs JOIN users u ON u.id=cs.user_id WHERE cs.token='%s' AND cs.expires_at > NOW() AND u.role IN ('admin','manager')" % esc(token))
    row = cur.fetchone()
    if not row: return None
    return {'user_id': row[0], 'name': row[1], 'role': row[2]}

def get_sber_credentials(org_id):
    cid_key = 'SBER_CLIENT_ID_ORG%s' % org_id
    csecret_key = 'SBER_CLIENT_SECRET_ORG%s' % org_id
    cid = os.environ.get(cid_key, '')
    csecret = os.environ.get(csecret_key, '')
    return cid, csecret

def get_ssl_context():
    cert_pem = os.environ.get('SBER_CERT_PEM', '')
    cert_key = os.environ.get('SBER_CERT_KEY', '')
    if not cert_pem or not cert_key:
        return None
    ctx = ssl.create_default_context()
    cert_file = tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False)
    cert_file.write(cert_pem.replace('\\n', '\n'))
    cert_file.close()
    key_file = tempfile.NamedTemporaryFile(mode='w', suffix='.key', delete=False)
    key_file.write(cert_key.replace('\\n', '\n'))
    key_file.close()
    ctx.load_cert_chain(cert_file.name, key_file.name)
    return cert_file.name, key_file.name

def refresh_access_token(cur, conn, connection_id, org_id, refresh_token):
    """Обновляет access_token через refresh_token"""
    cid, csecret = get_sber_credentials(org_id)
    if not cid or not csecret:
        return None, 'Не настроены client_id/client_secret для организации %s' % org_id

    ssl_files = get_ssl_context()
    cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None

    resp = requests.post(SBER_AUTH_URL, data={
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': cid,
        'client_secret': csecret,
    }, cert=cert_pair, timeout=30)

    if resp.status_code != 200:
        return None, 'Ошибка обновления токена: %s %s' % (resp.status_code, resp.text[:200])

    data = resp.json()
    new_access = data.get('access_token', '')
    new_refresh = data.get('refresh_token', refresh_token)
    expires_in = int(data.get('expires_in', 3600))
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    cur.execute("""
        UPDATE bank_connections SET access_token='%s', refresh_token='%s',
        token_expires_at='%s', updated_at=NOW() WHERE id=%s
    """ % (esc(new_access), esc(new_refresh), expires_at.isoformat(), connection_id))
    conn.commit()
    return new_access, None

def get_valid_token(cur, conn, connection):
    """Получает валидный access_token, обновляя при необходимости"""
    cid = connection['id']
    org_id = connection['org_id']
    token = connection['access_token']
    refresh = connection['refresh_token']
    expires = connection['token_expires_at']

    if token and expires and datetime.utcnow() < expires - timedelta(minutes=5):
        return token, None

    if not refresh:
        return None, 'Нет refresh_token. Требуется повторная авторизация через СберБизнес ID.'

    return refresh_access_token(cur, conn, cid, org_id, refresh)

def fetch_statement_page(access_token, account_number, statement_date, page=0):
    """Загружает одну страницу выписки из Sber API"""
    ssl_files = get_ssl_context()
    cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None

    resp = requests.get(SBER_STATEMENT_URL, params={
        'accountNumber': account_number,
        'statementDate': statement_date,
        'page': page,
    }, headers={
        'Authorization': 'Bearer %s' % access_token,
        'Accept': 'application/json',
    }, cert=cert_pair, timeout=60)

    if resp.status_code == 401:
        return None, 'token_expired'
    if resp.status_code != 200:
        return None, 'HTTP %s: %s' % (resp.status_code, resp.text[:300])

    return resp.json(), None

def extract_contract_no(purpose_text):
    """Извлекает номер договора из назначения платежа"""
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
    """Ищет договор по номеру в loans и savings"""
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
    """Автоматическое разнесение платежа по займу (упрощённая версия)"""
    cur.execute("SELECT balance, rate, schedule_type, monthly_payment, status FROM loans WHERE id=%s" % loan_id)
    loan = cur.fetchone()
    if not loan:
        return None, 'Займ не найден'
    bal, rate, stype, monthly, status = float(loan[0]), float(loan[1]), loan[2], loan[3], loan[4]
    if status == 'closed':
        return None, 'Займ уже закрыт'

    amt = float(amount)

    cur.execute("""
        SELECT id, payment_amount, principal_amount, interest_amount,
               COALESCE(paid_amount, 0), penalty_amount
        FROM loan_schedule WHERE loan_id=%s AND status IN ('pending','partial','overdue')
        ORDER BY payment_date ASC
    """ % loan_id)
    schedule_rows = cur.fetchall()

    principal_part = Decimal('0')
    interest_part = Decimal('0')
    penalty_part = Decimal('0')
    remaining = Decimal(str(amt))

    for row in schedule_rows:
        sid, s_amt, s_principal, s_interest, s_paid, s_penalty = row
        s_penalty = Decimal(str(s_penalty or 0))
        s_interest = Decimal(str(s_interest or 0))
        s_principal = Decimal(str(s_principal or 0))
        s_paid = Decimal(str(s_paid or 0))
        s_due = Decimal(str(s_amt or 0)) + s_penalty - s_paid

        if remaining <= 0:
            break
        if s_due <= 0:
            continue

        if s_penalty > 0 and remaining > 0:
            pnp = min(remaining, s_penalty)
            penalty_part += pnp
            remaining -= pnp

        due_interest = s_interest
        if remaining > 0 and due_interest > 0:
            ip = min(remaining, due_interest)
            interest_part += ip
            remaining -= ip

        due_principal = s_principal - (s_paid - (Decimal(str(s_amt)) - s_principal))
        if due_principal < 0: due_principal = Decimal('0')
        if remaining > 0 and due_principal > 0:
            pp = min(remaining, due_principal)
            principal_part += pp
            remaining -= pp

        new_paid = s_paid + (Decimal(str(amt)) - remaining) if remaining >= 0 else s_paid + Decimal(str(amt))
        total_paid_for_period = s_paid + (Decimal(str(s_amt)) + s_penalty - s_due) + min(Decimal(str(amt)), s_due)
        ns = 'paid' if total_paid_for_period >= Decimal(str(s_amt)) + s_penalty else 'partial'
        cur.execute("UPDATE loan_schedule SET paid_amount=%s, paid_date='%s', status='%s' WHERE id=%s" % (
            float(min(s_paid + (Decimal(str(amt)) - remaining + s_paid), Decimal(str(s_amt)) + s_penalty)),
            payment_date, ns, sid
        ))

    if remaining > 0:
        principal_part += min(remaining, Decimal(str(bal)) - principal_part)

    cur.execute("""
        INSERT INTO loan_payments (loan_id, payment_date, amount, principal_part, interest_part, penalty_part, payment_type, description)
        VALUES (%s, '%s', %s, %s, %s, %s, 'regular', '%s') RETURNING id
    """ % (loan_id, payment_date, amt, float(principal_part), float(interest_part), float(penalty_part), esc(description)))
    pay_id = cur.fetchone()[0]

    cur.execute("UPDATE loan_schedule SET payment_id=%s WHERE loan_id=%s AND paid_date='%s' AND payment_id IS NULL AND status IN ('paid','partial')" % (pay_id, loan_id, payment_date))

    nb = Decimal(str(bal)) - principal_part
    if nb < 0: nb = Decimal('0')
    cur.execute("UPDATE loans SET balance=%s, updated_at=NOW() WHERE id=%s" % (float(nb), loan_id))
    if nb == 0:
        cur.execute("UPDATE loans SET status='closed', updated_at=NOW() WHERE id=%s" % loan_id)

    return pay_id, None

def process_savings_deposit(cur, conn, saving_id, amount, payment_date, description):
    """Автоматическое зачисление пополнения сбережений"""
    cur.execute("SELECT current_balance, status FROM savings WHERE id=%s" % saving_id)
    sav = cur.fetchone()
    if not sav:
        return None, 'Сбережение не найдено'
    if sav[1] != 'active':
        return None, 'Договор сбережений не активен'

    amt = float(amount)
    cur.execute("INSERT INTO savings_transactions (saving_id,transaction_date,amount,transaction_type,is_cash,description) VALUES (%s,'%s',%s,'deposit',false,'%s')" % (saving_id, payment_date, amt, esc(description)))
    cur.execute("UPDATE savings SET current_balance=current_balance+%s, amount=amount+%s, updated_at=NOW() WHERE id=%s" % (amt, amt, saving_id))

    return True, None

def load_and_process_statement(cur, conn, connection, target_date):
    """Загружает выписку и разносит платежи для одного подключения"""
    cid = connection['id']
    org_id = connection['org_id']
    account = connection['account_number']

    token, err = get_valid_token(cur, conn, connection)
    if err:
        cur.execute("UPDATE bank_connections SET last_sync_status='error', last_sync_error='%s', last_sync_at=NOW(), updated_at=NOW() WHERE id=%s" % (esc(err), cid))
        conn.commit()
        return {'error': err}

    date_str = target_date if isinstance(target_date, str) else target_date.isoformat()

    cur.execute("SELECT id FROM bank_statements WHERE connection_id=%s AND statement_date='%s'" % (cid, date_str))
    existing = cur.fetchone()
    if existing:
        return {'skipped': True, 'reason': 'Выписка за %s уже загружена' % date_str}

    all_transactions = []
    page = 0
    while True:
        data, err = fetch_statement_page(token, account, date_str, page)
        if err == 'token_expired':
            token, refresh_err = refresh_access_token(cur, conn, cid, org_id, connection['refresh_token'])
            if refresh_err:
                cur.execute("UPDATE bank_connections SET last_sync_status='error', last_sync_error='%s', last_sync_at=NOW(), updated_at=NOW() WHERE id=%s" % (esc(refresh_err), cid))
                conn.commit()
                return {'error': refresh_err}
            data, err = fetch_statement_page(token, account, date_str, page)
        if err:
            cur.execute("UPDATE bank_connections SET last_sync_status='error', last_sync_error='%s', last_sync_at=NOW(), updated_at=NOW() WHERE id=%s" % (esc(err), cid))
            conn.commit()
            return {'error': err}

        transactions = data.get('transactions', data.get('operationsList', []))
        if not transactions:
            break
        all_transactions.extend(transactions)

        is_last = data.get('isLastPage', data.get('lastPage', True))
        if is_last:
            break
        page += 1

    opening_balance = data.get('openingBalance', data.get('balanceOpeningDay', 0)) if data else 0
    closing_balance = data.get('closingBalance', data.get('balanceClosingDay', 0)) if data else 0
    debit_turnover = data.get('debitTurnover', data.get('turnoverDebit', 0)) if data else 0
    credit_turnover = data.get('creditTurnover', data.get('turnoverCredit', 0)) if data else 0

    cur.execute("""
        INSERT INTO bank_statements (connection_id, statement_date, opening_balance, closing_balance,
            debit_turnover, credit_turnover, transaction_count, status)
        VALUES (%s, '%s', %s, %s, %s, %s, %s, 'loaded') RETURNING id
    """ % (cid, date_str, float(opening_balance or 0), float(closing_balance or 0),
           float(debit_turnover or 0), float(credit_turnover or 0), len(all_transactions)))
    stmt_id = cur.fetchone()[0]

    matched = 0
    unmatched = 0

    for txn in all_transactions:
        sber_uuid = txn.get('uuid', txn.get('id', txn.get('operationId', '')))
        op_date_raw = txn.get('operationDate', txn.get('date', txn.get('documentDate', date_str)))
        if 'T' in str(op_date_raw):
            op_date = op_date_raw
        else:
            op_date = str(op_date_raw) + 'T00:00:00'

        doc_date = txn.get('documentDate', date_str)
        doc_number = txn.get('documentNumber', txn.get('number', ''))
        amount_val = float(txn.get('amount', txn.get('amountRub', 0)))
        direction = txn.get('direction', '')
        if not direction:
            direction = 'CREDIT' if txn.get('operationCode', '') in ('01', '06', '16') else 'DEBIT'
        purpose = txn.get('paymentPurpose', txn.get('purpose', txn.get('description', '')))
        payer_name = txn.get('payerName', txn.get('contragentName', ''))
        payer_inn = txn.get('payerInn', txn.get('contragentInn', ''))
        payer_account = txn.get('payerAccount', txn.get('contragentAccount', ''))
        payer_bank = txn.get('payerBankName', txn.get('contragentBankName', ''))
        payer_bik = txn.get('payerBankBic', txn.get('contragentBankBic', ''))
        payee_name = txn.get('payeeName', txn.get('recipientName', ''))
        payee_inn = txn.get('payeeInn', txn.get('recipientInn', ''))
        payee_account = txn.get('payeeAccount', txn.get('recipientAccount', ''))
        payee_bank = txn.get('payeeBankName', txn.get('recipientBankName', ''))
        payee_bik = txn.get('payeeBankBic', txn.get('recipientBankBic', ''))

        if sber_uuid:
            cur.execute("SELECT id FROM bank_transactions WHERE sber_uuid='%s'" % esc(sber_uuid))
            if cur.fetchone():
                continue

        contract_no = extract_contract_no(purpose)
        matched_contract, matched_entity, matched_entity_id = match_contract(cur, contract_no)
        match_status = 'matched' if matched_entity_id else ('no_contract' if not contract_no else 'not_found')

        cur.execute("""
            INSERT INTO bank_transactions (statement_id, sber_uuid, operation_date, document_date,
                document_number, amount, direction, payment_purpose,
                payer_name, payer_inn, payer_account, payer_bank_name, payer_bik,
                payee_name, payee_inn, payee_account, payee_bank_name, payee_bik,
                matched_contract_no, matched_entity, matched_entity_id, match_status)
            VALUES (%s, '%s', '%s', '%s', '%s', %s, '%s', '%s',
                '%s', '%s', '%s', '%s', '%s',
                '%s', '%s', '%s', '%s', '%s',
                %s, %s, %s, '%s') RETURNING id
        """ % (stmt_id, esc(sber_uuid), esc(op_date), esc(doc_date),
               esc(doc_number), amount_val, esc(direction), esc(purpose),
               esc(payer_name), esc(payer_inn), esc(payer_account), esc(payer_bank), esc(payer_bik),
               esc(payee_name), esc(payee_inn), esc(payee_account), esc(payee_bank), esc(payee_bik),
               ("'%s'" % esc(matched_contract)) if matched_contract else 'NULL',
               ("'%s'" % esc(matched_entity)) if matched_entity else 'NULL',
               matched_entity_id if matched_entity_id else 'NULL',
               match_status))
        txn_id = cur.fetchone()[0]

        if match_status == 'matched' and direction.upper() == 'CREDIT' and amount_val > 0:
            pay_date = doc_date if doc_date else date_str
            desc = 'Авто-разнесение из банковской выписки за %s' % date_str
            if matched_entity == 'loan':
                pay_id, pay_err = process_loan_payment(cur, conn, matched_entity_id, Decimal(str(amount_val)), pay_date, desc)
                if pay_id:
                    cur.execute("UPDATE bank_transactions SET match_status='applied', payment_id=%s WHERE id=%s" % (pay_id, txn_id))
                    matched += 1
                else:
                    cur.execute("UPDATE bank_transactions SET match_status='error' WHERE id=%s" % txn_id)
                    unmatched += 1
            elif matched_entity == 'saving':
                ok, sav_err = process_savings_deposit(cur, conn, matched_entity_id, Decimal(str(amount_val)), pay_date, desc)
                if ok:
                    cur.execute("UPDATE bank_transactions SET match_status='applied' WHERE id=%s" % txn_id)
                    matched += 1
                else:
                    cur.execute("UPDATE bank_transactions SET match_status='error' WHERE id=%s" % txn_id)
                    unmatched += 1
        else:
            if match_status != 'matched':
                unmatched += 1

    cur.execute("UPDATE bank_statements SET matched_count=%s, unmatched_count=%s WHERE id=%s" % (matched, unmatched, stmt_id))
    cur.execute("UPDATE bank_connections SET last_sync_at=NOW(), last_sync_status='ok', last_sync_error='', updated_at=NOW() WHERE id=%s" % cid)
    conn.commit()

    return {
        'statement_id': stmt_id,
        'total': len(all_transactions),
        'matched': matched,
        'unmatched': unmatched,
    }


def handler(event, context):
    """Загрузка банковских выписок из Сбер API и автоматическое разнесение платежей"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    conn, cur = get_db()
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}

    staff = get_staff_session(params, headers, cur)
    if not staff:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Unauthorized'})}

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    action = params.get('action', body.get('action', 'list'))

    if action == 'connections':
        cur.execute("""
            SELECT bc.id, bc.org_id, o.short_name as org_name, bc.account_number,
                bc.is_active, bc.last_sync_at, bc.last_sync_status, bc.last_sync_error,
                bc.token_expires_at, bc.created_at
            FROM bank_connections bc
            JOIN organizations o ON o.id = bc.org_id
            ORDER BY bc.org_id
        """)
        rows = cur.fetchall()
        items = []
        for r in rows:
            items.append({
                'id': r[0], 'org_id': r[1], 'org_name': r[2],
                'account_number': r[3], 'is_active': r[4],
                'last_sync_at': r[5].isoformat() if r[5] else None,
                'last_sync_status': r[6], 'last_sync_error': r[7],
                'token_expires_at': r[8].isoformat() if r[8] else None,
                'created_at': r[9].isoformat() if r[9] else None,
                'has_token': bool(r[8] and r[8] > datetime.utcnow()),
            })
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(items)}

    elif action == 'save_connection':
        org_id = int(body['org_id'])
        account = body['account_number']
        cur.execute("SELECT rs FROM organizations WHERE id=%s" % org_id)
        org_row = cur.fetchone()

        cur.execute("SELECT id FROM bank_connections WHERE org_id=%s AND account_number='%s'" % (org_id, esc(account)))
        existing = cur.fetchone()
        if existing:
            cur.execute("UPDATE bank_connections SET is_active=true, updated_at=NOW() WHERE id=%s" % existing[0])
        else:
            cur.execute("INSERT INTO bank_connections (org_id, account_number, is_active) VALUES (%s, '%s', true)" % (org_id, esc(account)))
        conn.commit()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    elif action == 'auth_callback':
        connection_id = int(body['connection_id'])
        auth_code = body['code']
        redirect_uri = body.get('redirect_uri', '')

        cur.execute("SELECT id, org_id, account_number FROM bank_connections WHERE id=%s" % connection_id)
        bc = cur.fetchone()
        if not bc:
            return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Подключение не найдено'})}

        org_id = bc[1]
        cid, csecret = get_sber_credentials(org_id)
        if not cid:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Не настроены client_id/secret для организации'})}

        ssl_files = get_ssl_context()
        cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None

        resp = requests.post(SBER_AUTH_URL, data={
            'grant_type': 'authorization_code',
            'code': auth_code,
            'client_id': cid,
            'client_secret': csecret,
            'redirect_uri': redirect_uri,
        }, cert=cert_pair, timeout=30)

        if resp.status_code != 200:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Ошибка получения токена: %s' % resp.text[:200]})}

        data = resp.json()
        access_token = data.get('access_token', '')
        refresh_token = data.get('refresh_token', '')
        expires_in = int(data.get('expires_in', 3600))
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        cur.execute("""
            UPDATE bank_connections SET access_token='%s', refresh_token='%s',
            token_expires_at='%s', is_active=true, updated_at=NOW() WHERE id=%s
        """ % (esc(access_token), esc(refresh_token), expires_at.isoformat(), connection_id))
        conn.commit()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'expires_at': expires_at.isoformat()})}

    elif action == 'fetch':
        connection_id = int(body.get('connection_id', 0))
        target_date = body.get('date', (date.today() - timedelta(days=1)).isoformat())

        cur.execute("""
            SELECT id, org_id, account_number, access_token, refresh_token, token_expires_at, is_active
            FROM bank_connections WHERE id=%s
        """ % connection_id)
        row = cur.fetchone()
        if not row:
            return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Подключение не найдено'})}

        connection = {
            'id': row[0], 'org_id': row[1], 'account_number': row[2],
            'access_token': row[3], 'refresh_token': row[4],
            'token_expires_at': row[5], 'is_active': row[6],
        }

        result = load_and_process_statement(cur, conn, connection, target_date)
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(result, default=str)}

    elif action == 'fetch_all':
        target_date = body.get('date', (date.today() - timedelta(days=1)).isoformat())
        cur.execute("""
            SELECT id, org_id, account_number, access_token, refresh_token, token_expires_at, is_active
            FROM bank_connections WHERE is_active=true
        """)
        rows = cur.fetchall()
        results = []
        for row in rows:
            connection = {
                'id': row[0], 'org_id': row[1], 'account_number': row[2],
                'access_token': row[3], 'refresh_token': row[4],
                'token_expires_at': row[5], 'is_active': row[6],
            }
            result = load_and_process_statement(cur, conn, connection, target_date)
            results.append({'connection_id': row[0], 'org_id': row[1], **result})
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(results, default=str)}

    elif action == 'statements':
        connection_id = params.get('connection_id')
        limit = int(params.get('limit', '50'))
        offset = int(params.get('offset', '0'))
        where = "WHERE 1=1"
        if connection_id:
            where += " AND bs.connection_id=%s" % int(connection_id)
        cur.execute("""
            SELECT bs.id, bs.connection_id, o.short_name, bs.statement_date,
                bs.opening_balance, bs.closing_balance, bs.debit_turnover, bs.credit_turnover,
                bs.transaction_count, bs.matched_count, bs.unmatched_count, bs.status, bs.created_at
            FROM bank_statements bs
            JOIN bank_connections bc ON bc.id = bs.connection_id
            JOIN organizations o ON o.id = bc.org_id
            %s ORDER BY bs.statement_date DESC LIMIT %s OFFSET %s
        """ % (where, limit, offset))
        rows = cur.fetchall()
        items = []
        for r in rows:
            items.append({
                'id': r[0], 'connection_id': r[1], 'org_name': r[2],
                'statement_date': r[3].isoformat() if r[3] else None,
                'opening_balance': float(r[4] or 0), 'closing_balance': float(r[5] or 0),
                'debit_turnover': float(r[6] or 0), 'credit_turnover': float(r[7] or 0),
                'transaction_count': r[8], 'matched_count': r[9],
                'unmatched_count': r[10], 'status': r[11],
                'created_at': r[12].isoformat() if r[12] else None,
            })
        cur.execute("SELECT COUNT(*) FROM bank_statements bs %s" % where)
        total = cur.fetchone()[0]
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'items': items, 'total': total})}

    elif action == 'transactions':
        stmt_id = params.get('statement_id')
        match_filter = params.get('match_status')
        where = "WHERE 1=1"
        if stmt_id:
            where += " AND bt.statement_id=%s" % int(stmt_id)
        if match_filter:
            where += " AND bt.match_status='%s'" % esc(match_filter)
        cur.execute("""
            SELECT bt.id, bt.statement_id, bt.sber_uuid, bt.operation_date, bt.document_date,
                bt.document_number, bt.amount, bt.direction, bt.payment_purpose,
                bt.payer_name, bt.payer_inn, bt.payee_name, bt.payee_inn,
                bt.matched_contract_no, bt.matched_entity, bt.matched_entity_id,
                bt.match_status, bt.payment_id, bt.created_at
            FROM bank_transactions bt
            %s ORDER BY bt.operation_date DESC LIMIT 200
        """ % where)
        rows = cur.fetchall()
        items = []
        for r in rows:
            items.append({
                'id': r[0], 'statement_id': r[1], 'sber_uuid': r[2],
                'operation_date': r[3].isoformat() if r[3] else None,
                'document_date': r[4].isoformat() if r[4] else None,
                'document_number': r[5], 'amount': float(r[6]),
                'direction': r[7], 'payment_purpose': r[8],
                'payer_name': r[9], 'payer_inn': r[10],
                'payee_name': r[11], 'payee_inn': r[12],
                'matched_contract_no': r[13], 'matched_entity': r[14],
                'matched_entity_id': r[15], 'match_status': r[16],
                'payment_id': r[17],
                'created_at': r[18].isoformat() if r[18] else None,
            })
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(items)}

    elif action == 'auth_url':
        connection_id = int(params.get('connection_id', body.get('connection_id', 0)))
        redirect_uri = params.get('redirect_uri', body.get('redirect_uri', ''))
        cur.execute("SELECT org_id FROM bank_connections WHERE id=%s" % connection_id)
        row = cur.fetchone()
        if not row:
            return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Подключение не найдено'})}
        org_id = row[0]
        cid, _ = get_sber_credentials(org_id)
        if not cid:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Не настроен client_id для организации'})}
        scope = 'openid GET_STATEMENT_ACCOUNT'
        auth_url = "https://fintech.sberbank.ru:9443/ic/sso/api/v2/oauth/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=%s&state=%s" % (cid, redirect_uri, scope, connection_id)
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'auth_url': auth_url})}

    elif action == 'toggle_connection':
        connection_id = int(body['connection_id'])
        is_active = body.get('is_active', True)
        cur.execute("UPDATE bank_connections SET is_active=%s, updated_at=NOW() WHERE id=%s" % (is_active, connection_id))
        conn.commit()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    elif action == 'list':
        cur.execute("""
            SELECT bc.id, o.short_name, bc.account_number, bc.is_active,
                bc.last_sync_at, bc.last_sync_status,
                (SELECT COUNT(*) FROM bank_statements WHERE connection_id=bc.id) as stmt_count,
                (SELECT SUM(matched_count) FROM bank_statements WHERE connection_id=bc.id) as total_matched
            FROM bank_connections bc
            JOIN organizations o ON o.id=bc.org_id
            ORDER BY bc.org_id
        """)
        rows = cur.fetchall()
        items = []
        for r in rows:
            items.append({
                'id': r[0], 'org_name': r[1], 'account_number': r[2],
                'is_active': r[3],
                'last_sync_at': r[4].isoformat() if r[4] else None,
                'last_sync_status': r[5],
                'statement_count': r[6] or 0,
                'total_matched': int(r[7] or 0),
            })
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(items)}

    return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Unknown action: %s' % action})}