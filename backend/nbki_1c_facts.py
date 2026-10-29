"""Copy verified-matched 1C MXL indicators into an auditable CRM NBKI section.

This never updates the accounting loan, payment, schedule or member tables.
The imported event is assumed accepted by operator instruction, not a verified
NBKI receipt. Values are labels/text from 1C, not XML code values.
"""

from __future__ import annotations

import gzip
from collections import Counter

from psycopg2.extras import Json

try:
    from nbki_mxl_import import _match_borrower, parse_mxl
except ImportError:
    from backend.nbki_mxl_import import _match_borrower, parse_mxl


def select_indicators(cells: dict, header: dict) -> dict:
    """Keep the original 1C cell, column and exact field heading together."""
    return {str(column): {'code': header.get(column), 'value': value}
            for key, value in cells.items()
            if (column := int(key)) >= 11 and value and header.get(column)}


def get_loan_facts(cur, loan_id: int, org_id: int | None = None) -> dict | None:
    cur.execute("""SELECT f.loan_id,f.uid,f.source_id,f.source_row_num,
        f.event_time,f.event_type,f.indicators,s.file_sha256,s.last_event_time
        FROM nbki_1c_loan_facts f JOIN nbki_event_sources s ON s.id=f.source_id
        WHERE f.loan_id=%s AND (%s IS NULL OR f.org_id=%s)""",
        (loan_id, org_id, org_id))
    row = cur.fetchone()
    if not row:
        return None
    return {'loan_id': row[0], 'uid': row[1], 'source_id': row[2],
            'source_row_num': row[3], 'event_time': row[4].isoformat(),
            'event_type': row[5], 'indicators': row[6],
            'source_sha256': row[7], 'source_last_event_time': row[8].isoformat(),
            'acceptance_basis': 'operator_assumed'}


def sync_1c_facts(cur, org_id: int, source_id: int, *, apply: bool = False) -> dict:
    """Preview by default; persist only exact, current borrower matches."""
    cur.execute("""SELECT file_sha256,raw_gzip,row_count FROM nbki_event_sources
        WHERE id=%s AND org_id=%s""", (source_id, org_id))
    saved = cur.fetchone()
    if not saved:
        raise ValueError('Отчёт событий 1С не найден для организации')
    packed = bytes(saved[1])
    if len(packed) > 8 * 1024 * 1024:
        raise ValueError('Слишком большой архив отчёта событий')
    raw = gzip.decompress(packed)
    source = parse_mxl(raw)
    if source['sha256'] != saved[0] or len(source['rows']) != saved[2]:
        raise ValueError('Сохранённый отчёт событий не прошёл контрольную сумму')
    latest = {}
    for row in source['rows']:
        if row['role'] != 'borrower':
            continue
        previous = latest.get(row['uid'])
        if not previous or (row['event_time'], row['row_num']) > (previous['event_time'], previous['row_num']):
            latest[row['uid']] = row
    counts = Counter()
    selected = []
    for uid, row in latest.items():
        deal = source['deals'][uid]
        loan_id, status, _ = _match_borrower(cur, org_id, deal)
        if status != 'matched' or loan_id is None:
            counts['unmatched'] += 1
            continue
        cur.execute("""SELECT l.status,e.match_status FROM loans l
            JOIN nbki_event_deals e ON e.loan_id=l.id AND e.org_id=l.org_id
                AND e.uid=%s AND e.role='borrower'
            WHERE l.id=%s AND l.org_id=%s""", (uid, loan_id, org_id))
        current = cur.fetchone()
        if not current or current[1] != 'matched' or current[0] not in ('active', 'overdue', 'holiday'):
            counts['excluded'] += 1
            continue
        cur.execute("""SELECT uid,source_id,source_row_num,event_time,indicators
            FROM nbki_1c_loan_facts WHERE loan_id=%s""", (loan_id,))
        old = cur.fetchone()
        indicators = select_indicators(row['cells'], source['header'])
        if old and old[0] != uid:
            counts['conflict'] += 1
            continue
        if old and old[3] > row['event_time']:
            counts['older'] += 1
            continue
        if old and (old[1], old[2], old[3], old[4]) == (
                source_id, row['row_num'], row['event_time'], indicators):
            counts['unchanged'] += 1
            continue
        kind = 'updated' if old else 'created'
        counts[kind] += 1
        selected.append((loan_id, uid, row, indicators))
    if apply:
        for loan_id, uid, row, indicators in selected:
            cur.execute("""INSERT INTO nbki_1c_loan_facts
                (loan_id,org_id,uid,source_id,source_row_num,event_time,event_type,indicators)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (loan_id) DO UPDATE SET
                  uid=EXCLUDED.uid,source_id=EXCLUDED.source_id,
                  source_row_num=EXCLUDED.source_row_num,
                  event_time=EXCLUDED.event_time,event_type=EXCLUDED.event_type,
                  indicators=EXCLUDED.indicators,updated_at=NOW()""",
                (loan_id, org_id, uid, source_id, row['row_num'],
                 row['event_time'], row['event_type'], Json(indicators)))
    return {'source_id': source_id, 'file_sha256': saved[0],
            'source_last_event_time': source['last_event_time'].isoformat(),
            'matched_active': counts['created'] + counts['updated'] + counts['unchanged'] + counts['older'],
            'created': counts['created'], 'updated': counts['updated'],
            'unchanged': counts['unchanged'], 'older': counts['older'],
            'unmatched': counts['unmatched'], 'excluded': counts['excluded'],
            'conflict': counts['conflict'], 'applied': apply}
