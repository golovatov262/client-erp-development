"""CB 5.1 payload with the OKB EFK naming/source profile."""
import base64,hashlib,re
from datetime import datetime
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET
if __package__:
    from .nbki_event23_xml import build_event23_batch_xml, _validate_xsd
    from .nbki_xml_builder import format_document_bytes
else:
    from nbki_event23_xml import build_event23_batch_xml, _validate_xsd
    from nbki_xml_builder import format_document_bytes


def profile_xml(raw,sin,created=None):
    if not re.fullmatch(r'\d{5}',str(sin)):raise ValueError('Код ОКБ SIN должен содержать 5 цифр')
    created=created or datetime.now(ZoneInfo('Europe/Moscow'))
    stamp=created.strftime('%Y%m%d%H%M%S')+f'{created.microsecond//1000:03}'
    name=f'CHP_{sin}_EFK_05-10_{stamp}'
    root=ET.fromstring(raw);root.set('sourceID',sin);root.set('regNumberDoc',name)
    root.set('dateTimeDoc',created.isoformat(timespec='seconds'))
    result=format_document_bytes(root);_validate_xsd(result)
    return name+'.xml',result


def build(cur,org,ids,sin):
    result=build_event23_batch_xml(cur,org,ids,bureau='okb')
    if result['excluded']:raise ValueError('; '.join(f"{v['event_id']}: {v['reason']}" for v in result['excluded']))
    name,raw=profile_xml(base64.b64decode(result['content_base64']),sin)
    return dict(file_name=name,raw=raw,sha256=hashlib.sha256(raw).hexdigest(),events=result['events'])
