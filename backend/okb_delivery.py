"""OKB-only delivery gate; never reads or modifies NBKI acceptance."""
import xml.etree.ElementTree as ET
if __package__:
    from .nbki_delivery import _shape
else:
    from nbki_delivery import _shape


def delivery_state(cur, org, event_id):
    cur.execute('''SELECT e.status,p.status,p.id,e.order_num,
        (SELECT max((r.result->>'kind')::int) FROM okb_receipts r WHERE r.package_id=p.id) FROM okb_package_events e
        JOIN okb_packages p ON p.id=e.package_id WHERE p.org_id=%s AND e.event_id=%s
        AND p.status NOT IN ('cancelled','failed')
        ORDER BY (e.status='accepted') DESC,p.id DESC LIMIT 1''',(org,event_id))
    row=cur.fetchone()
    if not row:return {'status':'new'}
    state,package,pid,order,kind=row
    if state=='pending':state='exported'
    return {'status':state,'package_id':pid,'order_num':order,'receipt_kind':kind}


def check_delivery(cur,org,event_id,raw=None):
    state=delivery_state(cur,org,event_id)
    if state['status']=='accepted':raise ValueError('Событие уже принято ОКБ')
    if state['status']=='exported':raise ValueError('Событие уже включено в пакет ОКБ; дождитесь результата')
    if state['status']=='rejected' and state.get('receipt_kind',2)==2 and raw:
        cur.execute('SELECT xml_payload FROM okb_packages WHERE id=%s AND org_id=%s',(state['package_id'],org))
        oldroot=ET.fromstring(bytes(cur.fetchone()[0]));newroot=ET.fromstring(raw)
        for subject in oldroot.findall('./Data/Subject_FL'):
            old=next((n for n in subject.findall('./Events/*') if n.get('orderNum')==str(state['order_num'])),None)
            if old is not None:
                new=newroot.find('.//Events/*');title=newroot.find('.//Subject_FL/Title')
                if _shape(old)==_shape(new) and _shape(subject.find('Title'))==_shape(title):
                    raise ValueError('ОКБ отклонило событие: сначала исправьте данные по извещению')
    return state
