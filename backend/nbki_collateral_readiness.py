"""Collateral metadata and the shared XML generation readiness."""

from __future__ import annotations

import re


def collateral_readiness(cur, org_id: int) -> dict:
    """List active CRM collateral records and the fields/history still needed.

    This is deliberately a readiness report, not an event serializer: a 2.4
    event requires both the previously reported and changed collateral state.
    """
    cur.execute("""SELECT l.id,l.contract_no,l.status,lc.id,lc.collateral_type,
        lc.pledger_name,lc.description,lc.collateral_value,lc.identifier,
        lc.nbki_guarantee_uid,lc.nbki_guarantee_amount,lc.nbki_guarantee_currency,
        lc.nbki_guarantee_start,lc.nbki_guarantee_end,lc.nbki_event_source_id,
        lc.nbki_collateral_code,lc.nbki_collateral_start,lc.nbki_collateral_end,
        lc.nbki_collateral_sum,lc.nbki_collateral_currency,lc.nbki_assess_date,
        lc.nbki_price_code,lc.nbki_actual_cost,lc.nbki_calc_date,
        lc.nbki_actual_price_code,lc.nbki_contract_total_sum,lc.nbki_contract_count,
        lc.nbki_location,lc.nbki_location_address,
        source_facts.payload
        FROM loans l JOIN loan_collateral lc ON lc.loan_id=l.id
        LEFT JOIN LATERAL (
            SELECT f.payload FROM nbki_collateral_facts f
            WHERE f.collateral_id=lc.id AND f.match_status='matched'
            ORDER BY f.event_time DESC NULLS LAST,f.id DESC LIMIT 1
        ) source_facts ON TRUE
        WHERE l.org_id=%s AND l.bki_enabled IS TRUE AND l.status IN ('active','overdue','holiday')
        ORDER BY l.contract_no,lc.id""", (org_id,))
    collateral_rows = cur.fetchall()
    cur.execute("SELECT loan_id,id FROM nbki_crm_events WHERE org_id=%s AND event_name='FL_Event_2_4' ORDER BY id", (org_id,))
    latest = dict(cur.fetchall())
    if __package__:
        from .nbki_event23_xml import assess_event_generation
    else:
        from nbki_event23_xml import assess_event_generation
    readiness = {lid: assess_event_generation(cur,org_id,eid) for lid,eid in latest.items()}
    rows = []
    by_type: dict[str, dict] = {}
    for row in collateral_rows:
        (loan_id, contract_no, loan_status, collateral_id, kind, pledger,
         description, value, identifier, guarantee_uid, guarantee_amount,
         guarantee_currency, guarantee_start, guarantee_end, source_id,
         collateral_code, collateral_start, collateral_end, collateral_sum,
         collateral_currency, assess_date, price_code, actual_cost, calc_date,
         actual_price_code, contract_total_sum, contract_count, location,
         location_address, source_facts) = row
        has_xml_history = isinstance(source_facts, dict)
        missing = []
        if kind == 'Поручительство':
            if not guarantee_uid:
                missing.append('УИД договора поручительства')
            if guarantee_amount is None:
                missing.append('размер поручительства')
            if not guarantee_currency:
                missing.append('валюта поручительства')
            if not guarantee_start:
                missing.append('дата заключения поручительства')
            if not guarantee_end:
                missing.append('дата окончания поручительства')
            if not pledger and not description:
                missing.append('идентификация поручителя')
        else:
            if not collateral_code:
                missing.append('код конкретного вида предмета залога')
            if not identifier:
                missing.append('идентификатор предмета залога (VIN или кадастровый номер)')
            if not collateral_start:
                missing.append('дата возникновения залога')
            if not collateral_end:
                missing.append('дата окончания залога')
            if collateral_sum is None:
                missing.append('сумма обеспечения')
            if collateral_currency != 'RUB':
                missing.append('валюта обеспечения (код RUB)')
            if not assess_date:
                missing.append('дата оценки')
            if not price_code:
                missing.append('код вида стоимости')
            if actual_cost is None:
                missing.append('актуальная стоимость')
            if not calc_date:
                missing.append('дата расчёта стоимости')
            if not actual_price_code:
                missing.append('код фактической стоимости')
            if contract_total_sum is None:
                missing.append('общая сумма обеспеченных обязательств')
            if contract_count != 1:
                missing.append('количество договоров в записи (должно быть 1)')
            if not location_address:
                missing.append('адрес для определения ОКАТО')
            if not location or not re.fullmatch(r'\d{11}', str(location)):
                missing.append('код местонахождения по ОКАТО (11 цифр)')

            if not pledger:
                missing.append('залогодатель')
        if loan_id in readiness:
            missing = readiness[loan_id]['blockers']
        else:
            missing.append('не зарегистрирована операция изменения обеспечения')
        kind_report = by_type.setdefault(kind, {'type': kind, 'count': 0,
            'with_missing_data': 0, 'missing_counts': {}})
        kind_report['count'] += 1
        if missing:
            kind_report['with_missing_data'] += 1
            for field in missing:
                kind_report['missing_counts'][field] = kind_report['missing_counts'].get(field, 0) + 1
        rows.append({'loan_id': loan_id, 'contract_no': contract_no,
            'loan_status': loan_status, 'collateral_id': collateral_id,
            'collateral_type': kind, 'missing_fields': missing,
            'has_previous_source': bool(source_id or has_xml_history)})
    cur.execute("""SELECT COUNT(*) FROM loans
        WHERE org_id=%s AND bki_enabled IS TRUE AND status IN ('active','overdue','holiday')""", (org_id,))
    active_loans = cur.fetchone()[0]
    return {'active_loans': active_loans, 'collateral_records': len(rows),
            'ready_for_event24': sum(r['can_generate_xml'] for r in readiness.values()), 'event24_status': 'crm_operation_snapshots',
            'by_type': list(by_type.values()), 'rows': rows}
