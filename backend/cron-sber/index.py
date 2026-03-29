import json
import os
import re
import ssl
import tempfile
import uuid
import requests
import boto3
from datetime import date, datetime, timedelta
from decimal import Decimal
import psycopg2
from urllib.parse import urlencode, quote

# ─── Sber API URLs ───────────────────────────────────────────────────────────
SBER_OAUTH_AUTHORIZE_URL = "https://sbi.sberbank.ru:9443/ic/sso/api/v2/oauth/authorize"
SBER_TOKEN_URLS = [
    "https://fintech.sberbank.ru:9443/ic/sso/api/v2/oauth/token",
]
SBER_TOKEN_URL = SBER_TOKEN_URLS[0]
SBER_STATEMENT_URL = "https://fintech.sberbank.ru:9443/fintech/api/v2/statement/transactions"
SBER_STATEMENT_SUMMARY_URL = "https://fintech.sberbank.ru:9443/fintech/api/v2/statement/summary"

# Legacy alias
SBER_AUTH_URL = SBER_TOKEN_URL

REDIRECT_URI = 'https://functions.poehali.dev/1f3896d2-7604-47b6-b33d-c1ce55e29925/?action=callback'

# Scopes per org
ORG_SCOPES = {
    2: 'openid GET_STATEMENT_ACCOUNT GET_STATEMENT_TRANSACTION GET_CLIENT_ACCOUNTS',
    3: 'openid GET_STATEMENT_ACCOUNT GET_STATEMENT_TRANSACTION GET_CLIENT_ACCOUNTS',
}

CERT_S3_KEYS = {
    2: 'sber_cert_org2.pem',
    3: 'sber_cert_org3.pem',
}

_cert_cache = {}
_CACHE_VER = 3

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
}

def cors_json(data, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(data, default=str),
    }

def cors_html(html, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8'},
        'body': html,
    }

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

SBER_SECRET_MAP = {
    2: '2',
    3: '3',
}

def get_sber_credentials(org_id, cur=None):
    """Get client_id and client_secret for org.
    First checks bank_connections table, falls back to env vars.
    Note: env secrets are swapped (ORG2 contains org3 data and vice versa),
    so we use SBER_SECRET_MAP to read from the correct env var."""
    cid = ''
    csecret = ''
    if cur:
        try:
            cur.execute(
                "SELECT client_id, client_secret_ref FROM bank_connections WHERE org_id=%s AND client_id IS NOT NULL AND client_id != '' LIMIT 1"
                % int(org_id)
            )
            row = cur.fetchone()
            if row:
                cid = row[0] or ''
                csecret = row[1] or ''
        except Exception:
            pass
    env_suffix = SBER_SECRET_MAP.get(int(org_id), str(org_id))
    if not cid:
        cid = os.environ.get('SBER_CLIENT_ID_ORG%s' % env_suffix, '')
    if not csecret:
        csecret = os.environ.get('SBER_CLIENT_SECRET_ORG%s' % env_suffix, '')
    return cid, csecret

def get_connection_credentials(cur, connection_id):
    """Get client_id and client_secret from a specific connection, fall back to env."""
    cur.execute(
        "SELECT org_id, client_id, client_secret_ref FROM bank_connections WHERE id=%s" % int(connection_id)
    )
    row = cur.fetchone()
    if not row:
        return None, '', ''
    org_id, cid, csecret = row
    if not cid:
        cid = os.environ.get('SBER_CLIENT_ID_ORG%s' % org_id, '')
    if not csecret:
        csecret = os.environ.get('SBER_CLIENT_SECRET_ORG%s' % org_id, '')
    return org_id, cid, csecret

def split_pem_bundle(pem_data):
    text = pem_data.decode('utf-8') if isinstance(pem_data, bytes) else pem_data
    cert_parts = []
    key_part = None
    current = []
    for line in text.splitlines(True):
        current.append(line)
        if '-----END' in line:
            block = ''.join(current)
            if 'PRIVATE KEY' in block:
                key_part = block
            else:
                cert_parts.append(block)
            current = []
    return ''.join(cert_parts), key_part

def download_cert_from_s3(org_id):
    s3_key = CERT_S3_KEYS.get(int(org_id))
    if not s3_key:
        return None, None
    cache_key = s3_key + '_cert'
    cache_key_k = s3_key + '_key'
    if cache_key in _cert_cache and cache_key_k in _cert_cache:
        cp = _cert_cache[cache_key]
        kp = _cert_cache[cache_key_k]
        if os.path.exists(cp) and os.path.exists(kp):
            return cp, kp
    s3 = get_s3_client()
    obj = s3.get_object(Bucket='files', Key=s3_key)
    data = obj['Body'].read()
    cert_text, key_text = split_pem_bundle(data)
    if not cert_text or not key_text:
        return None, None
    cf = tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False)
    cf.write(cert_text)
    cf.close()
    kf = tempfile.NamedTemporaryFile(mode='w', suffix='.key', delete=False)
    kf.write(key_text)
    kf.close()
    _cert_cache[cache_key] = cf.name
    _cert_cache[cache_key_k] = kf.name
    return cf.name, kf.name

def get_ssl_context(org_id=2):
    cert_path, key_path = download_cert_from_s3(org_id)
    if not cert_path or not key_path:
        return None
    return cert_path, key_path

def refresh_access_token(cur, conn, connection_id, org_id, refresh_token):
    cid, csecret = get_sber_credentials(org_id, cur)
    if not cid or not csecret:
        return None, 'client_id/secret not configured for org %s' % org_id
    ssl_files = get_ssl_context(org_id)
    cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None
    refresh_data = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': cid,
        'client_secret': csecret,
    }
    resp = None
    refresh_errors = []
    for turl in SBER_TOKEN_URLS:
        try:
            resp = requests.post(turl, data=refresh_data, cert=cert_pair, verify=False, timeout=20)
            if resp.status_code == 200:
                break
            refresh_errors.append('%s → HTTP %s' % (turl, resp.status_code))
        except Exception as re_ex:
            refresh_errors.append('%s → %s' % (turl, str(re_ex)[:100]))
            resp = None
    if not resp or resp.status_code != 200:
        return None, 'Refresh token error: %s' % '; '.join(refresh_errors)
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
        return None, 'No refresh_token'
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
    }, cert=cert_pair, verify=False, timeout=60)
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
    if nb < 0: nb = Decimal('0')
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
            desc = 'Auto from statement %s' % date_str
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
        s3.put_object(Bucket='files', Key='_test_ping.txt', Body=b'hello_sber_test', ContentType='text/plain')
        obj = s3.get_object(Bucket='files', Key='_test_ping.txt')
        content = obj['Body'].read().decode('utf-8')
        results['s3_roundtrip'] = content
        for oid in [2, 3]:
            sk = CERT_S3_KEYS.get(oid)
            try:
                o2 = s3.get_object(Bucket='files', Key=sk)
                results['cert_org%s_size' % oid] = len(o2['Body'].read())
            except Exception as e2:
                results['cert_org%s_error' % oid] = str(e2)
    except Exception as e:
        results['s3_error'] = str(e)

    org_id = int(params.get('org_id', '2'))

    results['cert_valid'] = False
    results['cert_error'] = None

    try:
        cert_path, key_path = download_cert_from_s3(org_id)
        if cert_path and key_path:
            ctx = ssl.create_default_context()
            ctx.load_cert_chain(cert_path, key_path)
            results['cert_valid'] = True
            results['s3_cert'] = CERT_S3_KEYS.get(org_id, 'not_configured')
        else:
            results['cert_error'] = 'Cert/key not found in S3 for org%s' % org_id
    except Exception as e:
        results['cert_error'] = str(e)

    cid, csecret = get_sber_credentials(org_id)
    env_suffix = SBER_SECRET_MAP.get(int(org_id), str(org_id))
    results['api_test'] = {
        'org_id': org_id,
        'client_id_present': bool(cid),
        'client_secret_present': bool(csecret),
        'client_id_value': cid,
        'env_suffix_used': env_suffix,
        'raw_org2': os.environ.get('SBER_CLIENT_ID_ORG2', '')[:10],
        'raw_org3': os.environ.get('SBER_CLIENT_ID_ORG3', '')[:10],
    }

    if cid and csecret and results.get('cert_valid'):
        results['api_test']['url_tests'] = []
        ssl_files = get_ssl_context(org_id)
        cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None
        for turl in SBER_TOKEN_URLS:
            url_result = {'url': turl}
            try:
                resp = requests.post(turl, data={
                    'grant_type': 'client_credentials',
                    'client_id': cid,
                    'client_secret': csecret,
                    'scope': 'openid',
                }, cert=cert_pair, verify=False, timeout=15)
                url_result['status_code'] = resp.status_code
                url_result['response'] = resp.text[:300]
            except Exception as e:
                url_result['error'] = str(e)[:200]
            results['api_test']['url_tests'].append(url_result)
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


# ─── New action handlers ─────────────────────────────────────────────────────

def handle_connections():
    """List bank_connections with org_name from organizations table."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT bc.id, bc.org_id, COALESCE(o.name, ''), bc.account_number, bc.is_active,
               bc.last_sync_at, COALESCE(bc.last_sync_status, 'never'), COALESCE(bc.last_sync_error, ''),
               bc.token_expires_at, bc.created_at,
               CASE WHEN bc.access_token IS NOT NULL AND bc.access_token != '' THEN true ELSE false END as has_token
        FROM bank_connections bc
        LEFT JOIN organizations o ON o.id = bc.org_id
        ORDER BY bc.id
    """)
    rows = cur.fetchall()
    conn.close()
    result = []
    for r in rows:
        result.append({
            'id': r[0],
            'org_id': r[1],
            'org_name': r[2],
            'account_number': r[3],
            'is_active': r[4],
            'last_sync_at': r[5],
            'last_sync_status': r[6],
            'last_sync_error': r[7],
            'token_expires_at': r[8],
            'created_at': r[9],
            'has_token': r[10],
        })
    return result


def handle_save_connection(body):
    """Create a new bank_connection."""
    org_id = int(body.get('org_id', 0))
    account_number = body.get('account_number', '').strip()
    if not org_id or not account_number:
        return {'error': 'org_id and account_number required'}
    conn = get_conn()
    cur = conn.cursor()
    # Check for existing
    cur.execute("SELECT id FROM bank_connections WHERE org_id=%s AND account_number='%s'" % (org_id, esc(account_number)))
    existing = cur.fetchone()
    if existing:
        conn.close()
        return {'error': 'Connection already exists', 'id': existing[0]}
    scope = ORG_SCOPES.get(org_id, 'openid')
    cur.execute("""
        INSERT INTO bank_connections (org_id, bank_name, account_number, scope, is_active, created_at, updated_at)
        VALUES (%s, 'sber', '%s', '%s', true, NOW(), NOW()) RETURNING id
    """ % (org_id, esc(account_number), esc(scope)))
    new_id = cur.fetchone()[0]
    conn.commit()
    conn.close()
    return {'success': True, 'id': new_id}


def handle_toggle_connection(body):
    """Enable/disable a connection."""
    connection_id = int(body.get('connection_id', 0))
    is_active = body.get('is_active', True)
    if not connection_id:
        return {'error': 'connection_id required'}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE bank_connections SET is_active=%s, updated_at=NOW() WHERE id=%s" % (
        'true' if is_active else 'false', connection_id))
    conn.commit()
    conn.close()
    return {'success': True}


def handle_auth_url(params):
    """Generate OAuth authorize URL for a connection."""
    connection_id = int(params.get('connection_id', 0))
    if not connection_id:
        return {'error': 'connection_id required'}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT org_id, client_id, scope FROM bank_connections WHERE id=%s" % connection_id)
    row = cur.fetchone()
    if not row:
        conn.close()
        return {'error': 'Connection not found'}
    org_id = row[0]
    client_id = row[1] or ''
    scope = row[2] or ORG_SCOPES.get(org_id, 'openid')
    if not client_id:
        client_id = os.environ.get('SBER_CLIENT_ID_ORG%s' % org_id, '')
    if not client_id:
        conn.close()
        return {'error': 'client_id not configured for connection %s' % connection_id}
    state = '%s_%s' % (connection_id, uuid.uuid4().hex[:16])
    nonce = uuid.uuid4().hex
    auth_params = {
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': REDIRECT_URI,
        'scope': scope,
        'state': state,
        'nonce': nonce,
        'prompt': 'login',
    }
    auth_url = SBER_OAUTH_AUTHORIZE_URL + '?' + urlencode(auth_params)
    conn.close()
    return {'auth_url': auth_url, 'state': state}


def handle_callback(params):
    """OAuth callback - Sber redirects here after user authorizes.
    Returns HTML page that shows the code and attempts to auto-exchange it."""
    code = params.get('code', '')
    state = params.get('state', '')
    error = params.get('error', '')
    error_description = params.get('error_description', '')

    if error:
        html = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sber OAuth Error</title>
<style>body{font-family:sans-serif;max-width:600px;margin:60px auto;text-align:center;}
.error{color:#dc2626;font-size:18px;margin:20px 0;} .desc{color:#666;}</style></head>
<body><h2>Authorization Error</h2>
<div class="error">%s</div><div class="desc">%s</div>
<p>You can close this window.</p>
<script>
if(window.opener){window.opener.postMessage({type:'sber_auth_error',error:'%s',description:'%s'},'*');}
</script></body></html>""" % (esc(error), esc(error_description), esc(error), esc(error_description))
        return cors_html(html)

    # Try auto-exchange if we have state with connection_id
    exchange_result = None
    if code and state:
        try:
            connection_id = int(state.split('_')[0])
            conn = get_conn()
            cur = conn.cursor()
            org_id, cid, csecret = get_connection_credentials(cur, connection_id)
            if org_id and cid and csecret:
                ssl_files = get_ssl_context(org_id)
                cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None
                token_form = {
                    'grant_type': 'authorization_code',
                    'code': code,
                    'client_id': cid,
                    'client_secret': csecret,
                    'redirect_uri': REDIRECT_URI,
                }
                resp = None
                cb_errors = []
                for turl in SBER_TOKEN_URLS:
                    try:
                        resp = requests.post(turl, data=token_form, cert=cert_pair, verify=False, timeout=20)
                        if resp.status_code == 200:
                            break
                        err_d = resp.text[:200].strip()
                        if 'certificateNotFound' in err_d:
                            cb_errors.append('Сертификат не привязан к client_id в ЛК Сбера')
                        else:
                            cb_errors.append('%s → HTTP %s %s' % (turl, resp.status_code, err_d))
                    except Exception as te:
                        cb_errors.append('%s → %s' % (turl, str(te)[:120]))
                        resp = None
                if resp and resp.status_code == 200:
                    token_data = resp.json()
                    access_token = token_data.get('access_token', '')
                    refresh_token = token_data.get('refresh_token', '')
                    expires_in = int(token_data.get('expires_in', 3600))
                    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
                    cur.execute(
                        "UPDATE bank_connections SET access_token='%s', refresh_token='%s', token_expires_at='%s', updated_at=NOW() WHERE id=%s"
                        % (esc(access_token), esc(refresh_token), expires_at.isoformat(), connection_id)
                    )
                    conn.commit()
                    exchange_result = 'success'
                else:
                    exchange_result = 'error: %s' % '; '.join(cb_errors) if cb_errors else 'error: HTTP %s - %s' % (resp.status_code if resp else '?', resp.text[:200] if resp else 'no response')
            else:
                exchange_result = 'error: credentials not found'
            conn.close()
        except Exception as e:
            exchange_result = 'error: %s' % str(e)

    success_class = 'success' if exchange_result == 'success' else 'pending'
    status_msg = 'Tokens saved successfully!' if exchange_result == 'success' else (
        'Auto-exchange failed: %s. Please copy the code manually.' % exchange_result if exchange_result else 'Code received. Copy it or it will be sent automatically.'
    )

    html = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sber OAuth Callback</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:60px auto;text-align:center;padding:0 20px;}
.success{color:#16a34a;font-size:18px;font-weight:600;} .pending{color:#ca8a04;font-size:18px;font-weight:600;}
.code-box{background:#f3f4f6;border:2px solid #d1d5db;border-radius:8px;padding:16px;margin:20px 0;font-family:monospace;font-size:14px;word-break:break-all;user-select:all;}
button{background:#2563eb;color:white;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;margin:8px;}
button:hover{background:#1d4ed8;}
.info{color:#6b7280;font-size:13px;margin-top:16px;}
</style></head>
<body>
<h2>Sber Authorization</h2>
<div class="%s">%s</div>
%s
<div class="info">State: %s</div>
<script>
var code = '%s';
var state = '%s';
var exchangeResult = '%s';
if(window.opener){
  window.opener.postMessage({type:'sber_auth_callback',code:code,state:state,exchange_result:exchangeResult},'*');
}
function copyCode(){
  navigator.clipboard.writeText(code).then(function(){alert('Code copied!')});
}
%s
</script>
</body></html>""" % (
        success_class,
        status_msg,
        ('<div class="code-box">%s</div><button onclick="copyCode()">Copy Code</button>' % esc(code)) if code and exchange_result != 'success' else '',
        esc(state),
        esc(code),
        esc(state),
        esc(exchange_result or ''),
        'setTimeout(function(){window.close();},3000);' if exchange_result == 'success' else '',
    )
    return cors_html(html)


def handle_auth_callback(body):
    """Exchange authorization code for tokens (manual flow from frontend)."""
    connection_id = int(body.get('connection_id', 0))
    code = body.get('code', '')
    if not connection_id or not code:
        return {'error': 'connection_id and code required'}
    conn = get_conn()
    cur = conn.cursor()
    org_id, cid, csecret = get_connection_credentials(cur, connection_id)
    if not org_id:
        conn.close()
        return {'error': 'Connection not found'}
    if not cid or not csecret:
        conn.close()
        return {'error': 'client_id/client_secret not configured for org %s' % org_id}
    ssl_files = get_ssl_context(org_id)
    cert_pair = (ssl_files[0], ssl_files[1]) if ssl_files else None
    token_data_form = {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': cid,
        'client_secret': csecret,
        'redirect_uri': REDIRECT_URI,
    }
    resp = None
    errors = []
    for url in SBER_TOKEN_URLS:
        try:
            resp = requests.post(url, data=token_data_form, cert=cert_pair, verify=False, timeout=20)
            if resp.status_code == 200:
                break
            err_detail = resp.text[:200].strip()
            if 'certificateNotFound' in err_detail:
                errors.append('Сертификат не привязан к client_id в личном кабинете Сбера (certificateNotFound)')
            else:
                errors.append('%s → HTTP %s %s' % (url, resp.status_code, err_detail))
        except Exception as e:
            errors.append('%s → %s' % (url, str(e)[:120]))
            resp = None
    if not resp or resp.status_code != 200:
        conn.close()
        return {'error': 'Token exchange failed on all URLs: %s' % '; '.join(errors)}
    token_data = resp.json()
    access_token = token_data.get('access_token', '')
    refresh_token = token_data.get('refresh_token', '')
    expires_in = int(token_data.get('expires_in', 3600))
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    cur.execute(
        "UPDATE bank_connections SET access_token='%s', refresh_token='%s', token_expires_at='%s', updated_at=NOW() WHERE id=%s"
        % (esc(access_token), esc(refresh_token), expires_at.isoformat(), connection_id)
    )
    conn.commit()
    conn.close()
    return {'success': True, 'expires_at': expires_at.isoformat()}


def handle_fetch(body):
    """Load statement for a single connection."""
    connection_id = int(body.get('connection_id', 0))
    target_date = body.get('date', (date.today() - timedelta(days=1)).isoformat())
    if not connection_id:
        return {'error': 'connection_id required'}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, org_id, account_number, access_token, refresh_token, token_expires_at
        FROM bank_connections WHERE id=%s
    """ % connection_id)
    row = cur.fetchone()
    if not row:
        conn.close()
        return {'error': 'Connection not found'}
    c = {
        'id': row[0], 'org_id': row[1], 'account_number': row[2],
        'access_token': row[3], 'refresh_token': row[4], 'token_expires_at': row[5],
    }
    result = load_statement(cur, conn, c, target_date)
    conn.close()
    return result


def handle_fetch_all(body):
    """Load statements for all active connections."""
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
    return results


def handle_statements(params):
    """List bank_statements with org_name."""
    connection_id = params.get('connection_id', '')
    limit = int(params.get('limit', '50'))
    offset = int(params.get('offset', '0'))
    conn = get_conn()
    cur = conn.cursor()
    where = ''
    if connection_id:
        where = ' WHERE bs.connection_id=%s' % int(connection_id)
    # Count
    cur.execute("SELECT COUNT(*) FROM bank_statements bs %s" % where)
    total = cur.fetchone()[0]
    cur.execute("""
        SELECT bs.id, bs.connection_id, COALESCE(o.name, ''), bs.statement_date,
               bs.opening_balance, bs.closing_balance, bs.debit_turnover, bs.credit_turnover,
               bs.transaction_count, COALESCE(bs.matched_count, 0), COALESCE(bs.unmatched_count, 0),
               bs.status, bs.created_at
        FROM bank_statements bs
        LEFT JOIN bank_connections bc ON bc.id = bs.connection_id
        LEFT JOIN organizations o ON o.id = bc.org_id
        %s
        ORDER BY bs.statement_date DESC, bs.id DESC
        LIMIT %s OFFSET %s
    """ % (where, limit, offset))
    rows = cur.fetchall()
    conn.close()
    items = []
    for r in rows:
        items.append({
            'id': r[0],
            'connection_id': r[1],
            'org_name': r[2],
            'statement_date': r[3],
            'opening_balance': float(r[4] or 0),
            'closing_balance': float(r[5] or 0),
            'debit_turnover': float(r[6] or 0),
            'credit_turnover': float(r[7] or 0),
            'transaction_count': r[8] or 0,
            'matched_count': r[9],
            'unmatched_count': r[10],
            'status': r[11],
            'created_at': r[12],
        })
    return {'items': items, 'total': total}


def handle_transactions(params):
    """List bank_transactions, optionally filtered by statement_id and match_status."""
    statement_id = params.get('statement_id', '')
    match_status = params.get('match_status', '')
    conditions = []
    if statement_id:
        conditions.append('bt.statement_id=%s' % int(statement_id))
    if match_status:
        conditions.append("bt.match_status='%s'" % esc(match_status))
    where = (' WHERE ' + ' AND '.join(conditions)) if conditions else ''
    conn = get_conn()
    cur = conn.cursor()
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
    result = []
    for r in rows:
        result.append({
            'id': r[0],
            'statement_id': r[1],
            'sber_uuid': r[2],
            'operation_date': r[3],
            'document_date': r[4],
            'document_number': r[5],
            'amount': float(r[6] or 0),
            'direction': r[7],
            'payment_purpose': r[8],
            'payer_name': r[9],
            'payer_inn': r[10],
            'payee_name': r[11],
            'payee_inn': r[12],
            'matched_contract_no': r[13],
            'matched_entity': r[14],
            'matched_entity_id': r[15],
            'match_status': r[16],
            'payment_id': r[17],
            'created_at': r[18],
        })
    return result


# ─── Main handler ─────────────────────────────────────────────────────────────

def handler(event, context):
    """Bank statements from Sber API with OAuth2, statement loading, and payment matching."""
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

    # If action is in body (for POST requests where frontend sends action in body)
    if not action and body.get('action'):
        action = body['action']

    try:
        # ── GET actions ──────────────────────────────────────────────────
        if action == 'test':
            return cors_json(handle_test(params))

        if action == 'connections':
            return cors_json(handle_connections())

        if action == 'auth_url':
            result = handle_auth_url(params)
            if 'error' in result:
                return cors_json(result, 400)
            return cors_json(result)

        if action == 'callback':
            return handle_callback(params)

        if action == 'statements':
            return cors_json(handle_statements(params))

        if action == 'transactions':
            return cors_json(handle_transactions(params))

        # ── POST actions ─────────────────────────────────────────────────
        if action == 'upload_cert':
            return cors_json(handle_upload_cert(body))

        if action == 'save_connection':
            result = handle_save_connection(body)
            if 'error' in result:
                return cors_json(result, 400)
            return cors_json(result)

        if action == 'toggle_connection':
            result = handle_toggle_connection(body)
            return cors_json(result)

        if action == 'auth_callback':
            result = handle_auth_callback(body)
            if 'error' in result:
                return cors_json(result, 400)
            return cors_json(result)

        if action == 'fetch':
            result = handle_fetch(body)
            if 'error' in result:
                return cors_json(result, 400)
            return cors_json(result)

        if action == 'fetch_all':
            result = handle_fetch_all(body)
            return cors_json(result)

        # ── Default: cron-style fetch all active connections (legacy) ────
        if method == 'POST' and not action:
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
            return cors_json({
                'date': target_date,
                'connections_processed': len(results),
                'results': results,
            })

        return cors_json({'error': 'Unknown action: %s' % action}, 400)

    except Exception as e:
        import traceback
        return cors_json({'error': str(e), 'trace': traceback.format_exc()}, 500)