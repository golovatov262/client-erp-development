"""OKB exchange coordinator. CFB credentials and GOST private keys stay on Windows."""
import base64,json,re,secrets,hashlib
from pathlib import Path
from datetime import date,datetime,timedelta,timezone
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from psycopg2.extras import Json,RealDictCursor
if __package__:
    from .nbki_exchange import decode,digest,certificate,thumbprint
    from .nbki_import import parse_receipt_zip
    from .nbki_delivery import receipt_outcomes
    from .okb_delivery import delivery_state,check_delivery
    from .okb_xml import build
else:
    from nbki_exchange import decode,digest,certificate,thumbprint
    from nbki_import import parse_receipt_zip
    from nbki_delivery import receipt_outcomes
    from okb_delivery import delivery_state,check_delivery
    from okb_xml import build

BASE_URL='https://cfb.bki-okb.com/cfb'
ACTIVE=('queued','processing','sending','sent','delivery_unknown')


def serial(value):return json.loads(json.dumps(value,default=str,ensure_ascii=False))

def settings(cur,org):
    cur.execute('SELECT config FROM okb_settings WHERE org_id=%s',(org,));row=cur.fetchone()
    config=dict(row[0] if row else {})
    config.update(base_url=BASE_URL,environment='production',signature_profile='CAdES-T',package_suffix='.zip.pem.pem')
    for key,name in [('recipient','recipient-2026.cer'),('receipt_signer','signer-2026.cer')]:
        if not config.get(key):config[key]=certificate(base64.b64encode((Path(__file__).parent/'okb_certificates'/name).read_bytes()).decode())
    return config


def validate_settings(body,old):
    config=dict(old)
    for key in ('sin','group','username','tsp_url'):
        if key in body:
            value=str(body[key]).strip()
            if len(value)>500 or any(ord(c)<32 for c in value):raise ValueError('Недопустимое значение настройки')
            config[key]=value
    if config.get('sin') and not re.fullmatch(r'\d{5}',config['sin']):raise ValueError('SIN: 5 цифр, включая ведущие нули')
    for key in ('signer_thumbprint','tls_thumbprint'):
        if key in body:config[key]=thumbprint(body[key])
    for key in ('enabled','auto_receive','certificate_registered'):
        if key in body:
            if not isinstance(body[key],bool):raise ValueError('Некорректный переключатель')
            config[key]=body[key]
    for key in ('recipient','receipt_signer'):
        if body.get(key+'_certificate'):config[key]=certificate(body[key+'_certificate'])
    tsp=config.get('tsp_url','')
    if tsp:
        url=urlsplit(tsp)
        if url.scheme not in ('http','https') or not url.hostname or url.username or url.password or url.fragment:raise ValueError('Некорректный адрес TSP')
    if config.get('enabled'):ensure_ready(config)
    return config


def ensure_ready(config):
    if not re.fullmatch(r'\d{5}',config.get('sin','')):raise ValueError('Заполните код подписчика ОКБ SIN')
    for key in ('group','username','signer_thumbprint','tsp_url','recipient','receipt_signer'):
        if not config.get(key):raise ValueError('Не заполнена настройка ОКБ: '+key)
    if not config.get('certificate_registered'):raise ValueError('Подтвердите регистрацию сертификата организации в ОКБ')


def queue(cur,org,start,end):
    start=date.fromisoformat(start);end=date.fromisoformat(end)
    if start>end:raise ValueError('Начало периода позже окончания')
    cur.execute('''SELECT e.id,l.contract_no,e.event_name,e.event_kind,e.event_occurred_at
        FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
        WHERE e.org_id=%s AND l.bki_enabled IS TRUE AND e.status!='excluded'
        AND ((e.event_occurred_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN %s AND %s OR e.event_occurred_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM okb_package_events pe JOIN okb_packages p ON p.id=pe.package_id
          WHERE pe.event_id=e.id AND p.org_id=e.org_id AND p.status NOT IN ('cancelled','failed')
          AND (pe.status='accepted' OR p.status=ANY(%s)))
        ORDER BY e.event_occurred_at,e.id LIMIT 101''',(org,start,end,list(ACTIVE)))
    rows=cur.fetchall();result=[]
    if __package__:from .nbki_event23_xml import build_event23_xml
    else:from nbki_event23_xml import build_event23_xml
    for eid,contract,name,kind,at in rows[:100]:
        error=None
        try:build_event23_xml(cur,org,eid,bureau='okb')
        except ValueError as exc:error=str(exc)
        result.append(dict(id=eid,contract_no=contract,event_name=name,event_kind=kind,event_at=at,ready=not error,error=error,delivery=delivery_state(cur,org,eid)))
    return serial({'rows':result,'has_more':len(rows)>100,'from':start,'to':end})


def admin(cur,conn,org,method,body,actor):
    action=body.get('action','status')
    if method=='GET':
        if action=='events':return queue(cur,org,body['from'],body['to'])
        if action!='status':raise ValueError('Неизвестное действие ОКБ')
        config=settings(cur,org)
        with conn.cursor(cursor_factory=RealDictCursor) as q:
            q.execute('''SELECT p.id,p.file_name,p.status,p.error,p.created_at,p.receipt_stage,
                (SELECT count(*) FROM okb_package_events WHERE package_id=p.id) AS events_count,
                (SELECT count(*) FROM okb_package_events WHERE package_id=p.id AND status='accepted') AS accepted,
                (SELECT count(*) FROM okb_package_events WHERE package_id=p.id AND status='rejected') AS rejected,
                (SELECT jsonb_agg(result ORDER BY id) FROM okb_receipts WHERE package_id=p.id) AS receipts
                FROM okb_packages p WHERE org_id=%s ORDER BY p.id DESC LIMIT 50''',(org,));packages=q.fetchall()
            q.execute('SELECT id,active,last_seen_at,diagnostic FROM okb_agents WHERE org_id=%s ORDER BY id DESC',(org,));agents=q.fetchall()
        return serial(dict(config=config,packages=packages,agents=agents))
    if method!='POST':raise ValueError('Неверный метод')
    if action=='settings':
        old=settings(cur,org);config=validate_settings(body,old)
        if any(old.get(k) and old.get(k)!=config.get(k) for k in ('sin','group','username')):
            cur.execute("SELECT 1 FROM okb_packages WHERE org_id=%s AND status=ANY(%s) LIMIT 1",(org,list(ACTIVE)))
            if cur.fetchone():raise ValueError('Сначала завершите пакеты: реквизиты CFB закреплены за отправкой')
            cur.execute('SELECT 1 FROM okb_receipts WHERE org_id=%s AND NOT acknowledged LIMIT 1',(org,))
            if cur.fetchone():raise ValueError('Сначала подтвердите скачивание сохранённых извещений')
        cur.execute('INSERT INTO okb_settings(org_id,config) VALUES(%s,%s) ON CONFLICT(org_id) DO UPDATE SET config=EXCLUDED.config,updated_at=now()',(org,Json(config)))
        result={'config':config}
    elif action=='agent_create':
        token=secrets.token_urlsafe(40)
        cur.execute('INSERT INTO okb_agents(org_id,token_hash) VALUES(%s,%s) RETURNING id',(org,digest(token.encode())))
        result={'id':cur.fetchone()[0],'token':token}
    elif action=='agent_revoke':
        cur.execute('UPDATE okb_agents SET active=false WHERE id=%s AND org_id=%s',(int(body['id']),org));result={'success':True}
    elif action=='prepare':
        config=settings(cur,org);ensure_ready(config)
        if not config.get('enabled'):raise ValueError('Включите обмен ОКБ в настройках')
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))",('okb-exchange:'+str(org),))
        ids=list(dict.fromkeys(int(i) for i in body['event_ids']))
        if not ids or len(ids)>100 or min(ids)<=0:raise ValueError('Выберите от 1 до 100 событий')
        cur.execute('''SELECT l.id FROM loans l WHERE l.org_id=%s AND l.id IN
            (SELECT loan_id FROM nbki_crm_events WHERE org_id=%s AND id=ANY(%s)) ORDER BY l.id FOR UPDATE''',(org,org,ids))
        cur.fetchall()
        result=build(cur,org,ids,config['sin'])
        cur.execute('INSERT INTO okb_packages(org_id,file_name,xml_payload,xml_sha256,config) VALUES(%s,%s,%s,%s,%s) RETURNING id',
                    (org,result['file_name'],result['raw'],result['sha256'],Json(config)))
        pid=cur.fetchone()[0]
        for item in result['events']:
            cur.execute('INSERT INTO okb_package_events(package_id,event_id,order_num) VALUES(%s,%s,%s)',(pid,item['event_id'],item['order_num']))
        result={'id':pid,'file_name':result['file_name']}
    elif action=='cancel':
        cur.execute("UPDATE okb_packages SET status='cancelled',updated_at=now() WHERE id=%s AND org_id=%s AND status IN ('queued','failed') RETURNING id",(int(body['id']),org))
        if not cur.fetchone():raise ValueError('Отмена недоступна: файл мог быть отправлен')
        result={'success':True}
    elif action=='download':
        cur.execute('SELECT file_name,xml_payload,encrypted_payload FROM okb_packages WHERE id=%s AND org_id=%s',(int(body['id']),org));row=cur.fetchone()
        if not row:raise ValueError('Пакет не найден')
        name,xml,encrypted=row;raw=xml if body.get('xml') else encrypted
        if not raw:raise ValueError('Защищённый файл ещё не подготовлен')
        return {'file_name':name if body.get('xml') else name[:-4]+'.zip.pem.pem','content_base64':base64.b64encode(bytes(raw)).decode()}
    else:raise ValueError('Неизвестное действие ОКБ')
    cur.execute('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES(%s,%s,%s,%s,%s)',(actor,'okb_'+action,'okb',org,json.dumps({'id':result.get('id')})))
    conn.commit();return result


def agent(cur,conn,token,method,body):
    if method!='POST' or not token:raise PermissionError('Требуется ключ компонента ОКБ')
    cur.execute('SELECT id,org_id FROM okb_agents WHERE active AND token_hash=%s',(digest(token.encode()),));row=cur.fetchone()
    if not row:raise PermissionError('Недействительный ключ компонента ОКБ')
    aid,org=row;action=body.get('action')
    cur.execute('UPDATE okb_agents SET last_seen_at=now() WHERE id=%s',(aid,))
    if action in ('heartbeat','poll'):
        diagnostic=body.get('diagnostic') or {}
        if len(json.dumps(diagnostic))>20000:raise ValueError('Слишком большой отчёт')
        cur.execute('UPDATE okb_agents SET diagnostic=%s WHERE id=%s',(Json(diagnostic),aid))
        config=settings(cur,org);result={'config':config,'job':None,'pending':[],'acks':[]}
        if action=='poll':
            if diagnostic.get('version')!='1.0':raise ValueError('Обновите компонент ОКБ')
            cur.execute("UPDATE okb_packages SET status='delivery_unknown',error='Связь прервалась при отправке. Сверьте получение в ОКБ.' WHERE org_id=%s AND status='sending' AND lease_until<now()",(org,))
            if config.get('enabled'):
                cur.execute("""SELECT id FROM okb_packages WHERE org_id=%s AND (status='queued' OR (status='processing' AND lease_until<now())) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1""",(org,));job=cur.fetchone()
                if job:
                    lease=secrets.token_hex(24)
                    cur.execute("UPDATE okb_packages SET status='processing',agent_id=%s,lease_token=%s,lease_until=now()+interval '15 minutes' WHERE id=%s RETURNING file_name,xml_payload,xml_sha256,config",(aid,lease,job[0]))
                    name,raw,sha,frozen=cur.fetchone();result['job']=dict(id=job[0],file_name=name,xml_base64=base64.b64encode(bytes(raw)).decode(),sha256=sha,lease=lease,config=frozen)
            if config.get('auto_receive'):
                cur.execute("""UPDATE okb_packages SET next_poll_at=now()+interval '5 minutes' WHERE org_id=%s
                    AND status IN ('sent','delivery_unknown') AND (next_poll_at IS NULL OR next_poll_at<=now())
                    RETURNING id,file_name,config""",(org,))
                result['pending']=[dict(id=p,file_name=n,config=c) for p,n,c in cur.fetchall()]
                cur.execute('SELECT id,provider_name FROM okb_receipts WHERE org_id=%s AND NOT acknowledged',(org,));result['acks']=[dict(id=i,file_name=n) for i,n in cur.fetchall()]
    elif action=='receipt':
        result=accept_receipt(cur,org,body)
    elif action=='ack':
        cur.execute('UPDATE okb_receipts SET acknowledged=true WHERE id=%s AND org_id=%s',(int(body['id']),org));result={'success':True}
    else:
        cur.execute('SELECT status,lease_token,file_name,xml_sha256,config FROM okb_packages WHERE id=%s AND org_id=%s AND agent_id=%s FOR UPDATE',(int(body['id']),org,aid));row=cur.fetchone()
        if not row or not secrets.compare_digest(row[1] or '',str(body.get('lease',''))):raise ValueError('Задание принадлежит другой сессии')
        status,lease,name,sha,config=row
        if action=='sending' and status=='processing':
            raw=decode(body['content_base64']);evidence=body.get('evidence') or {}
            if not (evidence.get('xml_sha256')==sha and evidence.get('signer_thumbprint')==config['signer_thumbprint'] and evidence.get('recipient_thumbprint')==config['recipient']['thumbprint'] and evidence.get('signature_verified') is True and evidence.get('signature_profile')=='CAdES-T' and evidence.get('attached') is True):raise ValueError('Криптографический отчёт не соответствует пакету')
            cur.execute("UPDATE okb_packages SET status='sending',encrypted_payload=%s,evidence=%s,lease_until=now()+interval '5 minutes' WHERE id=%s",(raw,Json(evidence),body['id']))
            result={'success':True}
        elif action=='sent' and status=='sending':
            response=body.get('response') or {}
            cur.execute('SELECT octet_length(encrypted_payload) FROM okb_packages WHERE id=%s',(body['id'],));size=cur.fetchone()[0]
            if response.get('name')!=name[:-4]+'.zip.pem.pem' or not isinstance(response.get('id'),int) or response.get('size')!=size:raise ValueError('CFB не подтвердил имя и размер файла')
            cur.execute("UPDATE okb_packages SET status='sent',evidence=evidence || %s::jsonb,updated_at=now() WHERE id=%s",(Json({'upload_response':response}),body['id']));result={'success':True}
        elif action=='failed' and status in ('processing','sending'):
            evidence={}
            if body.get('response_base64'):evidence['upload_response_base64']=base64.b64encode(decode(body['response_base64'],1024*1024)).decode()
            cur.execute('UPDATE okb_packages SET status=%s,error=%s,evidence=evidence || %s::jsonb,updated_at=now() WHERE id=%s',('delivery_unknown' if status=='sending' else 'failed',str(body.get('error','Ошибка компонента'))[:1000],Json(evidence),body['id']));result={'success':True}
        else:raise ValueError('Недопустимый переход состояния ОКБ')
    conn.commit();return serial(result)


def accept_receipt(cur,org,body):
    raw=decode(body['xml_base64'],2*1024*1024)
    if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:raise ValueError('DTD в извещении запрещён')
    cur.execute('SELECT file_name,config,status,receipt_stage,xml_payload FROM okb_packages WHERE id=%s AND org_id=%s FOR UPDATE',(int(body['id']),org));job=cur.fetchone()
    if not job:raise ValueError('Пакет ОКБ не найден')
    name,config,status,stage,source=job;evidence=body.get('evidence') or {};provider=str(body.get('file_name',''))
    if (evidence.get('signature_verified') is not True or evidence.get('signer_thumbprint')!=config['receipt_signer']['thumbprint'] or evidence.get('xml_sha256')!=digest(raw)):
        raise ValueError('Подпись извещения ОКБ не подтверждена')
    receipt=parse_receipt_zip(raw,source_id=config['sin'])
    receipt['warnings']=[{c.tag:c.text for c in node} for node in ET.fromstring(raw).findall('./Warnings/*')]
    if receipt['reg_number']!=name[:-4]:raise ValueError('Извещение относится к другому файлу')
    if len(provider)>250 or not re.fullmatch(r'[A-Za-z0-9_.-]+',provider) or name[:-4] not in provider:raise ValueError('Неверное имя извещения')
    cur.execute('SELECT id,sha256 FROM okb_receipts WHERE org_id=%s AND provider_name=%s',(org,provider));previous=cur.fetchone()
    if previous:
        if previous[1]!=digest(raw):raise ValueError('Содержимое сохранённого извещения изменилось')
        return {'id':previous[0],'success':True}
    if status not in ('sent','delivery_unknown'):raise ValueError('Пакет не ожидает извещения')
    if receipt['kind']==2 and stage!=2:raise ValueError('Сначала требуется положительное извещение №1')
    if receipt['kind']==1 and stage!=1:raise ValueError('Первое извещение уже получено')
    cur.execute('SELECT event_id,order_num FROM okb_package_events WHERE package_id=%s ORDER BY order_num',(body['id'],));links=cur.fetchall()
    root=ET.fromstring(bytes(source));events=[]
    for node in root.findall('.//Events/*'):
        events.append(dict(order_num=int(node.get('orderNum')),event_name=node.tag,event_time=datetime.fromisoformat(node.get('eventDateTime')),uid=node.findtext('.//uid')))
    outcomes=receipt_outcomes(events,receipt)
    for eid,order in links:cur.execute('UPDATE okb_package_events SET status=%s WHERE package_id=%s AND event_id=%s',(outcomes[order],body['id'],eid))
    cur.execute('INSERT INTO okb_receipts(org_id,package_id,provider_name,sha256,xml_payload,encrypted_payload,result,evidence) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                (org,body['id'],provider,digest(raw),raw,decode(body['encrypted_base64']),Json(serial(receipt)),Json(evidence)))
    rid=cur.fetchone()[0];complete=receipt['kind']==2 or receipt['status']=='rejected'
    cur.execute('UPDATE okb_packages SET status=%s,receipt_stage=%s,next_poll_at=NULL,error=NULL,updated_at=now() WHERE id=%s',('completed' if complete else 'sent',3 if complete else 2,body['id']))
    return {'success':True,'id':rid,'result':serial(receipt)}
