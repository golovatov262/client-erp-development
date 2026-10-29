"""Read-only CRM payment queue after the latest operator-assumed 1C event.

This queue does not assign a GUTDF event, produce XML, or prove NBKI receipt.
"""

from __future__ import annotations

try:
    from nbki_outbox import inspect_loan
    from nbki_accounting_snapshot import audit_payment_allocations, build_accounting_snapshot
except ImportError:
    from backend.nbki_outbox import inspect_loan
    from backend.nbki_accounting_snapshot import audit_payment_allocations, build_accounting_snapshot


def list_payment_candidates(cur, org_id: int) -> dict:
    cur.execute("""SELECT l.id,l.contract_no,f.uid,f.event_time,f.source_id,
        f.source_row_num,p.id,p.payment_date,p.amount,p.principal_part,
        p.interest_part,p.penalty_part,p.payment_type,p.source
        FROM nbki_1c_loan_facts f
        JOIN loans l ON l.id=f.loan_id AND l.org_id=f.org_id
        JOIN loan_payments p ON p.loan_id=l.id
        WHERE f.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND p.payment_date>f.event_time::date AND p.payment_date<=CURRENT_DATE
          AND EXISTS (SELECT 1 FROM nbki_event_deals e
              WHERE e.org_id=f.org_id AND e.loan_id=l.id AND e.uid=f.uid
                AND e.role='borrower' AND e.match_status='matched')
        ORDER BY p.payment_date,l.id,p.id""", (org_id,))
    rows = []
    inspections = {}
    ledgers = {}
    for (loan_id, contract_no, uid, event_time, source_id, row_num,
         payment_id, payment_date, amount, principal, interest, penalty,
         payment_type, payment_source) in cur.fetchall():
        if loan_id not in inspections:
            inspections[loan_id] = inspect_loan(cur, org_id, loan_id)
        inspection = inspections[loan_id]
        if inspection['uid'] != uid:
            # A later conflicting UID or borrower match must never enter the queue.
            continue
        if loan_id not in ledgers:
            cur.execute("""SELECT id,payment_date,amount,principal_part,
                interest_part,penalty_part,engine_version FROM loan_payments
                WHERE loan_id=%s ORDER BY payment_date,id""", (loan_id,))
            ledgers[loan_id] = cur.fetchall()
        loan = inspection['snapshot']['loan']
        accounting = build_accounting_snapshot(loan['amount'], loan['balance'],
                                               ledgers[loan_id], payment_id)
        payment = next(row for row in ledgers[loan_id] if row[0] == payment_id)
        cur.execute("""SELECT a.id,a.schedule_id,a.component,a.amount,
            a.allocation_mode,s.loan_id FROM loan_payment_allocations a
            LEFT JOIN loan_schedule s ON s.id=a.schedule_id
            WHERE a.payment_id=%s ORDER BY a.id""", (payment_id,))
        allocation_audit = audit_payment_allocations(payment, cur.fetchall(), loan_id)
        rows.append({'loan_id': loan_id, 'contract_no': contract_no, 'uid': uid,
                     'baseline_event_time': event_time.isoformat(),
                     'baseline_source_id': source_id, 'baseline_source_row_num': row_num,
                     'payment_id': payment_id, 'payment_date': payment_date.isoformat(),
                     'amount': str(amount), 'principal': str(principal or 0),
                     'interest': str(interest or 0), 'penalty': str(penalty or 0),
                     'payment_type': payment_type, 'payment_source': payment_source,
                     'candidate_reason': 'Платёж CRM после последнего события 1С',
                     'crm_issues': inspection['checks']['crm_issues'],
                     'missing_fields': inspection['readiness']['missing_fields'],
                     'accounting_snapshot': accounting,
                     'allocation_audit': allocation_audit,
                     'gutdf_event_code': None, 'event_code_confirmed': False,
                     'xml_ready': False})
    return {'total': len(rows), 'rows': rows,
            'acceptance_basis': 'operator_assumed',
            'note': 'Однодневные совпадения с датой события не включены; требуется отдельная проверка'}
