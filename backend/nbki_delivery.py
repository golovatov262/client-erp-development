"""Per-event delivery results; all receipt writes share the import transaction."""
import gzip
import hashlib
import xml.etree.ElementTree as ET


def receipt_outcomes(events, receipt):
    """Never infer successful events from an ambiguous partial receipt."""
    if not receipt or receipt['kind'] != 2:
        status = 'rejected' if receipt and receipt['status'] == 'rejected' else 'pending'
        return {e['order_num']: status for e in events}
    if (receipt['events_received'] != len(events) or
            receipt['accepted'] + receipt['rejected'] != len(events)):
        raise ValueError('Счётчики квитанции не совпадают с событиями XML')
    by_order = {e['order_num']: e for e in events}
    failed = set()
    for error in receipt['errors']:
        order = error.get('order_num')
        if order not in by_order:
            raise ValueError('Ошибка квитанции не сопоставлена с номером события XML')
        event = by_order[order]
        for key, event_key in [('uid','uid'), ('event_name','event_name'), ('event_date_time','event_time')]:
            if error.get(key) is not None and error[key] != event.get(event_key):
                raise ValueError('Реквизиты ошибки квитанции не совпадают с событием XML')
        failed.add(order)
    if receipt['accepted'] == 0:
        return {order: 'rejected' for order in by_order}
    if len(failed) != receipt['rejected']:
        raise ValueError('Нельзя однозначно определить отклонённые события по квитанции')
    return {order: 'rejected' if order in failed else 'accepted' for order in by_order}


def sync_file_delivery(cur, file_id):
    cur.execute('''SELECT org_id,receipt_status,events_count,events_accepted,events_rejected,
        archived_at FROM nbki_source_files WHERE id=%s''', (file_id,))
    org, status, count, accepted, rejected, archived = cur.fetchone()
    if archived is not None:
        return
    cur.execute('''SELECT f.order_num,COALESCE(f.source_uid,d.uid),f.event_name,f.event_time,COALESCE(f.source_contract_no,d.contract_no)
        FROM nbki_file_events f LEFT JOIN nbki_deals d ON d.id=f.deal_id
        WHERE f.source_file_id=%s ORDER BY f.order_num''', (file_id,))
    events = [dict(zip(('order_num','uid','event_name','event_time','contract_no'), r)) for r in cur.fetchall()]
    cur.execute('''SELECT order_num,uid,event_name,event_date_time,error_message,field_name
        FROM nbki_receipt_errors WHERE source_file_id=%s AND receipt_kind=2''', (file_id,))
    errors = [dict(zip(('order_num','uid','event_name','event_date_time','error_message','field_name'), r)) for r in cur.fetchall()]
    receipt = {'kind': 2 if accepted is not None and rejected is not None else 1,
               'status': status, 'events_received': count,
               'accepted': accepted, 'rejected': rejected, 'errors': errors}
    outcomes = receipt_outcomes(events, receipt)
    linked = set()
    for event in events:
        ids = []
        if event['event_name'] == 'FL_Event_2_3' and event['contract_no'] and event['uid']:
            cur.execute('''SELECT e.id FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
                WHERE e.org_id=%s AND l.contract_no=%s AND e.source_type='loan_payment'
                AND e.event_occurred_at=%s AND %s IN (
                    SELECT uid FROM nbki_deals WHERE org_id=e.org_id AND loan_id=e.loan_id AND deal_role='borrower'
                    UNION SELECT uid FROM nbki_event_deals WHERE org_id=e.org_id AND loan_id=e.loan_id AND role='borrower'
                    UNION SELECT loan_uid FROM loan_bki_fields WHERE org_id=e.org_id AND loan_id=e.loan_id)''',
                (org, event['contract_no'], event['event_time'], event['uid']))
            ids = [r[0] for r in cur.fetchall()]
        event_id = ids[0] if len(ids) == 1 else None
        cur.execute('''UPDATE nbki_file_events SET crm_event_id=%s,delivery_status=%s,
            reported_accepted=%s WHERE source_file_id=%s AND order_num=%s''',
            (event_id, outcomes[event['order_num']], outcomes[event['order_num']]=='accepted',
             file_id,event['order_num']))
        if event_id:
            linked.add(event_id)
    for event_id in linked:
        state = delivery_state(cur, org, event_id)
        cur.execute('UPDATE nbki_crm_events SET status=%s WHERE id=%s AND org_id=%s',
                    (state['status'],event_id,org))


def delivery_state(cur, org_id, event_id):
    cur.execute('''SELECT fe.delivery_status,f.reg_number,f.id,fe.order_num
        FROM nbki_file_events fe JOIN nbki_source_files f ON f.id=fe.source_file_id
        WHERE fe.crm_event_id=%s AND f.org_id=%s AND f.archived_at IS NULL
        ORDER BY (fe.delivery_status='accepted') DESC,f.document_time DESC,f.id DESC LIMIT 1''',
        (event_id,org_id))
    row = cur.fetchone()
    if not row:
        return {'status':'new','file':None,'errors':[]}
    status,reg,file_id,order = row
    cur.execute('''SELECT error_code,error_message,block_name,field_name,field_value
        FROM nbki_receipt_errors WHERE source_file_id=%s
        AND (order_num=%s OR order_num IS NULL)
        AND receipt_kind=CASE WHEN (SELECT events_accepted FROM nbki_source_files WHERE id=source_file_id)
            IS NULL THEN 1 ELSE 2 END ORDER BY id''', (file_id,order))
    errors = [dict(zip(('code','message','block','field','value'),r)) for r in cur.fetchall()]
    return {'status': 'exported' if status=='pending' else status,
            'file':reg,'file_id':file_id,'order_num':order,'errors':errors}


def _shape(node):
    return (node.tag, sorted((k,v) for k,v in node.attrib.items() if k!='orderNum'),
            (node.text or '').strip(), [_shape(c) for c in node])


def check_delivery(cur, org_id, event_id, raw=None):
    state = delivery_state(cur,org_id,event_id)
    if state['status']=='accepted':
        raise ValueError('Событие уже принято НБКИ; повторная выгрузка исключена')
    if state['status']=='exported':
        raise ValueError('XML зарегистрирован как отправленный; ожидается итоговая квитанция ticket2')
    if state['status']=='rejected' and raw is not None:
        cur.execute('SELECT xml_gzip FROM nbki_source_files WHERE id=%s AND org_id=%s',
                    (state['file_id'],org_id))
        previous = ET.fromstring(gzip.decompress(bytes(cur.fetchone()[0])))
        old = previous.find(f'.//FL_Event_2_3[@orderNum="{state["order_num"]}"]')
        new = ET.fromstring(raw).find('.//FL_Event_2_3')
        if old is not None and new is not None:
            old_subject = next((s for s in previous.findall('.//Subject_FL') if old in list(s.findall('./Events/*'))),None)
            new_subject = ET.fromstring(raw).find('.//Subject_FL')
            if (_shape(old)==_shape(new) and old_subject is not None
                    and _shape(old_subject.find('Title'))==_shape(new_subject.find('Title'))):
                raise ValueError('НБКИ отклонил событие: данные XML не изменились; сначала исправьте ошибки квитанции')
    return state


def import_delivery_payloads(conn, xml_payloads, receipt_payloads, org_id):
    """Register sent files and apply receipts without mutating historical loan facts."""
    if __package__:
        from .nbki_import import parse_source_xml, parse_receipt_zip, resolve_source_org_id
    else:
        from nbki_import import parse_source_xml, parse_receipt_zip, resolve_source_org_id
    sources = {}
    for raw in xml_payloads:
        source = parse_source_xml(raw)
        previous = sources.get(source['reg_number'])
        if previous and previous['xml_sha256'] != source['xml_sha256']:
            raise ValueError('Один номер файла относится к разным XML')
        sources[source['reg_number']] = source
    receipts = [(raw,parse_receipt_zip(raw)) for raw in receipt_payloads]
    with conn.cursor() as cur:
        if resolve_source_org_id(cur) != org_id:
            raise ValueError('Источник файла не соответствует организации пользователя')
        for _, receipt in receipts:
            reg = receipt['reg_number']
            if reg not in sources:
                cur.execute('SELECT xml_gzip FROM nbki_source_files WHERE org_id=%s AND reg_number=%s', (org_id,reg))
                row = cur.fetchone()
                if not row:
                    raise ValueError('Сначала загрузите отправленный XML для этой квитанции')
                sources[reg] = parse_source_xml(gzip.decompress(bytes(row[0])))
        file_ids = []
        for reg, source in sources.items():
            cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ('nbki-import:'+reg,))
            cur.execute('SELECT id,xml_sha256 FROM nbki_source_files WHERE reg_number=%s FOR UPDATE', (reg,))
            previous = cur.fetchone()
            if previous and previous[1].strip()!=source['xml_sha256']:
                raise ValueError('Регистрационный номер уже используется для другого XML')
            cur.execute('''INSERT INTO nbki_source_files
                (org_id,source_id,reg_number,schema_version,document_time,xml_sha256,xml_gzip,subjects_count,events_count)
                VALUES (%s,'QY01GG000001',%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(reg_number) DO UPDATE SET archived_at=NULL RETURNING id''',
                (org_id,reg,source['schema_version'],source['document_time'],source['xml_sha256'],
                 source['xml_gzip'],source['subjects_count'],source['events_count']))
            file_id=cur.fetchone()[0];file_ids.append(file_id)
            for event in source['events']:
                deal=source['deals'].get(event['uid'])
                cur.execute('''INSERT INTO nbki_file_events
                    (source_file_id,order_num,event_name,event_time,operation_code,source_uid,source_contract_no)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT(source_file_id,order_num) DO UPDATE SET
                    source_uid=EXCLUDED.source_uid,source_contract_no=EXCLUDED.source_contract_no''',
                    (file_id,event['order_num'],event['event_name'],event['event_time'],event['operation_code'],
                     event['uid'],deal.contract_no if deal else None))
            incoming = sorted([(raw,r) for raw,r in receipts if r['reg_number']==reg],
                              key=lambda item:(item[1]['kind'],str(item[1].get('receipt_time') or '')))
            for raw, receipt in incoming:
                # Validate against the actual saved XML before touching statuses.
                receipt_outcomes(source['events'],receipt)
                cur.execute('''INSERT INTO nbki_receipt_uploads(source_file_id,sha256,receipt_kind,payload)
                    VALUES (%s,%s,%s,%s) ON CONFLICT(source_file_id,sha256) DO NOTHING''',
                    (file_id,hashlib.sha256(raw).hexdigest(),receipt['kind'],raw))
                cur.execute('SELECT events_accepted,receipt_time,receipt_status FROM nbki_source_files WHERE id=%s', (file_id,))
                old_accepted, old_time, old_status=cur.fetchone()
                if old_accepted is not None and (receipt['kind']==1 or old_status=='accepted'
                    or (old_time and receipt.get('receipt_time') and old_time>receipt['receipt_time'])):
                    continue
                cur.execute('''UPDATE nbki_source_files SET receipt_status=%s,events_accepted=%s,
                    events_rejected=%s,receipt_time=%s WHERE id=%s''',
                    (receipt['status'],receipt.get('accepted'),receipt.get('rejected'),receipt.get('receipt_time'),file_id))
                cur.execute('DELETE FROM nbki_receipt_errors WHERE source_file_id=%s AND receipt_kind=%s', (file_id,receipt['kind']))
                for error in receipt['errors']:
                    cur.execute('''INSERT INTO nbki_receipt_errors
                        (source_file_id,receipt_kind,error_num,event_date_time,error_code,error_message,uid,
                         order_num,subject_code,subject_id,event_name,block_name,field_name,field_value)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                        (file_id,receipt['kind'],*[error.get(k) for k in ('error_num','event_date_time','error_code',
                            'error_message','uid','order_num','subject_code','subject_id','event_name','block_name','field_name','field_value')]))
            sync_file_delivery(cur,file_id)
        cur.execute('''SELECT delivery_status,count(*) FROM nbki_file_events
            WHERE source_file_id=ANY(%s) GROUP BY delivery_status''', (file_ids,))
        counts=dict(cur.fetchall())
        cur.execute('SELECT count(*) FROM nbki_file_events WHERE source_file_id=ANY(%s) AND crm_event_id IS NULL', (file_ids,))
        unmatched=cur.fetchone()[0]
    return {'files':len(sources),'event_results':counts,'unmatched_events':unmatched}
