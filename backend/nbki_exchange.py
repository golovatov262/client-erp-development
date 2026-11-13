"""Durable exchange queue. Private keys and NBKI mutual TLS stay on Windows.

An authenticated, organization-scoped worker performs and attests cryptographic
verification. An uncertain upload is never automatically re-sent.
"""
import base64
import hashlib
import io
import json
import re
import secrets
import zipfile
from datetime import datetime, timezone
from urllib.parse import urlsplit
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from psycopg2.extras import Json, RealDictCursor

MAX_FILE = 25 * 1024 * 1024
UPLOAD_URL = 'https://icrs.nbki.ru/inout/cgi-bin/uploadvb.cgi'
RECEIPTS_URL = 'https://icrs.nbki.ru/inout/outGUTDF/'
ACTIVE = ('queued', 'processing', 'prepared', 'sending', 'delivery_unknown', 'sent')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def decode(value, maximum=MAX_FILE):
    if not isinstance(value, str) or len(value) > (maximum + 2) * 4 // 3 + 4:
        raise ValueError('Файл превышает допустимый размер')
    raw = base64.b64decode(value, validate=True)
    if not raw or len(raw) > maximum:
        raise ValueError('Пустой или слишком большой файл')
    return raw


def certificate(value):
    raw = decode(value, 65536)
    cert = (x509.load_pem_x509_certificate(raw) if b'-----BEGIN CERTIFICATE' in raw
            else x509.load_der_x509_certificate(raw))
    der = cert.public_bytes(serialization.Encoding.DER)
    now = datetime.now(timezone.utc)
    start = cert.not_valid_before_utc if hasattr(cert, 'not_valid_before_utc') else cert.not_valid_before.replace(tzinfo=timezone.utc)
    end = cert.not_valid_after_utc if hasattr(cert, 'not_valid_after_utc') else cert.not_valid_after.replace(tzinfo=timezone.utc)
    if not start <= now < end:
        raise ValueError('Сертификат ещё не действует или срок действия истёк')
    return {'der_base64': base64.b64encode(der).decode(), 'subject': cert.subject.rfc4514_string(),
            'sha256': digest(der), 'thumbprint': hashlib.sha1(der).hexdigest().upper(),
            'valid_until': end.isoformat()}


def thumbprint(value):
    value = re.sub(r'\s', '', str(value or '')).upper()
    if value and not re.fullmatch(r'[0-9A-F]{40}', value):
        raise ValueError('Отпечаток сертификата должен содержать 40 шестнадцатеричных символов')
    return value


def directory_url(value):
    if not value:
        return ''
    p = urlsplit(value)
    if (p.scheme != 'https' or not p.hostname or p.username or p.password or p.query or p.fragment
            or not (p.hostname == 'nbki.ru' or p.hostname.endswith('.nbki.ru')) or p.port not in (None,443)):
        raise ValueError('Укажите HTTPS-каталог на домене nbki.ru без пароля и параметров')
    return value.rstrip('/') + '/'


def normalize_config(body, previous):
    config = dict(previous)
    for key in ('signer_thumbprint', 'tls_thumbprint'):
        config[key] = thumbprint(body.get(key, config.get(key)))
    config.update(upload_url=UPLOAD_URL, receipts_url=RECEIPTS_URL,
                  signature_mode='detached', signature_profile='CAdES-T', protocol_version=2)
    transport = body.get('transport', config.get('transport', 'disabled'))
    if transport not in ('disabled', 'nbki_https'):
        raise ValueError('Используйте HTTPS API НБКИ; старый Windows-компонент необходимо обновить')
    config['transport'] = transport
    auto_receive = body.get('auto_receive', config.get('auto_receive', False))
    if not isinstance(auto_receive, bool):raise ValueError('Неверный признак автоматического получения')
    config['auto_receive'] = auto_receive
    suffix = body.get('package_suffix', config.get('package_suffix', '.zip.p7m'))
    if suffix not in ('.zip.enc', '.zip.p7m'):
        raise ValueError('Допустимы расширения .zip.p7m и .zip.enc')
    config['package_suffix'] = suffix
    tsp = str(body.get('tsp_url', config.get('tsp_url', ''))).strip()
    if tsp:
        u = urlsplit(tsp)
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.fragment:
            raise ValueError('Укажите адрес службы TSP вашего аккредитованного УЦ без пароля')
    config['tsp_url'] = tsp
    if 'mchd_base64' in body:
        if body['mchd_base64']:
            mchd = decode(body['mchd_base64'], 2*1024*1024)
            if not zipfile.is_zipfile(io.BytesIO(mchd)):raise ValueError('МЧД: ожидается ZIP-архив')
            with zipfile.ZipFile(io.BytesIO(mchd)) as z:
                names = z.namelist()
                if not names or len(names)>10 or any('/' in n or '\\' in n or not n.lower().endswith(('.xml','.sig')) for n in names):
                    raise ValueError('МЧД: ожидается зарегистрированный ZIP с XML и SIG')
                if sum(i.file_size for i in z.infolist())>2*1024*1024:
                    raise ValueError('МЧД превышает допустимый размер')
                if z.testzip():raise ValueError('Повреждённый ZIP МЧД')
            config['mchd_base64'] = body['mchd_base64']
        else:config.pop('mchd_base64',None)
    if body.get('recipient_certificate'):
        config['recipient'] = certificate(body['recipient_certificate'])
    if body.get('receipt_certificate'):
        config['receipt_signer'] = certificate(body['receipt_certificate'])
    return config


def settings(cur, org):
    cur.execute('SELECT config FROM nbki_exchange_settings WHERE org_id=%s', (org,))
    row = cur.fetchone()
    return row[0] if row else {}


def ensure_ready(config):
    if not config.get('recipient') or not config.get('signer_thumbprint'):
        raise ValueError('Загрузите сертификат НБКИ и выберите сертификат подписанта')
    certificate(config['recipient']['der_base64'])
    if config.get('protocol_version')!=2 or config.get('signature_profile')!='CAdES-T' or not config.get('tsp_url'):
        raise ValueError('Сохраните настройки CAdES-T и укажите адрес TSP из списка НБКИ')
    if config.get('auto_receive') and not config.get('receipt_signer'):
        raise ValueError('Для получения квитанций загрузите сертификат проверки подписи НБКИ')


def reserved(cur, org, ids):
    if __package__:
        from .nbki_reporting_policy import paired_ids
    else:
        from nbki_reporting_policy import paired_ids
    ids = paired_ids(cur,org,[int(i) for i in ids])
    cur.execute('''SELECT id FROM nbki_exchange_packages WHERE org_id=%s
        AND event_ids && %s::bigint[] AND status=ANY(%s) LIMIT 1''', (org,ids,list(ACTIVE)))
    row = cur.fetchone()
    if row:
        raise ValueError(f'События уже включены в пакет обмена №{row[0]}')


def admin(cur, conn, org, method, body, actor):
    action = body['action']
    if action == 'exchange_status' and method == 'GET':
        config = settings(cur,org)
        with conn.cursor(cursor_factory=RealDictCursor) as q:
            q.execute('''SELECT id,file_name,reg_number,event_ids,status,error,encrypted_name,
                created_at,updated_at FROM nbki_exchange_packages WHERE org_id=%s ORDER BY id DESC LIMIT 50''',(org,))
            packages = [dict(r) for r in q.fetchall()]
            q.execute('SELECT id,name,active,last_seen_at,diagnostic FROM nbki_exchange_agents WHERE org_id=%s ORDER BY id DESC',(org,))
            agents = [dict(r) for r in q.fetchall()]
        return json.loads(json.dumps({'config':config,'packages':packages,'agents':agents},default=str))
    if method != 'POST':
        raise ValueError('Неверный метод запроса')
    if action == 'exchange_settings':
        config = normalize_config(body,settings(cur,org))
        cur.execute('''INSERT INTO nbki_exchange_settings(org_id,config) VALUES (%s,%s)
            ON CONFLICT(org_id) DO UPDATE SET config=EXCLUDED.config,updated_at=now()''',(org,Json(config)))
        result = {'config':config}
    elif action == 'exchange_agent_create':
        token = secrets.token_urlsafe(40)
        cur.execute('INSERT INTO nbki_exchange_agents(org_id,name,token_hash) VALUES (%s,%s,%s) RETURNING id',
                    (org,str(body.get('name') or 'Windows НБКИ')[:100],digest(token.encode())))
        result = {'id':cur.fetchone()[0],'token':token}
    elif action == 'exchange_agent_revoke':
        cur.execute('UPDATE nbki_exchange_agents SET active=false WHERE org_id=%s AND id=%s',(org,int(body['id'])))
        result = {'success':True}
    elif action == 'exchange_prepare':
        if __package__:
            from .nbki_event23_xml import build_event23_batch_xml
        else:
            from nbki_event23_xml import build_event23_batch_xml
        if __package__:
            from .nbki_reporting_policy import paired_ids
        else:
            from nbki_reporting_policy import paired_ids
        config = settings(cur,org);ensure_ready(config)
        ids = list(dict.fromkeys(int(i) for i in body.get('event_ids',[])))
        if not ids or len(ids)>100:
            raise ValueError('Выберите от 1 до 100 событий')
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',('nbki-exchange:'+str(org),))
        ids = paired_ids(cur,org,ids);reserved(cur,org,ids)
        result = build_event23_batch_xml(cur,org,ids)
        if result.get('excluded'):
            raise ValueError('Пакет содержит исключённые события: ' + '; '.join(str(r['reason']) for r in result['excluded'])[:1000])
        raw = decode(result['content_base64'])
        cur.execute('''INSERT INTO nbki_exchange_packages(org_id,file_name,reg_number,xml_payload,xml_sha256,event_ids,config,created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
            (org,result['file_name'],result['file_name'].rsplit('.',1)[0],raw,digest(raw),
             [r['event_id'] for r in result['events']],Json(config),actor))
        result = {'id':cur.fetchone()[0],'file_name':result['file_name']}
    elif action == 'exchange_download':
        columns = 'file_name,xml_payload' if body.get('xml') is True else 'encrypted_name,encrypted_payload'
        cur.execute('SELECT '+columns+' FROM nbki_exchange_packages WHERE id=%s AND org_id=%s',(int(body['id']),org))
        row = cur.fetchone()
        if not row or not row[1]:raise ValueError('Зашифрованный файл ещё не подготовлен')
        return {'file_name':row[0],'content_base64':base64.b64encode(bytes(row[1])).decode()}
    elif action == 'exchange_cancel':
        cur.execute("UPDATE nbki_exchange_packages SET status='cancelled',updated_at=now() WHERE id=%s AND org_id=%s AND status IN ('queued','failed','prepared') RETURNING id",(int(body['id']),org))
        if not cur.fetchone():raise ValueError('Пакет уже обрабатывается или мог быть отправлен; отмена недоступна')
        result = {'success':True}
    else:
        raise ValueError('Неизвестное действие обмена')
    cur.execute('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES (%s,%s,%s,%s,%s)',
                (actor,action,'nbki_exchange',org,json.dumps({'id':result.get('id')},ensure_ascii=False)))
    conn.commit()
    return result


def receipt_archive(raw):
    if len(raw)>2*1024*1024:raise ValueError('Квитанция превышает 2 МБ')
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        raise ValueError('Квитанция должна быть ZIP-архивом')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names = z.namelist()
        if len(names)!=2 or any('/' in n or '\\' in n for n in names):raise ValueError('Ожидаются только XML и его подпись')
        xmls = [n for n in names if n.endswith('.xml')]
        if len(xmls)!=1 or xmls[0]+'.sig' not in names:raise ValueError('В архиве нет XML и соответствующей подписи')
        if any(i.file_size>2*1024*1024 for i in z.infolist()):raise ValueError('Слишком большой XML квитанции')
        z.read(xmls[0]);z.read(xmls[0]+'.sig')  # validate CRC


def agent(cur, conn, token, method, body):
    if method!='POST' or not token:raise PermissionError('Требуется ключ Windows-компонента')
    cur.execute('SELECT id,org_id FROM nbki_exchange_agents WHERE active AND token_hash=%s',(digest(token.encode()),))
    row=cur.fetchone()
    if not row:raise PermissionError('Ключ Windows-компонента отозван или недействителен')
    aid,org=row
    action=body.get('action')
    cur.execute('UPDATE nbki_exchange_agents SET last_seen_at=now() WHERE id=%s',(aid,))
    if action=='heartbeat':
        diagnostic=body.get('diagnostic') or {}
        if len(json.dumps(diagnostic))>20000:raise ValueError('Слишком большой отчёт диагностики')
        cur.execute('UPDATE nbki_exchange_agents SET diagnostic=%s WHERE id=%s',(Json(diagnostic),aid))
        conn.commit()
        return {'success':True}
    if action=='poll':
        diagnostic=body.get('diagnostic') or {}
        if diagnostic.get('version')!='2.0':raise ValueError('Обновите Windows-компонент НБКИ до версии 2.0')
        if len(json.dumps(diagnostic))>20000:raise ValueError('Слишком большой отчёт диагностики')
        cur.execute('UPDATE nbki_exchange_agents SET diagnostic=%s WHERE id=%s',(Json(diagnostic),aid))
        cur.execute("UPDATE nbki_exchange_packages SET status='delivery_unknown',error='Связь прервалась во время отправки. Автоматический повтор запрещён.' WHERE org_id=%s AND status='sending' AND lease_until<now()",(org,))
        cur.execute("UPDATE nbki_exchange_packages SET status='queued',lease_token=NULL WHERE org_id=%s AND status='processing' AND lease_until<now()",(org,))
        cur.execute("""SELECT id FROM nbki_exchange_packages WHERE org_id=%s AND config->>'protocol_version'='2' AND (status='queued' OR (status='prepared' AND lease_until<now() AND config->>'transport'='nbki_https'))
            ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1""",(org,))
        nextrow=cur.fetchone();job=None
        if nextrow:
            lease=secrets.token_urlsafe(24)
            cur.execute("""UPDATE nbki_exchange_packages SET status=CASE WHEN encrypted_payload IS NULL THEN 'processing' ELSE 'prepared' END,agent_id=%s,lease_token=%s,
                lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=%s
                RETURNING id,file_name,xml_payload,xml_sha256,config,encrypted_payload,encrypted_name""",(aid,lease,nextrow[0]))
            pid,name,raw,sha,config,encrypted,encname=cur.fetchone()
            job=dict(id=pid,file_name=name,xml_base64=base64.b64encode(bytes(raw)).decode(),sha256=sha,config=config,lease=lease,
                     encrypted_base64=base64.b64encode(bytes(encrypted)).decode() if encrypted else None,encrypted_name=encname)
        cur.execute("SELECT id FROM nbki_exchange_packages WHERE org_id=%s AND status IN ('sent','delivery_unknown') AND (receipt_next_poll_at IS NULL OR receipt_next_poll_at<=now())", (org,))
        pending=[r[0] for r in cur.fetchall()]
        result={'job':job,'config':settings(cur,org),'receipt_package_ids':pending}
    elif action=='receipt_poll':
        config=settings(cur,org)
        if not config.get('auto_receive') or config.get('transport')!='nbki_https' or not config.get('receipt_signer'):
            raise ValueError('Автоматическое получение квитанций не настроено')
        cur.execute("""SELECT reg_number,config,receipt_stage FROM nbki_exchange_packages
            WHERE id=%s AND org_id=%s AND status IN ('sent','delivery_unknown')
            AND (receipt_next_poll_at IS NULL OR receipt_next_poll_at<=now()) FOR UPDATE""",(int(body['id']),org))
        row=cur.fetchone()
        if not row:result={'task':None}
        else:
            reg,frozen,stage=row
            suffix=frozen.get('package_suffix')
            if suffix not in ('.zip.enc','.zip.p7m'):raise ValueError('Неизвестное расширение исходного файла')
            delay=60 if stage==1 else 300
            cur.execute("UPDATE nbki_exchange_packages SET receipt_next_poll_at=now()+(%s * interval '1 second') WHERE id=%s",(delay,int(body['id'])))
            result={'task':{'id':int(body['id']),'stage':stage,'reg_number':reg,
                           'urls':receipt_urls(reg,stage,suffix)}}
    elif action=='receipt':
        result=accept_receipt(cur,conn,org,aid,body)
    else:
        cur.execute('SELECT status,lease_token,config,file_name,xml_payload FROM nbki_exchange_packages WHERE id=%s AND org_id=%s AND agent_id=%s FOR UPDATE',
                    (int(body['id']),org,aid))
        row=cur.fetchone()
        if not row or not secrets.compare_digest(row[1] or '',str(body.get('lease',''))):raise ValueError('Задание принадлежит другой сессии')
        status,lease,config,name,raw=row
        if action=='prepared' and status=='processing':
            encrypted=decode(body['content_base64']);evidence=body.get('evidence') or {}
            if evidence.get('xml_sha256')!=digest(bytes(raw)) or evidence.get('signer_thumbprint')!=config['signer_thumbprint'] or evidence.get('recipient_thumbprint')!=config['recipient']['thumbprint'] or evidence.get('signature_verified') is not True or evidence.get('signature_profile')!='CAdES-T' or evidence.get('timestamp_certificate_included') is not True:
                raise ValueError('Криптографический отчёт не соответствует заданию')
            encname=name.rsplit('.',1)[0]+config['package_suffix']
            cur.execute("UPDATE nbki_exchange_packages SET status='prepared',encrypted_payload=%s,encrypted_sha256=%s,encrypted_name=%s,evidence=%s,updated_at=now() WHERE id=%s",
                        (encrypted,digest(encrypted),encname,Json(evidence),int(body['id'])))
            result={'file_name':encname}
        elif action=='sending' and status=='prepared':
            if config.get('transport')!='nbki_https':raise ValueError('Протокол отправки не настроен')
            cur.execute("SELECT pg_advisory_xact_lock(hashtext('nbki-daily-upload-limit'))")
            cur.execute("SELECT count(*) FROM nbki_exchange_packages WHERE upload_started_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')")
            if cur.fetchone()[0]>=200:raise ValueError('Достигнут лимит НБКИ: 200 файлов в день')
            cur.execute("UPDATE nbki_exchange_packages SET status='sending',upload_started_at=now(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=%s",(int(body['id']),))
            result={'success':True}
        elif action=='sent' and status in ('sending','sent','completed'):
            if status=='sending':
                response=decode(body.get('response_base64',''),65536).decode('utf-8')
                if not upload_success(response,name.rsplit('.',1)[0]+config['package_suffix']):
                    raise ValueError('НБКИ не подтвердило загрузку именно этого файла')
                cur.execute("UPDATE nbki_exchange_packages SET evidence=evidence || %s::jsonb WHERE id=%s",(Json({'upload_response':response}),int(body['id'])))
                if __package__:
                    from .nbki_delivery import import_delivery_payloads
                else:
                    from nbki_delivery import import_delivery_payloads
                import_delivery_payloads(conn,[bytes(raw)],[],org)
                cur.execute("UPDATE nbki_exchange_packages SET status='sent',error=NULL,updated_at=now() WHERE id=%s",(int(body['id']),))
            result={'success':True}
        elif action=='failed' and status in ('processing','prepared','sending'):
            state='delivery_unknown' if status=='sending' else 'failed'
            if status=='sending' and body.get('response_base64'):
                response=decode(body['response_base64'],1024*1024)
                cur.execute("UPDATE nbki_exchange_packages SET evidence=evidence || %s::jsonb WHERE id=%s",
                            (Json({'upload_response_base64':base64.b64encode(response).decode(),
                                   'upload_response_sha256':digest(response)}),int(body['id'])))
            cur.execute('UPDATE nbki_exchange_packages SET status=%s,error=%s,updated_at=now() WHERE id=%s',
                        (state,str(body.get('error','Ошибка Windows-компонента'))[:1000],int(body['id'])))
            result={'success':True}
        else:raise ValueError('Недопустимый переход состояния пакета')
    conn.commit();return result


def accept_receipt(cur,conn,org,aid,body):
    if __package__:
        from .nbki_import import parse_receipt_zip
    else:
        from nbki_import import parse_receipt_zip
    if __package__:
        from .nbki_delivery import import_delivery_payloads
    else:
        from nbki_delivery import import_delivery_payloads
    raw=decode(body['content_base64'],2*1024*1024);receipt_archive(raw)
    encrypted=decode(body['encrypted_base64']);evidence=body.get('evidence') or {}
    config=settings(cur,org)
    trusted=config.get('receipt_signer',{}).get('thumbprint')
    if not trusted or evidence.get('signer_thumbprint')!=trusted or evidence.get('signature_verified') is not True or evidence.get('archive_sha256')!=digest(raw):
        raise ValueError('Нет подтверждения проверки подписи настроенным сертификатом НБКИ')
    receipt=parse_receipt_zip(raw)
    cur.execute('SELECT id,xml_payload,status,receipt_stage FROM nbki_exchange_packages WHERE org_id=%s AND reg_number=%s FOR UPDATE',(org,receipt['reg_number']))
    job=cur.fetchone()
    if not job or job[2] not in ('sending','delivery_unknown','sent','completed'):raise ValueError('Квитанция не соответствует отправленному пакету CRM')
    evidence = dict(evidence, receipt_kind=receipt['kind'], receipt_status=receipt['status'])
    sha=digest(raw)
    cur.execute('SELECT id FROM nbki_exchange_receipts WHERE package_id=%s AND sha256=%s',(job[0],sha))
    if cur.fetchone():return {'success':True,'duplicate':True}
    if receipt['kind']==2 and job[3]!=2:
        raise ValueError('Сначала требуется положительный проверенный ticket1')
    if receipt['kind']==1 and job[3]!=1:
        raise ValueError('ticket1 уже обработан')
    result=import_delivery_payloads(conn,[bytes(job[1])],[raw],org)
    cur.execute('INSERT INTO nbki_exchange_receipts(org_id,package_id,sha256,payload,encrypted_payload,agent_id,evidence) VALUES (%s,%s,%s,%s,%s,%s,%s)',
                (org,job[0],sha,raw,encrypted,aid,Json(evidence)))
    complete = receipt['kind']==2 or receipt['status']=='rejected'
    cur.execute("UPDATE nbki_exchange_packages SET status=%s,receipt_stage=%s,receipt_next_poll_at=NULL,error=NULL,updated_at=now() WHERE id=%s",
                ('completed' if complete else 'sent',3 if complete else 2,job[0]))
    cur.execute('SELECT receipt_status,receipt_time,events_accepted,events_rejected FROM nbki_source_files WHERE org_id=%s AND reg_number=%s', (org,receipt['reg_number']))
    applied = cur.fetchone()
    if applied == (receipt['status'], receipt.get('receipt_time'), receipt.get('accepted'), receipt.get('rejected')):
        cur.execute('UPDATE nbki_source_files SET receipt_signature_verified=true WHERE org_id=%s AND reg_number=%s', (org,receipt['reg_number']))
    return {'success':True,**result}


def receipt_urls(reg, stage, suffix):
    if not re.fullmatch(r'[A-Za-z0-9_]+',reg) or stage not in (1,2) or suffix not in ('.zip.enc','.zip.p7m'):
        raise ValueError('Некорректные реквизиты квитанции')
    base=RECEIPTS_URL+reg+'_ticket'+str(stage)
    urls=[{'url':base+suffix,'encrypted':True}]
    if stage==1:urls.append({'url':base+'.zip','encrypted':False})
    return urls


def upload_success(response, filename):
    return re.fullmatch(r'Success\s+The following files were successfully uploaded\s*:\s*'+re.escape(filename)+r'\s*', response.strip()) is not None
