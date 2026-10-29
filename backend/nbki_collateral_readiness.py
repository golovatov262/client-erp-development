"""CRM-only preflight for future NBKI event 2.4 collateral changes."""

from __future__ import annotations


def collateral_readiness(cur, org_id: int) -> dict:
    """List active CRM collateral records and the fields/history still needed.

    This is deliberately a readiness report, not an event serializer: a 2.4
    event requires both the previously reported and changed collateral state.
    """
    cur.execute("""SELECT l.id,l.contract_no,l.status,lc.id,lc.collateral_type,
        lc.pledger_name,lc.description,lc.collateral_value,lc.identifier,
        lc.nbki_guarantee_uid,lc.nbki_guarantee_amount,lc.nbki_guarantee_currency,
        lc.nbki_guarantee_start,lc.nbki_guarantee_end,lc.nbki_event_source_id
        FROM loans l JOIN loan_collateral lc ON lc.loan_id=l.id
        WHERE l.org_id=%s AND l.status IN ('active','overdue','holiday')
        ORDER BY l.contract_no,lc.id""", (org_id,))
    rows = []
    by_type: dict[str, dict] = {}
    for row in cur.fetchall():
        (loan_id, contract_no, loan_status, collateral_id, kind, pledger,
         description, value, identifier, guarantee_uid, guarantee_amount,
         guarantee_currency, guarantee_start, guarantee_end, source_id) = row
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
            # CRM currently stores only broad pledge families; the GUTDF
            # reference distinguishes concrete asset types and legal facts.
            missing.extend(['код конкретного вида предмета залога',
                            'дата возникновения залога',
                            'валюта и вид стоимости (оценка/актуальная стоимость)',
                            'ранее переданное состояние обеспечения'])
            if not identifier:
                missing.append('идентификатор предмета залога')
            if value is None:
                missing.append('стоимость предмета залога')
            if not pledger:
                missing.append('залогодатель')
        if not source_id:
            missing.append('снимок исходных сведений, ранее переданных в БКИ')
        missing.append('снимок сведений до и после изменения для события 2.4')
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
            'has_previous_source': bool(source_id)})
    cur.execute("""SELECT COUNT(*) FROM loans
        WHERE org_id=%s AND status IN ('active','overdue','holiday')""", (org_id,))
    active_loans = cur.fetchone()[0]
    return {'active_loans': active_loans, 'collateral_records': len(rows),
            'ready_for_event24': 0, 'event24_status': 'not_implemented_pending_field_mapping',
            'by_type': list(by_type.values()), 'rows': rows}
