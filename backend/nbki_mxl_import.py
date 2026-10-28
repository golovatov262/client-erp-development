"""Import 1C MXL event reports without misrepresenting them as NBKI receipts.

The operator may assume events were accepted, but only a ticket2 proves receipt.
This importer stores every non-empty report cell and changes no loan amounts,
dates, schedules, balances, payments or member data.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from psycopg2.extras import Json

try:
    from nbki_import import _norm, resolve_source_org_id
except ImportError:
    from backend.nbki_import import _norm, resolve_source_org_id


MAX_MXL_BYTES = 20 * 1024 * 1024
CELL = re.compile(r'\{16,\d+,\s*\{1,1,\s*\{"#","((?:[^"\\]|\\.)*)"\}\s*\},0\},(\d+),')
DIMENSIONS = re.compile(r'0,2,(\d+),0,0,(\d+),0,')
ROLE = {'Заемщик': 'borrower', 'Поручитель': 'guarantor'}
EXPECTED_HEADERS = {1: 'N', 2: 'Дата события', 3: 'Событие', 4: 'Вид участия',
                    5: 'Контрагент', 6: 'Договор', 7: 'ФЛ_17.1', 8: 'ФЛ_17.2',
                    10: 'ФЛ_17.4', 34: 'ФЛ_19.1'}


def _date(value: str | None):
    return datetime.strptime(value, '%d.%m.%Y').date() if value else None


def _amount(value: str | None):
    if not value:
        return None
    try:
        return Decimal(value.replace('\u00a0', '').replace(' ', '').replace(',', '.'))
    except InvalidOperation as exc:
        raise ValueError('Некорректная сумма в MXL') from exc


def parse_mxl(raw: bytes) -> dict:
    if len(raw) > MAX_MXL_BYTES or not raw.startswith(b'MOXCEL'):
        raise ValueError('Ожидается MXL 1С размером до 20 МБ')
    try:
        content = raw.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ValueError('MXL должен быть в кодировке UTF-8') from exc
    dimensions = DIMENSIONS.search(content[:1000])
    if not dimensions:
        raise ValueError('Не найдены размеры таблицы MXL')
    height, width = map(int, dimensions.groups())
    if not 2 <= height <= 50000 or not 34 <= width <= 1000:
        raise ValueError('Некорректные размеры таблицы MXL')
    marker = re.compile(r'\},(\d+),0,' + str(width) + r',0,')
    markers = list(marker.finditer(content))
    if len(markers) != height - 1 or [int(m.group(1)) for m in markers] != list(range(1, height)):
        raise ValueError('Не удалось надежно разделить строки MXL')
    segments = [content[:markers[0].start()]]
    segments.extend(content[m.end():markers[i+1].start() if i+1 < len(markers) else len(content)]
                    for i, m in enumerate(markers))
    header = {int(col): value for value, col in CELL.findall(segments[0])}
    if any(header.get(col) != label for col, label in EXPECTED_HEADERS.items()):
        raise ValueError('Неподдерживаемые колонки отчета событий MXL')
    rows = []
    groups = defaultdict(list)
    for row_num, segment in enumerate(segments[1:], 1):
        cells = {int(col): value for value, col in CELL.findall(segment)}
        if cells.get(1) != str(row_num) or any(not cells.get(col) for col in (2, 3, 4, 5, 6, 7, 8)):
            raise ValueError(f'Неполные реквизиты в строке {row_num}')
        if cells[4] not in ROLE or (cells[4] == 'Заемщик' and cells[6] != cells[8]):
            raise ValueError(f'Неоднозначная роль или номер договора в строке {row_num}')
        try:
            event_time = datetime.strptime(cells[2], '%d.%m.%Y %H:%M:%S')
            deal_date = _date(cells.get(10))
            amount = _amount(cells.get(34))
        except ValueError as exc:
            raise ValueError(f'Некорректная дата или сумма в строке {row_num}') from exc
        row = {'row_num': row_num, 'event_time': event_time, 'event_type': cells[3],
               'role': ROLE[cells[4]], 'subject_name': cells[5],
               'contract_no': cells[6], 'nbki_contract_no': cells[8],
               'uid': cells[7], 'deal_date': deal_date,
               'original_amount': amount, 'cells': {str(k): v for k, v in cells.items()}}
        rows.append(row)
        groups[row['uid']].append(row)
    deals = {}
    for uid, group in groups.items():
        first = group[0]
        identity = (first['contract_no'], first['nbki_contract_no'], first['role'], _norm(first['subject_name']),
                    first['deal_date'], first['original_amount'])
        if any((r['contract_no'], r['nbki_contract_no'], r['role'], _norm(r['subject_name']), r['deal_date'],
                r['original_amount']) != identity for r in group[1:]):
            raise ValueError('Один УИД имеет разные реквизиты в MXL')
        deals[uid] = {**first, 'first_event_time': min(r['event_time'] for r in group),
                      'last_event_time': max(r['event_time'] for r in group)}
    borrower_by_number = defaultdict(set)
    for deal in deals.values():
        if deal['role'] == 'borrower':
            borrower_by_number[deal['contract_no']].add(deal['uid'])
    if any(len(uids) > 1 for uids in borrower_by_number.values()):
        raise ValueError('У одного договора несколько УИД заемщика')
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'raw_gzip': gzip.compress(raw),
            'header': header, 'rows': rows, 'deals': deals,
            'first_event_time': min(r['event_time'] for r in rows),
            'last_event_time': max(r['event_time'] for r in rows)}


def _match_borrower(cur, org_id: int, deal: dict) -> tuple[int | None, str, str | None]:
    if deal['role'] == 'guarantor':
        return None, 'guarantor', 'УИД поручителя хранится отдельно от УИД заемщика'
    cur.execute("""SELECT l.id, l.amount, l.start_date, m.member_type,
                          m.last_name, m.first_name, m.middle_name, m.company_name
                   FROM loans l JOIN members m ON m.id=l.member_id
                   WHERE l.org_id=%s AND l.contract_no=%s""", (org_id, deal['contract_no']))
    matches = cur.fetchall()
    if not matches:
        return None, 'not_in_crm', 'Номер договора отсутствует в CRM'
    if len(matches) != 1:
        return None, 'review', 'Номер договора неоднозначен'
    loan_id, crm_amount, crm_date, kind, last, first, middle, company = matches[0]
    crm_name = ' '.join(filter(None, (last, first, middle))) if kind == 'FL' else company
    problems = []
    if not crm_name or _norm(crm_name) != _norm(deal['subject_name']):
        problems.append('имя заемщика')
    if deal['original_amount'] is not None and crm_amount is not None and abs(deal['original_amount'] - crm_amount) > Decimal('0.01'):
        problems.append('сумма договора')
    if deal['deal_date'] and crm_date and deal['deal_date'] != crm_date:
        problems.append('дата договора')
    if deal['original_amount'] is None or crm_amount is None or deal['deal_date'] is None or crm_date is None:
        problems.append('недостаточно данных для проверки')
    cur.execute('SELECT uid, loan_id FROM nbki_deals WHERE org_id=%s AND (uid=%s OR contract_no=%s)',
                (org_id, deal['uid'], deal['contract_no']))
    for old_uid, old_loan in cur.fetchall():
        if old_uid != deal['uid'] or old_loan not in (None, loan_id):
            problems.append('конфликт с УИД из XML')
            break
    if problems:
        return None, 'review', 'Расхождение: ' + ', '.join(problems)
    return loan_id, 'matched', None


def import_mxl(conn, raw: bytes, original_name: str) -> dict:
    source = parse_mxl(raw)
    statuses = Counter()
    with conn.cursor() as cur:
        org_id = resolve_source_org_id(cur)
        cur.execute("""INSERT INTO nbki_event_sources
            (org_id, file_sha256, original_name, raw_gzip, row_count, first_event_time, last_event_time)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (file_sha256) DO UPDATE SET file_sha256=EXCLUDED.file_sha256
            RETURNING id, org_id, row_count""",
            (org_id, source['sha256'], original_name[:500], source['raw_gzip'],
             len(source['rows']), source['first_event_time'], source['last_event_time']))
        source_id, saved_org_id, saved_count = cur.fetchone()
        if saved_org_id != org_id or saved_count != len(source['rows']):
            raise ValueError('Файл уже сохранен с другими реквизитами')
        for row in source['rows']:
            cur.execute("""INSERT INTO nbki_event_rows
                (source_id,row_num,event_time,event_type,role,contract_no,nbki_contract_no,uid,subject_name,cells)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (source_id,row_num) DO NOTHING""",
                (source_id, row['row_num'], row['event_time'], row['event_type'], row['role'],
                 row['contract_no'], row['nbki_contract_no'], row['uid'], row['subject_name'], Json(row['cells'])))
        for uid, deal in source['deals'].items():
            loan_id, status, reason = _match_borrower(cur, org_id, deal)
            cur.execute('SELECT contract_no, nbki_contract_no, role, subject_name, loan_id, deal_date, original_amount FROM nbki_event_deals WHERE org_id=%s AND uid=%s',
                        (org_id, uid))
            existing = cur.fetchone()
            if existing and (existing[0] != deal['contract_no'] or existing[1] != deal['nbki_contract_no'] or
                             existing[2] != deal['role'] or _norm(existing[3]) != _norm(deal['subject_name']) or
                             existing[5] != deal['deal_date'] or existing[6] != deal['original_amount'] or
                             (existing[4] is not None and loan_id is not None and existing[4] != loan_id)):
                raise ValueError('УИД уже связан с другими реквизитами в прежнем MXL')
            cur.execute("""INSERT INTO nbki_event_deals
                (org_id,uid,contract_no,nbki_contract_no,role,subject_name,deal_date,original_amount,loan_id,
                 match_status,match_reason,first_event_time,last_event_time,last_source_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (org_id,uid) DO UPDATE SET
                  first_event_time=LEAST(nbki_event_deals.first_event_time,EXCLUDED.first_event_time),
                  last_event_time=GREATEST(nbki_event_deals.last_event_time,EXCLUDED.last_event_time),
                  last_source_id=CASE WHEN EXCLUDED.last_event_time>=nbki_event_deals.last_event_time
                                      THEN EXCLUDED.last_source_id ELSE nbki_event_deals.last_source_id END,
                  loan_id=EXCLUDED.loan_id, match_status=EXCLUDED.match_status,
                  match_reason=EXCLUDED.match_reason, updated_at=NOW()""",
                (org_id, uid, deal['contract_no'], deal['nbki_contract_no'], deal['role'], deal['subject_name'],
                 deal['deal_date'], deal['original_amount'], loan_id, status, reason,
                 deal['first_event_time'], deal['last_event_time'], source_id))
            statuses[status] += 1
    return {'source_id': source_id, 'rows': len(source['rows']),
            'borrower_uids': sum(d['role'] == 'borrower' for d in source['deals'].values()),
            'guarantor_uids': sum(d['role'] == 'guarantor' for d in source['deals'].values()),
            'matched': statuses['matched'], 'review': statuses['review'],
            'not_in_crm': statuses['not_in_crm'],
            'acceptance_basis': 'operator_assumed',
            'first_event_time': source['first_event_time'].isoformat(),
            'last_event_time': source['last_event_time'].isoformat()}


def main() -> None:
    parser = argparse.ArgumentParser(description='Импорт отчета событий НБКИ из 1С MXL')
    parser.add_argument('mxl', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    import psycopg2
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        result = import_mxl(conn, args.mxl.read_bytes(), args.mxl.name)
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
        print(json.dumps({'applied': args.apply, **result}, ensure_ascii=False))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
