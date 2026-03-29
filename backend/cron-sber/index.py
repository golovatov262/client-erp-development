import json
import os
import re
import ssl
import tempfile
import requests
import boto3
from datetime import date, datetime, timedelta
from decimal import Decimal
import psycopg2

SBER_API_BASE = "https://fintech.sberbank.ru:9443"
SBER_AUTH_URL = SBER_API_BASE + "/ic/sso/api/v2/oauth/token"
SBER_STATEMENT_URL = SBER_API_BASE + "/fintech/api/v2/statement/transactions"

CERT_S3_KEYS = {
    2: 'sber_cert_org2.pem',
    3: 'sber_cert_org3.pem',
}

_cert_cache = {}

def esc(s):
    if s is None: return ''
    return str(s).replace("'", "''")

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_s3_client():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )

def get_sber_credentials(org_id):
    cid = os.environ.get('SBER_CLIENT_ID_ORG%s' % org_id, '')
    csecret = os.environ.get('SBER_CLIENT_SECRET_ORG%s' % org_id, '')
    return cid, csecret

def download_cert_from_s3(org_id):
    s3_key = CERT_S3_KEYS.get(int(org_id))
    if not s3_key:
        return None
    if s3_key in _cert_cache:
        path = _cert_cache[s3_key]
        if os.path.exists(path):
            return path
    s3 = get_s3_client()
    obj = s3.get_object(Bucket='files', Key=s3_key)
    data = obj['Body'].read()
    tf = tempfile.NamedTemporaryFile(mode='wb', suffix='.pem', delete=False)
    tf.write(data)
    tf.close()
    _cert_cache[s3_key] = tf.name
    return tf.name

def get_ssl_context(org_id=2):
    cert_path = download_cert_from_s3(org_id)
    cert_key = os.environ.get('SBER_CERT_KEY', '')
    if not cert_path or not cert_key:
        return None
    key_file = tempfile.NamedTemporaryFile(mode='w', suffix='.key', delete=False)
    key_file.write(cert_key.replace('\\n', '\n'))
    key_file.close()
    return cert_path, key_file.name

def refresh_access_token(cur, conn, connection_id, org_id, refresh_token):
    cid, csecret = get_sber_credentials(org_id)
    if not cid or not csecret:
        return None, 'client_id/secret не настроены для org %s' % org_id
    ssl_files = get_ssl_context(org_id)
    cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None
    resp = requests.post(SBER_AUTH_URL, data={
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': cid,
        'client_secret': csecret,
    }, cert=cert_pair, timeout=30)
    if resp.status_code != 200:
        return None, 'Refresh token error: %s' % resp.status_code
    data = resp.json()
    new_access = data.get('access_token', '')
    new_refresh = data.get('refresh_token', refresh_token)
    expires_in = int(data.get('expires_in', 3600))
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    cur.execute("UPDATE bank_connections SET access_token='%s', refresh_token='%s', token_expires_at='%s', updated_at=NOW() WHERE id=%s" % (esc(new_access), esc(new_refresh), expires_at.isoformat(), connection_id))
    conn.commit()
    return new_access, None

def get_valid_token(cur, conn, c):
    token = c['access_token']
    refresh = c['refresh_token']
    expires = c['token_expires_at']
    if token and expires and datetime.utcnow() < expires - timedelta(minutes=5):
        return token, None
    if not refresh:
        return None, 'Нет refresh_token'
    return refresh_access_token(cur, conn, c['id'], c['org_id'], refresh)

def fetch_statement_page(access_token, account_number, statement_date, page=0, org_id=2):
    ssl_files = get_ssl_context(org_id)
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
        return None, 'HTTP %s' % resp.status_code
    return resp.json(), None

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
        return None, 'Займ закрыт или не найден'
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
    if nb < 0: nb = Decimal('0')
    cur.execute("UPDATE loans SET balance=%s, updated_at=NOW() WHERE id=%s" % (float(nb), loan_id))
    if nb == 0:
        cur.execute("UPDATE loans SET status='closed', updated_at=NOW() WHERE id=%s" % loan_id)
    return pay_id, None

def process_savings_deposit(cur, conn, saving_id, amount, payment_date, description):
    cur.execute("SELECT current_balance, status FROM savings WHERE id=%s" % saving_id)
    sav = cur.fetchone()
    if not sav or sav[1] != 'active':
        return None, 'Сбережение не активно'
    amt = float(amount)
    cur.execute("INSERT INTO savings_transactions (saving_id,transaction_date,amount,transaction_type,is_cash,description) VALUES (%s,'%s',%s,'deposit',false,'%s')" % (saving_id, payment_date, amt, esc(description)))
    cur.execute("UPDATE savings SET current_balance=current_balance+%s, amount=amount+%s, updated_at=NOW() WHERE id=%s" % (amt, amt, saving_id))
    return True, None

def load_statement(cur, conn, c, target_date):
    cid = c['id']
    token, err = get_valid_token(cur, conn, c)
    if err:
        cur.execute("UPDATE bank_connections SET last_sync_status='error', last_sync_error='%s', last_sync_at=NOW(), updated_at=NOW() WHERE id=%s" % (esc(err), cid))
        conn.commit()
        return {'error': err}
    date_str = target_date if isinstance(target_date, str) else target_date.isoformat()
    cur.execute("SELECT id FROM bank_statements WHERE connection_id=%s AND statement_date='%s'" % (cid, date_str))
    if cur.fetchone():
        return {'skipped': True}
    all_txns = []
    page = 0
    data = None
    while True:
        data, err = fetch_statement_page(token, c['account_number'], date_str, page, org_id=c['org_id'])
        if err == 'token_expired':
            token, re_err = refresh_access_token(cur, conn, cid, c['org_id'], c['refresh_token'])
            if re_err:
                cur.execute("UPDATE bank_connections SET last_sync_status='error', last_sync_error='%s', last_sync_at=NOW(), updated_at=NOW() WHERE id=%s" % (esc(re_err), cid))
                conn.commit()
                return {'error': re_err}
            data, err = fetch_statement_page(token, c['account_number'], date_str, page, org_id=c['org_id'])
        if err:
            cur.execute("UPDATE bank_connections SET last_sync_status='error', last_sync_error='%s', last_sync_at=NOW(), updated_at=NOW() WHERE id=%s" % (esc(err), cid))
            conn.commit()
            return {'error': err}
        txns = data.get('transactions', data.get('operationsList', []))
        if not txns:
            break
        all_txns.extend(txns)
        if data.get('isLastPage', data.get('lastPage', True)):
            break
        page += 1

    ob = float(data.get('openingBalance', data.get('balanceOpeningDay', 0)) or 0) if data else 0
    cb = float(data.get('closingBalance', data.get('balanceClosingDay', 0)) or 0) if data else 0
    dt_val = float(data.get('debitTurnover', data.get('turnoverDebit', 0)) or 0) if data else 0
    ct_val = float(data.get('creditTurnover', data.get('turnoverCredit', 0)) or 0) if data else 0

    cur.execute("INSERT INTO bank_statements (connection_id, statement_date, opening_balance, closing_balance, debit_turnover, credit_turnover, transaction_count, status) VALUES (%s, '%s', %s, %s, %s, %s, %s, 'loaded') RETURNING id" % (cid, date_str, ob, cb, dt_val, ct_val, len(all_txns)))
    stmt_id = cur.fetchone()[0]
    matched = 0
    unmatched = 0
    for txn in all_txns:
        sber_uuid = txn.get('uuid', txn.get('id', txn.get('operationId', '')))
        op_date_raw = txn.get('operationDate', txn.get('date', date_str))
        op_date = str(op_date_raw) + 'T00:00:00' if 'T' not in str(op_date_raw) else op_date_raw
        doc_date = txn.get('documentDate', date_str)
        doc_number = txn.get('documentNumber', txn.get('number', ''))
        amount_val = float(txn.get('amount', txn.get('amountRub', 0)))
        direction = txn.get('direction', '')
        if not direction:
            direction = 'CREDIT' if txn.get('operationCode', '') in ('01', '06', '16') else 'DEBIT'
        purpose = txn.get('paymentPurpose', txn.get('purpose', txn.get('description', '')))
        payer_name = txn.get('payerName', txn.get('contragentName', ''))
        payer_inn = txn.get('payerInn', txn.get('contragentInn', ''))
        payer_account = txn.get('payerAccount', '')
        payer_bank = txn.get('payerBankName', '')
        payer_bik = txn.get('payerBankBic', '')
        payee_name = txn.get('payeeName', txn.get('recipientName', ''))
        payee_inn = txn.get('payeeInn', '')
        payee_account = txn.get('payeeAccount', '')
        payee_bank = txn.get('payeeBankName', '')
        payee_bik = txn.get('payeeBankBic', '')
        if sber_uuid:
            cur.execute("SELECT id FROM bank_transactions WHERE sber_uuid='%s'" % esc(sber_uuid))
            if cur.fetchone():
                continue
        contract_no = extract_contract_no(purpose)
        m_contract, m_entity, m_entity_id = match_contract(cur, contract_no)
        m_status = 'matched' if m_entity_id else ('no_contract' if not contract_no else 'not_found')
        cur.execute("INSERT INTO bank_transactions (statement_id, sber_uuid, operation_date, document_date, document_number, amount, direction, payment_purpose, payer_name, payer_inn, payer_account, payer_bank_name, payer_bik, payee_name, payee_inn, payee_account, payee_bank_name, payee_bik, matched_contract_no, matched_entity, matched_entity_id, match_status) VALUES (%s, '%s', '%s', '%s', '%s', %s, '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', %s, %s, %s, '%s') RETURNING id" % (stmt_id, esc(sber_uuid), esc(op_date), esc(doc_date), esc(doc_number), amount_val, esc(direction), esc(purpose), esc(payer_name), esc(payer_inn), esc(payer_account), esc(payer_bank), esc(payer_bik), esc(payee_name), esc(payee_inn), esc(payee_account), esc(payee_bank), esc(payee_bik), ("'%s'" % esc(m_contract)) if m_contract else 'NULL', ("'%s'" % esc(m_entity)) if m_entity else 'NULL', m_entity_id if m_entity_id else 'NULL', m_status))
        txn_id = cur.fetchone()[0]
        if m_status == 'matched' and direction.upper() == 'CREDIT' and amount_val > 0:
            pay_date = doc_date if doc_date else date_str
            desc = 'Авто из выписки за %s' % date_str
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
    cur.execute("UPDATE bank_connections SET last_sync_at=NOW(), last_sync_status='ok', last_sync_error='', updated_at=NOW() WHERE id=%s" % cid)
    conn.commit()
    return {'total': len(all_txns), 'matched': matched, 'unmatched': unmatched}


def handle_test(params):
    results = {}
    results['secrets'] = {}
    for key in ['SBER_CLIENT_ID_ORG2', 'SBER_CLIENT_SECRET_ORG2', 'SBER_CLIENT_ID_ORG3', 'SBER_CLIENT_SECRET_ORG3', 'SBER_CERT_KEY']:
        val = os.environ.get(key, '')
        results['secrets'][key] = {'present': bool(val), 'length': len(val)}

    try:
        s3 = get_s3_client()
        resp = s3.list_objects_v2(Bucket='files', MaxKeys=100)
        results['s3_files'] = [{'key': obj['Key'], 'size': obj['Size']} for obj in resp.get('Contents', [])]
    except Exception as e:
        results['s3_files_error'] = str(e)

    org_id = int(params.get('org_id', '2'))

    results['cert_valid'] = False
    results['cert_error'] = None
    cert_key = os.environ.get('SBER_CERT_KEY', '')

    try:
        cert_path = download_cert_from_s3(org_id)
        if cert_path and cert_key:
            kf = tempfile.NamedTemporaryFile(mode='w', suffix='.key', delete=False)
            kf.write(cert_key.replace('\\n', '\n'))
            kf.close()
            ctx = ssl.create_default_context()
            ctx.load_cert_chain(cert_path, kf.name)
            results['cert_valid'] = True
            results['s3_cert'] = CERT_S3_KEYS.get(org_id, 'not_configured')
            os.unlink(kf.name)
        else:
            results['cert_error'] = 'Cert not found in S3 for org%s or SBER_CERT_KEY empty' % org_id
    except Exception as e:
        results['cert_error'] = str(e)

    cid, csecret = get_sber_credentials(org_id)
    results['api_test'] = {'org_id': org_id, 'client_id_present': bool(cid), 'client_secret_present': bool(csecret)}

    if cid and csecret and results.get('cert_valid'):
        try:
            ssl_files = get_ssl_context(org_id)
            cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None
            resp = requests.post(SBER_AUTH_URL, data={
                'grant_type': 'client_credentials',
                'client_id': cid,
                'client_secret': csecret,
                'scope': 'openid',
            }, cert=cert_pair, timeout=15)
            results['api_test']['status_code'] = resp.status_code
            results['api_test']['response'] = resp.text[:500]
            results['api_test']['success'] = resp.status_code == 200
        except Exception as e:
            results['api_test']['error'] = str(e)
            results['api_test']['success'] = False
    else:
        results['api_test']['skipped'] = True
        results['api_test']['reason'] = 'Missing credentials or invalid cert'

    return results


def handle_upload_cert(body):
    import base64
    org_id = int(body.get('org_id', 0))
    cert_data_b64 = body.get('cert_data', '')
    cert_url = body.get('cert_url', '')
    if not org_id or (not cert_data_b64 and not cert_url):
        return {'error': 'org_id and cert_data (base64) or cert_url required'}
    s3_key = CERT_S3_KEYS.get(org_id)
    if not s3_key:
        return {'error': 'Unknown org_id: %s' % org_id}
    if cert_url:
        resp = requests.get(cert_url, timeout=30)
        if resp.status_code != 200:
            return {'error': 'Failed to download cert from URL: HTTP %s' % resp.status_code}
        cert_data = resp.content
    else:
        cert_data = base64.b64decode(cert_data_b64)
    s3 = get_s3_client()
    s3.put_object(Bucket='files', Key=s3_key, Body=cert_data, ContentType='application/x-pem-file')
    return {'uploaded': s3_key, 'size': len(cert_data)}

def handler(event, context):
    """Ежедневная загрузка банковских выписок из Сбер API и автоматическое разнесение платежей"""
    params = event.get('queryStringParameters') or {}
    if params.get('action') == 'test':
        result = handle_test(params)
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(result, default=str)
        }
    if params.get('action') == 'upload_cert':
        body = json.loads(event['body']) if event.get('body') else {}
        result = handle_upload_cert(body)
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(result, default=str)
        }

    body = json.loads(event['body']) if event.get('body') else {}
    target_date = body.get('date', (date.today() - timedelta(days=1)).isoformat())

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id, org_id, account_number, access_token, refresh_token, token_expires_at FROM bank_connections WHERE is_active=true")
    rows = cur.fetchall()

    results = []
    for row in rows:
        c = {
            'id': row[0], 'org_id': row[1], 'account_number': row[2],
            'access_token': row[3], 'refresh_token': row[4], 'token_expires_at': row[5],
        }
        result = load_statement(cur, conn, c, target_date)
        results.append({'connection_id': row[0], 'org_id': row[1], **result})

    conn.close()
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({
            'date': target_date,
            'connections_processed': len(results),
            'results': results,
        }, default=str)
    }