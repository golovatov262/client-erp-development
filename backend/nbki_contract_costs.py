"""Project contractual cost indicators from provenance-tracked 1C MXL facts.

The imported values are candidates until checked against the signed contract.
They never overwrite `loans` or become approved outbound XML automatically.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation


def _decimal(raw) -> Decimal:
    value = str(raw or '').replace('\u00a0', '').replace('\u202f', '').replace(' ', '').replace(',', '.')
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise ValueError('Некорректное числовое значение ПСК в реестре 1С') from exc


def parse_cost_indicators(indicators: dict, crm_start_date, crm_amount) -> dict:
    by_code = {item.get('code'): item.get('value') for item in indicators.values()
               if isinstance(item, dict) and item.get('code')}
    required = ('ФЛ_22.1', 'ФЛ_22.2', 'ФЛ_22.3', 'ФЛ_25.2')
    if any(not by_code.get(code) for code in required):
        raise ValueError('В реестре 1С не хватает ПСК, даты расчёта или первоначальной суммы')
    try:
        calculated_on = datetime.strptime(str(by_code['ФЛ_22.3']).strip(), '%d.%m.%Y').date()
    except ValueError as exc:
        raise ValueError('Некорректная дата расчёта ПСК в реестре 1С') from exc
    percent = _decimal(by_code['ФЛ_22.1'])
    cost = _decimal(by_code['ФЛ_22.2'])
    source_amount = _decimal(by_code['ФЛ_25.2'])
    if percent < 0 or cost < 0 or source_amount <= 0:
        raise ValueError('Недопустимые значения ПСК или суммы займа в реестре 1С')
    date_match = calculated_on == crm_start_date
    amount_match = source_amount == crm_amount
    return {'psk_percent': percent, 'psk_amount': cost,
            'calculated_on': calculated_on, 'source_loan_amount': source_amount,
            'crm_loan_amount': crm_amount,
            'date_match': date_match, 'amount_match': amount_match,
            'status': 'source_consistent' if date_match and amount_match else 'review'}


def sync_cost_facts(cur, org_id: int, apply: bool = False) -> dict:
    cur.execute("""SELECT f.loan_id,f.uid,f.source_id,f.source_row_num,
        s.file_sha256,f.indicators,l.start_date,l.amount
        FROM nbki_1c_loan_facts f JOIN loans l
          ON l.id=f.loan_id AND l.org_id=f.org_id
        JOIN nbki_event_sources s ON s.id=f.source_id AND s.org_id=f.org_id
        WHERE f.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND EXISTS (SELECT 1 FROM nbki_event_deals e
            WHERE e.org_id=f.org_id AND e.loan_id=l.id AND e.uid=f.uid
              AND e.role='borrower' AND e.match_status='matched')
        ORDER BY f.loan_id""", (org_id,))
    rows = cur.fetchall()
    report = {'total': len(rows), 'complete': 0, 'consistent': 0,
              'review': 0, 'incomplete': 0, 'inserted': 0, 'existing': 0,
              'details': []}
    for loan_id, uid, source_id, row_num, source_sha, indicators, start_date, amount in rows:
        try:
            item = parse_cost_indicators(indicators, start_date, amount)
        except ValueError as exc:
            report['incomplete'] += 1
            report['details'].append({'loan_id': loan_id, 'status': 'incomplete',
                                      'reason': str(exc)})
            continue
        report['complete'] += 1
        report[item['status'].replace('source_', '')] += 1
        report['details'].append({'loan_id': loan_id, 'status': item['status'],
                                  'date_match': item['date_match'],
                                  'amount_match': item['amount_match']})
        if not apply:
            continue
        cur.execute("""INSERT INTO nbki_contract_cost_facts
            (loan_id,org_id,uid,psk_percent,psk_amount,calculated_on,
             source_loan_amount,crm_loan_amount,source_id,source_row_num,
             source_sha256,status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (loan_id) DO NOTHING RETURNING loan_id""",
            (loan_id, org_id, uid, item['psk_percent'], item['psk_amount'],
             item['calculated_on'], item['source_loan_amount'], amount,
             source_id, row_num, source_sha, item['status']))
        if cur.fetchone():
            report['inserted'] += 1
        else:
            report['existing'] += 1
    return report
