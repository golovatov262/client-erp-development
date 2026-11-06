"""Resolve borrower UIDs from imported NBKI files without comparing stale terms.

The imported NBKI sources are authoritative only for the borrower UID. Loan,
member, payment and collateral values must come from CRM.
"""

from __future__ import annotations


def borrower_file_uids(cur, org_id: int, loan_id: int, contract_no: str) -> list[str]:
    """Return distinct borrower UIDs, newest imported source first."""
    cur.execute("""SELECT uid FROM (
        SELECT uid,updated_at,1 AS source_priority,id AS row_id
        FROM nbki_deals WHERE org_id=%s AND deal_role='borrower'
          AND (loan_id=%s OR contract_no=%s)
        UNION ALL
        SELECT uid,updated_at,2 AS source_priority,id AS row_id
        FROM nbki_event_deals WHERE org_id=%s AND role='borrower'
          AND (loan_id=%s OR contract_no=%s)
    ) imported
    WHERE uid IS NOT NULL AND BTRIM(uid)<>''
    ORDER BY updated_at DESC,source_priority DESC,row_id DESC""",
        (org_id, loan_id, contract_no, org_id, loan_id, contract_no))
    result = []
    seen = set()
    for (uid,) in cur.fetchall():
        value = uid.strip()
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def authoritative_borrower_uid(cur, org_id: int, loan_id: int,
                                contract_no: str, manual_uid: str | None = None) -> tuple[str | None, str]:
    """Prefer the latest UID from an NBKI file; use CRM's manual UID only as fallback."""
    file_uids = borrower_file_uids(cur, org_id, loan_id, contract_no)
    if file_uids:
        return file_uids[0], 'nbki_file'
    value = manual_uid.strip() if manual_uid else None
    return (value, 'crm_manual') if value else (None, 'missing')
