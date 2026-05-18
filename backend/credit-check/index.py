import json
import os
import threading
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
UPSTREAM_TIMEOUT = 25
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


def call_upstream(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    url = f'{API_BASE}{path}'
    api_key = os.environ.get('CREDIT_CHECK_API_KEY', '')
    headers = {'X-API-Key': api_key, 'Accept': 'application/json'}
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


def derive_status(upstream_status: int, payload: dict) -> str:
    if upstream_status >= 500 or upstream_status == 504:
        return 'pending'
    if upstream_status >= 400:
        return 'error'
    raw = (payload or {}).get('status') or ''
    if raw in FINAL_STATUSES:
        return raw
    return 'pending'


def bg_create_upstream(local_id: int, body: dict):
    try:
        status, payload = call_upstream('POST', '/api/v1/checks', body)
        upstream_id = (payload or {}).get('check_id') or (payload or {}).get('id')
        new_status = derive_status(status, payload)
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE credit_checks SET upstream_check_id = %s, status = %s, response_payload = %s, error_text = %s, updated_at = NOW() WHERE id = %s",
                (
                    str(upstream_id) if upstream_id else None,
                    new_status,
                    json.dumps(payload, ensure_ascii=False),
                    None if status < 400 else json.dumps(payload, ensure_ascii=False),
                    local_id,
                ),
            )
    except Exception as e:
        try:
            with db_connect() as conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE credit_checks SET status = 'error', error_text = %s, updated_at = NOW() WHERE id = %s",
                    (str(e), local_id),
                )
        except Exception:
            pass


def bg_refresh_upstream(local_id: int, upstream_id: str):
    try:
        status, payload = call_upstream('GET', f'/api/v1/checks/{upstream_id}')
        new_status = derive_status(status, payload)
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE credit_checks SET status = %s, response_payload = %s, error_text = %s, updated_at = NOW() WHERE id = %s",
                (
                    new_status,
                    json.dumps(payload, ensure_ascii=False),
                    None if status < 400 else json.dumps(payload, ensure_ascii=False),
                    local_id,
                ),
            )
    except Exception:
        pass


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


def handler(event: dict, context) -> dict:
    """Асинхронный прокси к Credit Check API.

    POST /            — создаёт локальную запись, в фоне дёргает upstream, сразу возвращает id (pending).
    GET ?check_id=ID  — отдаёт текущее состояние из БД. Если статус pending — на фоне обновляет данные с upstream.
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

        upstream_body = {k: v for k, v in body.items() if k != 'member_id'}

        with db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO credit_checks (member_id, status, request_payload) VALUES (%s, 'pending', %s) RETURNING id, created_at",
                (member_id_int, json.dumps(upstream_body, ensure_ascii=False)),
            )
            row = cur.fetchone()
            local_id = row[0]
            created_at = row[1]

        t = threading.Thread(target=bg_create_upstream, args=(local_id, upstream_body), daemon=True)
        t.start()

        return cors_json({
            'check_id': str(local_id),
            'id': local_id,
            'status': 'pending',
            'created_at': created_at.isoformat() if created_at else None,
        }, 202)

    if method == 'GET':
        check_id = (params.get('check_id') or '').strip()
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
            t = threading.Thread(
                target=bg_refresh_upstream,
                args=(local_id, row['upstream_check_id']),
                daemon=True,
            )
            t.start()

        return cors_json(row_to_dict(row))

    return cors_json({'error': 'Method not allowed'}, 405)