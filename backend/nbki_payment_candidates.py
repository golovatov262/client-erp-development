"""Read-only CRM payment queue after the latest operator-assumed 1C event.

This queue does not assign a GUTDF event, produce XML, or prove NBKI receipt.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

MOSCOW = ZoneInfo('Europe/Moscow')
CRM_FIXED_HOLIDAYS = {
    (1, day) for day in range(1, 9)
} | {(2, 23), (3, 8), (5, 1), (5, 9), (6, 12), (11, 4)}


def crm_effective_due_date(due: date) -> date:
    """Mirror the currently deployed loan cron's fixed-holiday transfer rule."""
    while due.weekday() >= 5 or (due.month, due.day) in CRM_FIXED_HOLIDAYS:
        due += timedelta(days=1)
    return due

try:
    from nbki_outbox import inspect_loan
    from nbki_accounting_snapshot import audit_payment_allocations, build_accounting_snapshot
    from nbki_event23_readiness import assess_event23
    from nbki_crm_debt import split_latest_crm_debt, split_posting_snapshot_debt, estimate_current_interest
    from nbki_smp import preview_smp
    from nbki_debt_preview import preview_debt
except ImportError:
    from backend.nbki_outbox import inspect_loan
    from backend.nbki_accounting_snapshot import audit_payment_allocations, build_accounting_snapshot
    from backend.nbki_event23_readiness import assess_event23
    from backend.nbki_crm_debt import split_latest_crm_debt, split_posting_snapshot_debt, estimate_current_interest
    from backend.nbki_smp import preview_smp
    from backend.nbki_debt_preview import preview_debt


def list_payment_candidates(cur, org_id: int) -> dict:
    cur.execute("""SELECT l.id,l.contract_no,f.uid,f.event_time,f.source_id,
        f.source_row_num,p.id,p.payment_date,p.amount,p.principal_part,
        p.interest_part,p.penalty_part,p.payment_type,p.source,
        p.nbki_event_occurred_at,p.nbki_recorded_at,p.nbki_event_time_basis,
        ps.evidence_sha256,ps.evidence,ps.captured_at,
        pc.psk_percent,pc.psk_amount,pc.calculated_on,pc.verification_status
        FROM nbki_1c_loan_facts f
        JOIN loans l ON l.id=f.loan_id AND l.org_id=f.org_id
        JOIN loan_payments p ON p.loan_id=l.id
        LEFT JOIN nbki_payment_posting_snapshots ps ON ps.payment_id=p.id
        LEFT JOIN loan_psk_calculations pc ON pc.loan_id=l.id AND pc.org_id=l.org_id
        WHERE f.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND p.payment_date>f.event_time::date
          AND p.payment_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
          AND EXISTS (SELECT 1 FROM nbki_event_deals e
              WHERE e.org_id=f.org_id AND e.loan_id=l.id AND e.uid=f.uid
                AND e.role='borrower' AND e.match_status='matched')
        ORDER BY p.payment_date,l.id,p.id""", (org_id,))
    rows = []
    inspections = {}
    ledgers = {}
    for (loan_id, contract_no, uid, event_time, source_id, row_num,
         payment_id, payment_date, amount, principal, interest, penalty,
         payment_type, payment_source, event_occurred_at, recorded_at,
         event_time_basis, posting_snapshot_sha256, posting_evidence, posting_captured_at,
         psk_percent, psk_amount, psk_calculated_on, psk_status) in cur.fetchall():
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
        if posting_snapshot_sha256 and posting_evidence:
            crm_debt = split_posting_snapshot_debt(
                posting_evidence, posting_snapshot_sha256, loan_id, payment_id, payment_date)
            if crm_debt['status'] == 'calculated_from_posting_snapshot' and accounting.get('status') == 'checked':
                from decimal import Decimal
                split_principal = Decimal(crm_debt['term_principal']) + Decimal(crm_debt['overdue_principal'])
                if abs(split_principal - Decimal(accounting['principal_after'])) > Decimal('0.01'):
                    crm_debt['status'] = 'review'
                    crm_debt['issues'].append('Основной долг снимка не равен журналу платежей CRM')
        else:
            crm_debt = split_latest_crm_debt(
                cur, loan_id, payment_id, payment_date,
                accounting.get('principal_after') if accounting.get('status') == 'checked' else None)
        interest_candidate = estimate_current_interest(
            cur, loan_id, payment_id, payment_date,
            latest_payment=ledgers[loan_id][-1][0] == payment_id,
            principal_checked=accounting.get('status') == 'checked')
        smp_candidate = preview_smp(cur, loan_id, payment_date, crm_debt)
        debt_preview = preview_debt(accounting, crm_debt, interest_candidate)
        event23 = assess_event23(inspection, accounting, allocation_audit,
                                event_occurred_at, posting_snapshot_sha256,
                                psk_candidate_status=psk_status, crm_debt=crm_debt)
        rows.append({'loan_id': loan_id, 'contract_no': contract_no, 'uid': uid,
                     'baseline_event_time': event_time.isoformat(),
                     'baseline_source_id': source_id, 'baseline_source_row_num': row_num,
                     'payment_id': payment_id, 'payment_date': payment_date.isoformat(),
                     'amount': str(amount), 'principal': str(principal or 0),
                     'interest': str(interest or 0), 'penalty': str(penalty or 0),
                     'payment_type': payment_type, 'payment_source': payment_source,
                     'event_occurred_at_msk': event_occurred_at.astimezone(MOSCOW).isoformat() if event_occurred_at else None,
                     'crm_recorded_at_msk': recorded_at.astimezone(MOSCOW).isoformat() if recorded_at else None,
                     'event_time_basis': event_time_basis,
                     'posting_snapshot_sha256': posting_snapshot_sha256.strip() if posting_snapshot_sha256 else None,
                     'posting_snapshot_captured_at_msk': posting_captured_at.astimezone(MOSCOW).isoformat() if posting_captured_at else None,
                     'candidate_reason': 'Платёж CRM после последнего события 1С',
                     'event_code_candidate': '2.3',
                     'event_code_candidate_basis': ('Раздел 5 приложения 3 к Положению Банка России '
                         '№ 758-П: изменились сведения об исполнении обязательства субъектом. '
                         'Требуется подтвердить фактическое время платежа и состав блоков.'),
                     'crm_issues': inspection['checks']['crm_issues'],
                     'missing_fields': inspection['readiness']['missing_fields'],
                     'accounting_snapshot': accounting,
                     'crm_debt_reconstruction': crm_debt,
                     'interest_candidate': interest_candidate,
                     'smp_candidate': smp_candidate,
                     'debt_preview': debt_preview,
                     'allocation_audit': allocation_audit,
                     'psk_candidate': ({'percent': str(psk_percent),
                                        'amount': str(psk_amount),
                                        'calculated_on': psk_calculated_on.isoformat(),
                                        'status': psk_status,
                                        'basis': 'Расчёт по исходным условиям CRM; статус сверки не разрешает XML автоматически'}
                                       if psk_percent is not None else None),
                     'event23_readiness': event23,
                     'gutdf_event_code': None, 'event_code_confirmed': False,
                     'xml_ready': False})
    # A payment-only queue misses planned due dates, interest accrual and
    # overdue transitions. The *current* schedule can be rewritten, so these
    # rows are review leads, never historical events or evidence of NBKI receipt.
    cur.execute("""SELECT l.id,l.contract_no,f.uid,f.event_time,s.id,
        s.payment_date,s.status,s.payment_amount,s.paid_amount,
        COALESCE((SELECT COUNT(*) FROM loan_payments p
                  WHERE p.loan_id=l.id AND p.payment_date=s.payment_date),0)
        FROM nbki_1c_loan_facts f
        JOIN loans l ON l.id=f.loan_id AND l.org_id=f.org_id
        JOIN loan_schedule s ON s.loan_id=l.id
        WHERE f.org_id=%s AND l.status IN ('active','overdue','holiday')
          AND s.payment_date>f.event_time::date
          AND s.payment_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
          AND s.status NOT IN ('holiday','holiday_pending')
          AND EXISTS (SELECT 1 FROM nbki_event_deals e
              WHERE e.org_id=f.org_id AND e.loan_id=l.id AND e.uid=f.uid
                AND e.role='borrower' AND e.match_status='matched')
        ORDER BY s.payment_date,l.id,s.id""", (org_id,))
    schedule_due_review = []
    today_msk = datetime.now(MOSCOW).date()
    for (loan_id, contract_no, uid, baseline_time, schedule_id, due,
         status, amount, paid, same_day_payments) in cur.fetchall():
        if loan_id not in inspections:
            inspections[loan_id] = inspect_loan(cur, org_id, loan_id)
        if inspections[loan_id]['uid'] != uid:
            continue
        schedule_due_review.append({
            'loan_id': loan_id, 'contract_no': contract_no, 'uid': uid,
            'baseline_event_time': baseline_time.isoformat(),
            'schedule_id': schedule_id, 'due_date': due.isoformat(),
            'current_schedule_status': status,
            'current_payment_amount': str(amount),
            'current_paid_amount': str(paid or 0),
            'same_day_crm_payment_count': same_day_payments,
            'overdue_transition_review_date': (
                (crm_effective_due_date(due) + timedelta(days=1)).isoformat()
                if crm_effective_due_date(due) < today_msk
                and status == 'overdue' and (paid or 0) < amount
                else None),
            'crm_schedule_issues': [issue for issue in
                inspections[loan_id]['checks']['crm_issues']
                if issue.startswith(('Повтор номера платежа графика', 'Дата строки графика'))],
            'event_code_candidate': '2.3', 'event_code_confirmed': False,
            'historical_state_confirmed': False, 'xml_ready': False,
        })
    return {'total': len(rows), 'rows': rows,
            'schedule_due_review_total': len(schedule_due_review),
            'schedule_due_review': schedule_due_review,
            'acceptance_basis': 'operator_assumed',
            'note': ('Однодневные совпадения с датой события не включены. '
                     'Сроки по текущему графику требуют проверки исторического состояния; '
                     'начисления процентов и просрочка вне графика пока не покрыты.')}
