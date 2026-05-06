import json
import os
import time
import hmac
import hashlib
import random
import re
import smtplib
import urllib.request
import urllib.error
from datetime import date, datetime
from email.mime.text import MIMEText
import psycopg2

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}

NOTIFY_EMAIL = 'info@sll-expert.ru'

# Поля заявки, которые принимаем с публичной формы
PUBLIC_FIELDS = [
    'borrower_type', 'amount', 'term_months', 'loan_program', 'collateral_types',
    'full_name', 'birth_date', 'birth_place',
    'passport_series_number', 'passport_issue_date', 'passport_issued_by', 'passport_division_code',
    'registration_address', 'mobile_phone', 'email', 'inn',
    'bank_account', 'bik', 'bank_name',
    'official_income', 'income_confirmation', 'employer_inn', 'employer_name', 'position',
    'additional_income_type', 'additional_income', 'additional_income_other',
    'current_loans_payments', 'mandatory_expenses', 'has_active_loans',
    'marital_status', 'has_minor_children', 'children_count',
    'spouse_name', 'spouse_phone', 'spouse_income', 'has_maternal_capital',
    'real_estate_type', 'cadastral_number', 'property_address',
    'land_cadastral_number', 'land_address',
    'car_brand', 'car_model', 'car_year', 'car_market_value',
    'other_collateral_description', 'contact_full_name', 'contact_phone',
    'association',
]

NUMERIC_FIELDS = {'amount', 'official_income', 'additional_income',
                  'current_loans_payments', 'mandatory_expenses',
                  'spouse_income', 'car_market_value'}
INT_FIELDS = {'term_months', 'children_count', 'car_year'}
DATE_FIELDS = {'birth_date', 'passport_issue_date'}


def cors_json(data, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'isBase64Encoded': False,
        'body': json.dumps(data, default=str, ensure_ascii=False),
    }


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def captcha_secret():
    # Используем DATABASE_URL как база для секрета подписи капчи
    return os.environ.get('DATABASE_URL', 'fallback')[:64]


def sign_captcha(answer: int, ts: int) -> str:
    msg = ('%d:%d' % (answer, ts)).encode('utf-8')
    return hmac.new(captcha_secret().encode('utf-8'), msg, hashlib.sha256).hexdigest()[:32]


def gen_captcha():
    a = random.randint(2, 9)
    b = random.randint(2, 9)
    op = random.choice(['+', '-'])
    if op == '+':
        ans = a + b
        q = '%d + %d' % (a, b)
    else:
        if a < b:
            a, b = b, a
        ans = a - b
        q = '%d - %d' % (a, b)
    ts = int(time.time())
    sig = sign_captcha(ans, ts)
    token = '%d.%d.%s' % (ans, ts, sig)
    return q, token


def verify_captcha(token: str, user_answer: str) -> bool:
    if not token or not user_answer:
        return False
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return False
        ans = int(parts[0])
        ts = int(parts[1])
        sig = parts[2]
        if abs(int(time.time()) - ts) > 600:
            return False
        expected = sign_captcha(ans, ts)
        if not hmac.compare_digest(sig, expected):
            return False
        return int(user_answer) == ans
    except Exception:
        return False


def esc(s):
    if s is None:
        return ''
    return str(s).replace("'", "''")


def sql_val(field, val):
    if val is None or val == '':
        return 'NULL'
    if field in NUMERIC_FIELDS:
        try:
            return str(float(str(val).replace(',', '.').replace(' ', '')))
        except Exception:
            return 'NULL'
    if field in INT_FIELDS:
        try:
            return str(int(float(str(val))))
        except Exception:
            return 'NULL'
    if field in DATE_FIELDS:
        s = str(val).strip()
        if not s:
            return 'NULL'
        return "'%s'" % esc(s[:10])
    return "'%s'" % esc(str(val)[:1000])


def validate_required(body):
    errors = []
    full_name = (body.get('full_name') or '').strip()
    phone = (body.get('mobile_phone') or '').strip()
    email_v = (body.get('email') or '').strip()
    consent = body.get('consent_pd')
    if not full_name or len(full_name) < 3:
        errors.append('Укажите ФИО')
    if not phone or len(re.sub(r'\D', '', phone)) < 10:
        errors.append('Укажите корректный телефон')
    if not email_v or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email_v):
        errors.append('Укажите корректный email')
    if not consent:
        errors.append('Необходимо согласие на обработку персональных данных')
    return errors


def send_application_email(app_no, body, source):
    """Отправка уведомления о новой заявке на info@sll-expert.ru."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT settings FROM notification_channels WHERE channel='email'")
        row = cur.fetchone()
        conn.close()
        if not row:
            return False, 'channel not configured'
        ch = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        smtp_host = ch.get('smtp_host', '')
        smtp_port = int(ch.get('smtp_port', 587))
        smtp_user = ch.get('smtp_user', '')
        smtp_pass = ch.get('smtp_pass', '')
        from_email = ch.get('from_email', '')
        from_name = ch.get('from_name', 'Заявки с сайта')
        if not smtp_host or not smtp_user or not from_email:
            return False, 'smtp not configured'

        labels = {
            'full_name': 'ФИО',
            'mobile_phone': 'Телефон',
            'email': 'Email',
            'amount': 'Сумма',
            'term_months': 'Срок (мес.)',
            'loan_program': 'Программа',
            'collateral_types': 'Залог',
            'birth_date': 'Дата рождения',
            'birth_place': 'Место рождения',
            'passport_series_number': 'Паспорт серия/номер',
            'passport_issue_date': 'Дата выдачи паспорта',
            'passport_issued_by': 'Кем выдан',
            'passport_division_code': 'Код подразделения',
            'registration_address': 'Адрес регистрации',
            'inn': 'ИНН',
            'bank_account': 'Расчётный счёт',
            'bik': 'БИК',
            'bank_name': 'Банк',
            'official_income': 'Официальный доход',
            'income_confirmation': 'Подтверждение дохода',
            'employer_inn': 'ИНН работодателя',
            'employer_name': 'Работодатель',
            'position': 'Должность',
            'additional_income_type': 'Доп. доход (тип)',
            'additional_income': 'Доп. доход (сумма)',
            'current_loans_payments': 'Платежи по тек. займам',
            'mandatory_expenses': 'Обязательные расходы',
            'has_active_loans': 'Действующие займы',
            'marital_status': 'Семейное положение',
            'has_minor_children': 'Несовершеннолетние дети',
            'children_count': 'Количество детей',
            'spouse_name': 'Супруг(а)',
            'spouse_phone': 'Телефон супруга(и)',
            'spouse_income': 'Доход супруга(и)',
            'has_maternal_capital': 'Маткапитал',
            'real_estate_type': 'Недвижимость (тип)',
            'cadastral_number': 'Кадастровый номер',
            'property_address': 'Адрес объекта',
            'car_brand': 'Авто марка',
            'car_model': 'Авто модель',
            'car_year': 'Год авто',
            'car_market_value': 'Стоимость авто',
            'contact_full_name': 'Контактное лицо',
            'contact_phone': 'Телефон контакта',
        }

        lines = ['Поступила новая заявка с сайта.', '', 'Номер заявки: %s' % app_no, 'Источник: %s' % (source or 'не указан'), '']
        for f in PUBLIC_FIELDS + ['full_name', 'mobile_phone', 'email']:
            if f in labels and body.get(f):
                lines.append('%s: %s' % (labels[f], body.get(f)))
        text = '\n'.join(lines)

        subject = 'Новая заявка на займ %s' % app_no
        msg = MIMEText(text, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = '%s <%s>' % (from_name, from_email) if from_name else from_email
        msg['To'] = NOTIFY_EMAIL

        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_email, [NOTIFY_EMAIL], msg.as_string())
        return True, ''
    except Exception as e:
        return False, str(e)


DADATA_ENDPOINTS = {
    'address': 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
    'fms_unit': 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/fms_unit',
    'party': 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party',
}


def dadata_suggest(action: str, query: str):
    """Прокси к DaData для подсказок (адрес, ФМС, организация)."""
    if action not in DADATA_ENDPOINTS:
        return {'error': 'Unsupported action'}
    api_key = os.environ.get('DADATA_API_KEY', '').strip()
    if not api_key:
        return {'suggestions': []}
    q = (query or '').strip()
    if len(q) < 2:
        return {'suggestions': []}
    payload = json.dumps({'query': q, 'count': 8}).encode('utf-8')
    req = urllib.request.Request(
        DADATA_ENDPOINTS[action],
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Token %s' % api_key,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return {'suggestions': data.get('suggestions', [])}
    except urllib.error.HTTPError as e:
        return {'error': 'dadata http %d' % e.code, 'suggestions': []}
    except Exception as e:
        return {'error': str(e), 'suggestions': []}


def handler(event, context):
    """Публичный приём заявок на займ с сайта (с капчей, DaData-подсказками и уведомлением на email)."""
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'isBase64Encoded': False, 'body': ''}

    if method == 'GET':
        params = event.get('queryStringParameters') or {}
        if params.get('action') == 'captcha':
            q, token = gen_captcha()
            return cors_json({'question': q, 'token': token})
        return cors_json({'service': 'public-application', 'ok': True})

    if method != 'POST':
        return cors_json({'error': 'Method not allowed'}, 405)

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return cors_json({'error': 'Невалидный JSON'}, 400)

    # DaData-подсказки (без капчи — это запрос подсказок, не сохранение)
    if body.get('action') == 'dadata':
        suggest_type = (body.get('type') or '').strip()
        query = (body.get('query') or '').strip()
        return cors_json(dadata_suggest(suggest_type, query))

    captcha_token = body.get('captcha_token', '')
    captcha_answer = body.get('captcha_answer', '')
    if not verify_captcha(captcha_token, captcha_answer):
        return cors_json({'error': 'Неверный код проверки. Обновите задачу и попробуйте снова.'}, 400)

    errors = validate_required(body)
    if errors:
        return cors_json({'error': '; '.join(errors)}, 400)

    source = (body.get('source') or '').strip()[:200]
    ip = (event.get('requestContext', {}).get('identity') or {}).get('sourceIp', '') or ''

    try:
        conn = get_conn()
        cur = conn.cursor()
        cols = ['status']
        vals = ["'new'"]
        for f in PUBLIC_FIELDS:
            if f in body:
                cols.append(f)
                vals.append(sql_val(f, body[f]))
        # Обязательные текстовые
        for f in ('full_name', 'mobile_phone', 'email'):
            if f not in cols and body.get(f):
                cols.append(f)
                vals.append(sql_val(f, body[f]))

        comment_parts = ['Заявка с сайта']
        if source:
            comment_parts.append('источник: %s' % source)
        if ip:
            comment_parts.append('IP: %s' % ip)
        cols.append('specialist_comment')
        vals.append("'%s'" % esc(' | '.join(comment_parts)))

        sql = "INSERT INTO loan_applications (%s) VALUES (%s) RETURNING id" % (','.join(cols), ','.join(vals))
        cur.execute(sql)
        app_id = cur.fetchone()[0]
        app_no = 'ЗЗ-%06d' % app_id
        cur.execute("UPDATE loan_applications SET application_no='%s' WHERE id=%s" % (app_no, app_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        return cors_json({'error': 'Ошибка сохранения: %s' % str(e)}, 500)

    sent, _err = send_application_email(app_no, body, source)

    return cors_json({'success': True, 'application_no': app_no, 'email_sent': sent})