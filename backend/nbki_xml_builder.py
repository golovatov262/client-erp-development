"""Deterministic GUTDF 5.1 document envelope from CRM master data.

The event element is supplied by an event-specific serializer; this module
never copies a historical 1C XML fragment into a production document.
"""

from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from zoneinfo import ZoneInfo


MSK = ZoneInfo('Europe/Moscow')
SOURCE_ID_RE = re.compile(r'^[A-Z0-9]{12}$')


def _add(parent: ET.Element, name: str, value: str | None = None) -> ET.Element:
    child = ET.SubElement(parent, name)
    if value is not None:
        child.text = str(value)
    return child


def _require(data: dict, *keys: str) -> None:
    absent = [key for key in keys if data.get(key) in (None, '')]
    if absent:
        raise ValueError('В CRM не заполнено: ' + ', '.join(absent))


def source_block(source: dict, credit_info_date: str) -> ET.Element:
    _require(source, 'inn', 'ogrn', 'name', 'source_id', 'source_code',
             'registration_date', 'registration_number')
    if not SOURCE_ID_RE.fullmatch(source['source_id']):
        raise ValueError('Некорректный идентификатор источника НБКИ')
    source_node = ET.Element('Source')
    block = _add(source_node, 'FL_46_UL_36_OrgSource')
    _add(block, 'sourceCode', source['source_code'])
    _add(block, 'sourceRegistrationFact_1')
    _add(block, 'fullName', source['name'])
    if source.get('short_name'):
        _add(block, 'shortName', source['short_name'])
    _add(block, 'sourceDateStart', source['registration_date'])
    _add(block, 'regNum', source['registration_number'])
    tax = _add(block, 'TaxNum_group_FL_46_UL_36_OrgSource')
    _add(tax, 'taxCode', '1')
    _add(tax, 'taxNum', source['inn'])
    _add(block, 'sourceCreditInfoDate', credit_info_date)
    return source_node


def fl_title(subject: dict) -> ET.Element:
    _require(subject, 'last_name', 'first_name', 'birth_date',
             'passport_series', 'passport_number', 'passport_issue_date',
             'passport_issued_by')
    title = ET.Element('Title')
    group = _add(title, 'FL_1_4_Group')
    name = _add(group, 'FL_1_Name')
    _add(name, 'lastName', subject['last_name'])
    _add(name, 'firstName', subject['first_name'])
    if subject.get('middle_name'):
        _add(name, 'middleName', subject['middle_name'])
    doc = _add(group, 'FL_4_Doc')
    _add(doc, 'countryCode', '643')
    _add(doc, 'docCode', '21')
    _add(doc, 'docSeries', subject['passport_series'])
    _add(doc, 'docNum', subject['passport_number'])
    _add(doc, 'issueDate', subject['passport_issue_date'])
    _add(doc, 'docIssuer', subject['passport_issued_by'])
    if subject.get('passport_dept_code'):
        _add(doc, 'deptCode', subject['passport_dept_code'])
    _add(doc, 'foreignerCode', '3')
    previous = _add(title, 'FL_2_5_Group')
    _add(_add(previous, 'FL_2_PrevName'), 'prevNameFlag_0')
    _add(_add(previous, 'FL_5_PrevDoc'), 'prevDocFact_0')
    _add(_add(title, 'FL_3_Birth'), 'birthDate', subject['birth_date'])
    if subject.get('inn'):
        tax = _add(title, 'FL_6_Tax')
        tax_number = _add(tax, 'TaxNum_group_FL_6_Tax')
        _add(tax_number, 'taxCode', '1')
        _add(tax_number, 'taxNum', subject['inn'])
        _add(tax_number, 'innChecked_0')
        _add(tax, 'specialMode_0')
    return title


def document_xml(source: dict, subjects: list[tuple[dict, list[ET.Element]]],
                 reg_number: str, created_at: datetime) -> tuple[bytes, str]:
    """Wrap fully mapped event elements in a deterministic NBKI document.

    Caller is responsible for event-specific content and XSD/business-rule
    validation before file release. The same input and timestamp yield the
    same bytes and digest, enabling immutable download and local signing.
    """
    if created_at.tzinfo is None or not subjects or not reg_number:
        raise ValueError('Для XML нужны номер, момент формирования и события')
    local_time = created_at.astimezone(MSK)
    if not all(events for _, events in subjects):
        raise ValueError('У каждого субъекта должно быть событие')
    root = ET.Element('Document', {
        'schemaVersion': '5.1', 'inn': source['inn'], 'ogrn': source['ogrn'],
        'sourceID': source['source_id'], 'regNumberDoc': reg_number,
        'dateTimeDoc': local_time.isoformat(timespec='seconds'),
        'subjectsCount': str(len(subjects)),
        'groupBlocksCount': str(sum(len(events) for _, events in subjects)),
        'regNumberDocInaccept': reg_number,
    })
    root.append(source_block(source, local_time.date().isoformat()))
    data = _add(root, 'Data')
    for subject, events in subjects:
        subject_node = _add(data, 'Subject_FL')
        subject_node.append(fl_title(subject))
        event_container = _add(subject_node, 'Events')
        for event in events:
            if not event.tag.startswith('FL_Event_') or event.get('eventDateTime') is None:
                raise ValueError('Событие ГУТДФ не содержит типа или времени')
            event_container.append(event)
    raw = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    return raw, hashlib.sha256(raw).hexdigest()
