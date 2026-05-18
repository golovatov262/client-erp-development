import json
import os
import urllib.request
import urllib.error

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
}

API_BASE = 'https://api.loanapp.ru'


def cors_json(data, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(data, ensure_ascii=False),
        'isBase64Encoded': False,
    }


def call_upstream(method: str, path: str, body: dict | None = None):
    url = f'{API_BASE}{path}'
    api_key = os.environ.get('CREDIT_CHECK_API_KEY', '')
    headers = {
        'X-API-Key': api_key,
        'Accept': 'application/json',
    }
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            status = resp.getcode()
            raw = resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode('utf-8', errors='replace') if e.fp else str(e)
    except (urllib.error.URLError, TimeoutError) as e:
        return cors_json({'error': 'Upstream timeout or unreachable', 'detail': str(e)}, 504)
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        payload = {'raw': raw}
    return cors_json(payload, status)


def handler(event: dict, context) -> dict:
    """Прокси к Credit Check API (api.loanapp.ru) с серверным ключом X-API-Key.

    Маршруты:
      POST /         — создать проверку (body: данные заёмщика)
      GET  /{id}     — получить статус и результаты проверки
    """
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    check_id = (params.get('check_id') or '').strip()

    if method == 'POST':
        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return cors_json({'error': 'Invalid JSON body'}, 400)
        if not os.environ.get('CREDIT_CHECK_API_KEY'):
            return cors_json({'error': 'CREDIT_CHECK_API_KEY is not configured'}, 500)
        return call_upstream('POST', '/api/v1/checks', body)

    if method == 'GET':
        if not check_id:
            return cors_json({'error': 'check_id query parameter is required'}, 400)
        if not os.environ.get('CREDIT_CHECK_API_KEY'):
            return cors_json({'error': 'CREDIT_CHECK_API_KEY is not configured'}, 500)
        return call_upstream('GET', f'/api/v1/checks/{check_id}')

    return cors_json({'error': 'Method not allowed'}, 405)