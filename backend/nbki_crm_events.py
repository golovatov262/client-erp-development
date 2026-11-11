"""Outgoing NBKI queue driven by CRM operations, without 1C lookups."""

from __future__ import annotations

from decimal import Decimal
from datetime import date


def list_crm_events(cur, org_id: int, limit: int = 100,
                    date_from: str | None = None,
                    date_to: str | None = None) -> dict:
    """Show queued operations with the accounting evidence used by the exporter.

    The event ledger is intentionally separate from historical import receipts.
    Closed loans and loans without a UID from an imported NBKI file or CRM are
    not export candidates. Imported non-UID details are not compared here.
    """
    if not 1 <= limit <= 500:
        raise ValueError('Недопустимый размер страницы событий')
    try:
        start = date.fromisoformat(date_from) if date_from else None
        end = date.fromisoformat(date_to) if date_to else None
    except (TypeError, ValueError) as exc:
        raise ValueError('Период событий должен быть указан в формате ГГГГ-ММ-ДД') from exc
    if start and end and start > end:
        raise ValueError('Начало периода не может быть позже его окончания')
    period = """AND (%s::date IS NULL OR (e.event_occurred_at AT TIME ZONE 'Europe/Moscow')::date >= %s::date)
        AND (%s::date IS NULL OR (e.event_occurred_at AT TIME ZONE 'Europe/Moscow')::date <= %s::date)"""
    cur.execute("""SELECT COUNT(*) FROM nbki_crm_events e
        JOIN loans l ON l.id=e.loan_id
        WHERE e.org_id=%s AND l.bki_enabled IS TRUE AND l.status IN ('active','overdue','holiday')
        """ + period, (org_id, start, start, end, end))
    total = cur.fetchone()[0]
    cur.execute("""SELECT e.id,e.loan_id,l.contract_no,e.source_type,e.source_id,
        e.event_kind,e.event_occurred_at,e.recorded_at,e.status,e.evidence_sha256,
        p.payment_date,p.amount,p.principal_part,p.interest_part,p.penalty_part,
        l.amount,l.balance,
        (SELECT array_agg(DISTINCT d.uid) FROM (
            SELECT uid FROM nbki_event_deals d WHERE d.org_id=e.org_id
              AND d.role='borrower' AND (d.loan_id=e.loan_id OR d.contract_no=l.contract_no)
            UNION SELECT uid FROM nbki_deals d WHERE d.org_id=e.org_id
              AND d.deal_role='borrower' AND (d.loan_id=e.loan_id OR d.contract_no=l.contract_no)
            UNION SELECT loan_uid FROM loan_bki_fields f
              WHERE f.org_id=e.org_id AND f.loan_id=e.loan_id
        ) d WHERE d.uid IS NOT NULL AND BTRIM(d.uid)<>'') AS uids
        FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
        LEFT JOIN loan_payments p ON e.source_type='loan_payment' AND p.id=e.source_id
        WHERE e.org_id=%s AND l.bki_enabled IS TRUE AND l.status IN ('active','overdue','holiday')
        """ + period + " ORDER BY e.event_occurred_at DESC NULLS LAST,e.id DESC LIMIT %s",
        (org_id, start, start, end, end, limit))
    if __package__:
        from .nbki_event23_xml import assess_event_generation
    else:
        from nbki_event23_xml import assess_event_generation
    if __package__:
        from .nbki_delivery import delivery_state
    else:
        from nbki_delivery import delivery_state
    rows = []
    for row in cur.fetchall():
        (event_id, loan_id, contract_no, source_type, source_id, event_kind,
         occurred_at, recorded_at, status, digest, payment_date, payment_amount,
         principal_part, interest_part, penalty_part, original_amount,
         current_balance, uids) = row
        uid = uids[0] if uids and len(uids) == 1 else None
        components_match = (all(value is not None for value in
                                (payment_amount, principal_part, interest_part, penalty_part))
                            and abs(Decimal(payment_amount) - Decimal(principal_part)
                                    - Decimal(interest_part) - Decimal(penalty_part))
                            <= Decimal('0.01'))
        delivery = delivery_state(cur, org_id, event_id)
        rows.append({
            'id': event_id, 'loan_id': loan_id, 'contract_no': contract_no,
            'source_type': source_type, 'source_id': source_id,
            'event_kind': event_kind,
            'event_occurred_at': occurred_at.isoformat() if occurred_at else None,
            'recorded_at': recorded_at.isoformat(), 'status': delivery['status'],
            'delivery': delivery,
            'evidence_sha256': digest.strip() if digest else None,
            'uid': uid, 'payment_date': payment_date.isoformat() if payment_date else None,
            'payment': {key: str(value) if value is not None else None
                        for key, value in (('amount', payment_amount),
                                           ('principal', principal_part),
                                           ('interest', interest_part),
                                           ('penalty', penalty_part))},
            'original_principal': str(original_amount),
            'current_principal': str(current_balance),
            'components_match': components_match,
            'has_posting_snapshot': bool(digest),
            'source_complete': bool(uid and occurred_at and components_match),
            'readiness': assess_event_generation(cur, org_id, event_id),
        })
    return {'total': total, 'rows': rows}
