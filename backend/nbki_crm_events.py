"""Outgoing NBKI queue driven by CRM operations, without 1C lookups."""

from __future__ import annotations

from decimal import Decimal


def list_crm_events(cur, org_id: int, limit: int = 100) -> dict:
    """Show queued operations with the accounting evidence used by the exporter.

    The event ledger is intentionally separate from historical import receipts.
    Closed loans and loans without one matched UID are not export candidates.
    """
    if not 1 <= limit <= 500:
        raise ValueError('Недопустимый размер страницы событий')
    cur.execute("""SELECT COUNT(*) FROM nbki_crm_events e
        JOIN loans l ON l.id=e.loan_id
        WHERE e.org_id=%s AND l.status IN ('active','overdue','holiday')""", (org_id,))
    total = cur.fetchone()[0]
    cur.execute("""SELECT e.id,e.loan_id,l.contract_no,e.source_type,e.source_id,
        e.event_kind,e.event_occurred_at,e.recorded_at,e.status,e.evidence_sha256,
        p.payment_date,p.amount,p.principal_part,p.interest_part,p.penalty_part,
        l.amount,l.balance,
        (SELECT array_agg(DISTINCT d.uid) FROM nbki_event_deals d
         WHERE d.org_id=e.org_id AND d.loan_id=e.loan_id
           AND d.role='borrower' AND d.match_status='matched') AS uids
        FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
        LEFT JOIN loan_payments p ON e.source_type='loan_payment' AND p.id=e.source_id
        WHERE e.org_id=%s AND l.status IN ('active','overdue','holiday')
        ORDER BY e.recorded_at DESC,e.id DESC LIMIT %s""", (org_id, limit))
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
        rows.append({
            'id': event_id, 'loan_id': loan_id, 'contract_no': contract_no,
            'source_type': source_type, 'source_id': source_id,
            'event_kind': event_kind,
            'event_occurred_at': occurred_at.isoformat() if occurred_at else None,
            'recorded_at': recorded_at.isoformat(), 'status': status,
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
        })
    return {'total': total, 'rows': rows}
