import json
import os
import hashlib
import urllib.request
import urllib.error
import psycopg2
import psycopg2.extras

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
}

API_BASE = 'https://api.loanapp.ru'
UPSTREAM_TIMEOUT = 10
FINAL_STATUSES = {'done', 'error', 'failed', 'completed'}


def cors_json(data, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(data, ensure_ascii=False, default=str),
        'isBase64Encoded': False,
    }


def db_connect():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def call_upstream(method: str, path: str, body: dict | None = None, extra_headers: dict | None = None) -> tuple[int, dict]:
    url = f'{API_BASE}{path}'
    api_key = os.environ.get('CREDIT_CHECK_API_KEY', '')
    headers = {'X-API-Key': api_key, 'Accept': 'application/json'}
    if extra_headers:
        headers.update(extra_headers)
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
            status = resp.getcode()
            raw = resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode('utf-8', errors='replace') if e.fp else str(e)
    except (urllib.error.URLError, TimeoutError) as e:
        return 504, {'error': 'Upstream timeout or unreachable', 'detail': str(e)}
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        payload = {'raw': raw}
    return status, payload


def derive_status(payload: dict) -> str:
    raw = (payload or {}).get('status') or ''
    if raw in FINAL_STATUSES:
        return raw
    return 'pending'


def row_to_dict(row: dict) -> dict:
    response = row.get('response_payload') or {}
    if isinstance(response, str):
        try:
            response = json.loads(response)
        except Exception:
            response = {}
    return {
        'id': row['id'],
        'member_id': row.get('member_id'),
        'check_id': str(row['id']),
        'upstream_check_id': row.get('upstream_check_id'),
        'status': row['status'],
        'result': response,
        'error': row.get('error_text'),
        'created_at': row['created_at'].isoformat() if row.get('created_at') else None,
        'updated_at': row['updated_at'].isoformat() if row.get('updated_at') else None,
    }


def build_idempotency_key(body: dict) -> str:
    series = str(body.get('passport_series') or '').strip()
    number = str(body.get('passport_number') or '').strip()
    consent = str(body.get('consent_date') or '').strip()
    if series and number and consent:
        return f'{series}{number}-{consent}'
    payload = json.dumps(body, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()[:48]


def fetch_and_persist(local_id: int, upstream_id: str) -> dict:
    """Запрашивает свежий статус у upstream и сохраняет в БД."""
    status, payload = call_upstream('GET', f'/api/v1/checks/{upstream_id}')
    new_status = derive_status(payload) if status < 400 else 'pending'
    err_text = None if status < 400 else json.dumps(payload, ensure_ascii=False)
    with db_connect() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "UPDATE credit_checks SET status = %s, response_payload = %s, error_text = %s, updated_at = NOW() WHERE id = %s RETURNING *",
            (new_status, json.dumps(payload, ensure_ascii=False), err_text, local_id),
        )
        return cur.fetchone()


def handler(event: dict, context) -> dict:
    """Прокси к api.loanapp.ru (асинхронный режим).

    POST /            — создаёт проверку (Idempotency-Key), сохраняет в БД, возвращает локальный id.
    GET ?check_id=ID  — отдаёт состояние; если pending — синхронно опрашивает upstream (короткий таймаут).
    GET ?passport=... — восстановление check_id по паспорту через upstream.
    """
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    if not os.environ.get('CREDIT_CHECK_API_KEY'):
        return cors_json({'error': 'CREDIT_CHECK_API_KEY is not configured'}, 500)

    params = event.get('queryStringParameters') or {}

    if method == 'POST':
        raw_body = event.get('body') or '{}'
        try:
            body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
        except json.JSONDecodeError:
            return cors_json({'error': 'Invalid JSON body'}, 400)
        if not isinstance(body, dict):
            body = {}

        member_id = body.get('member_id')
        try:
            member_id_int = int(member_id) if member_id is not None else None
        except (TypeError, ValueError):
            member_id_int = None

        callback_url = body.get('callback_url')
        upstream_body = {k: v for k, v in body.items() if k not in ('member_id',)}

        idem_key = build_idempotency_key(upstream_body)

        with db_connect() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM credit_checks WHERE idempotency_key = %s", (idem_key,))
            existing = cur.fetchone()

            if existing and (existing['status'] in ('done', 'completed') or existing.get('upstream_check_id')):
                return cors_json(row_to_dict(existing), 200)

            if existing:
                local_id = existing['id']
                created_at = existing['created_at']
                cur.execute(
                    "UPDATE credit_checks SET status = 'pending', error_text = NULL, response_payload = NULL, "
                    "request_payload = %s, callback_url = COALESCE(%s, callback_url), updated_at = NOW() WHERE id = %s",
                    (json.dumps(upstream_body, ensure_ascii=False), callback_url, local_id),
                )
            else:
                cur.execute(
                    "INSERT INTO credit_checks (member_id, status, request_payload, idempotency_key, callback_url) "
                    "VALUES (%s, 'pending', %s, %s, %s) RETURNING id, created_at",
                    (
                        member_id_int,
                        json.dumps(upstream_body, ensure_ascii=False),
                        idem_key,
                        callback_url,
                    ),
                )
                row = cur.fetchone()
                local_id = row['id']
                created_at = row['created_at']

        status, payload = call_upstream(
            'POST',
            '/api/v1/checks',
            upstream_body,
            extra_headers={'Idempotency-Key': idem_key},
        )

        if status >= 400:
            with db_connect() as conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE credit_checks SET status = 'error', error_text = %s, response_payload = %s, updated_at = NOW() WHERE id = %s",
                    (json.dumps(payload, ensure_ascii=False), json.dumps(payload, ensure_ascii=False), local_id),
                )
            return cors_json({
                'check_id': str(local_id),
                'id': local_id,
                'status': 'error',
                'error': payload,
            }, 200)

        upstream_id = (payload or {}).get('check_id') or (payload or {}).get('id')
        new_status = derive_status(payload)

        with db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE credit_checks SET upstream_check_id = %s, status = %s, response_payload = %s, updated_at = NOW() WHERE id = %s",
                (
                    str(upstream_id) if upstream_id else None,
                    new_status,
                    json.dumps(payload, ensure_ascii=False),
                    local_id,
                ),
            )

        return cors_json({
            'check_id': str(local_id),
            'id': local_id,
            'upstream_check_id': str(upstream_id) if upstream_id else None,
            'status': new_status,
            'created_at': created_at.isoformat() if created_at else None,
        }, 202)

    if method == 'GET':
        check_id = (params.get('check_id') or '').strip()
        passport = (params.get('passport') or '').strip()
        member_id_q = (params.get('member_id') or '').strip()

        if passport:
            status, payload = call_upstream('GET', f'/api/v1/checks?passport={passport}&limit=1')
            if status >= 400:
                return cors_json({'error': 'Upstream error', 'detail': payload}, status)
            return cors_json(payload, 200)

        if member_id_q:
            try:
                m_id = int(member_id_q)
            except ValueError:
                return cors_json({'error': 'member_id must be integer'}, 400)
            with db_connect() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM credit_checks WHERE member_id = %s ORDER BY created_at DESC LIMIT 1",
                    (m_id,),
                )
                row = cur.fetchone()
            if not row:
                return cors_json({'error': 'No checks found for member'}, 404)
            if row['status'] == 'pending' and row.get('upstream_check_id'):
                try:
                    updated = fetch_and_persist(row['id'], row['upstream_check_id'])
                    if updated:
                        row = updated
                except Exception:
                    pass
            return cors_json(row_to_dict(row))

        if not check_id:
            return cors_json({'error': 'check_id query parameter is required'}, 400)
        try:
            local_id = int(check_id)
        except ValueError:
            return cors_json({'error': 'check_id must be integer'}, 400)

        with db_connect() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM credit_checks WHERE id = %s", (local_id,))
            row = cur.fetchone()

        if not row:
            return cors_json({'error': 'Check not found'}, 404)

        if row['status'] == 'pending' and row.get('upstream_check_id'):
            try:
                updated = fetch_and_persist(local_id, row['upstream_check_id'])
                if updated:
                    row = updated
            except Exception:
                pass

        return cors_json(row_to_dict(row))

    return cors_json({'error': 'Method not allowed'}, 405)