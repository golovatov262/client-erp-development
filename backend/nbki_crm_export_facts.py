"""Assemble outgoing payment facts exclusively from CRM accounting tables.

This is the stable input model for the GUTDF serializer. Historical imported
files are not read and never override a CRM amount or event timestamp.
"""

from __future__ import annotations

from decimal import Decimal

try:
    from nbki_accounting_snapshot import (build_accounting_snapshot,
                                          audit_payment_allocations)
    from nbki_crm_debt import split_posting_snapshot_debt
except ImportError:
    from backend.nbki_accounting_snapshot import (build_accounting_snapshot,
                                                  audit_payment_allocations)
    from backend.nbki_crm_debt import split_posting_snapshot_debt


def payment_event_facts(cur, org_id: int, event_id: int) -> dict:
    cur.execute("""SELECT e.loan_id,e.source_id,e.event_occurred_at,
        e.evidence_sha256,l.contract_no,l.amount,l.balance,l.status,
        l.rate,l.start_date,l.end_date,l.schedule_type,
        m.id,m.last_name,m.first_name,m.middle_name,m.birth_date,m.inn,
        m.passport_series,m.passport_number,m.passport_issue_date,
        m.passport_issued_by,m.passport_dept_code,m.registration_address,
        o.inn,o.ogrn,o.name,o.short_name
        FROM nbki_crm_events e JOIN loans l ON l.id=e.loan_id
        JOIN members m ON m.id=l.member_id
        JOIN organizations o ON o.id=l.org_id
        WHERE e.id=%s AND e.org_id=%s AND e.source_type='loan_payment'""",
        (event_id, org_id))
    row = cur.fetchone()
    if row is None:
        raise ValueError('Событие платежа CRM не найдено')
    (loan_id,payment_id,occurred_at,digest,contract_no,original,balance,status,
     rate,start_date,end_date,schedule_type,member_id,last_name,first_name,
     middle_name,birth_date,member_inn,passport_series,passport_number,
     passport_issue_date,passport_issued_by,passport_dept_code,
     registration_address,org_inn,org_ogrn,org_name,org_short_name) = row
    if status not in ('active','overdue','holiday'):
        raise ValueError('Закрытый договор исключён из исходящей выгрузки')
    cur.execute("""SELECT DISTINCT uid FROM (
        SELECT uid FROM nbki_event_deals WHERE org_id=%s AND loan_id=%s
            AND role='borrower' AND match_status='matched'
        UNION ALL
        SELECT uid FROM nbki_deals WHERE org_id=%s AND loan_id=%s
            AND deal_role='borrower' AND match_status='matched'
        ) matched WHERE uid IS NOT NULL""", (org_id, loan_id, org_id, loan_id))
    uids = [value[0] for value in cur.fetchall()]
    if len(uids) != 1:
        raise ValueError('Для исходящей выгрузки нужен один сопоставленный УИД')
    cur.execute("""SELECT id,payment_date,amount,principal_part,interest_part,
        penalty_part,engine_version FROM loan_payments WHERE loan_id=%s
        ORDER BY payment_date,id""", (loan_id,))
    payments = cur.fetchall()
    target = next((item for item in payments if item[0] == payment_id), None)
    if target is None:
        raise ValueError('Первичный платёж CRM не найден')
    accounting = build_accounting_snapshot(original, balance, payments, payment_id)
    cur.execute("""SELECT evidence_sha256,evidence FROM nbki_payment_posting_snapshots
        WHERE payment_id=%s AND loan_id=%s""", (payment_id, loan_id))
    frozen = cur.fetchone()
    if frozen and digest and frozen[0].strip() != digest.strip():
        raise ValueError('Контрольная сумма события и снимка платежа расходится')
    cur.execute("""SELECT a.id,a.schedule_id,a.component,a.amount,
        a.allocation_mode,s.loan_id FROM loan_payment_allocations a
        LEFT JOIN loan_schedule s ON s.id=a.schedule_id
        WHERE a.payment_id=%s ORDER BY a.id""", (payment_id,))
    allocation = audit_payment_allocations(target, cur.fetchall(), loan_id)
    debt_at_posting = (split_posting_snapshot_debt(
        frozen[1], frozen[0].strip(), loan_id, payment_id, target[1])
        if frozen else None)
    cur.execute("""SELECT psk_percent,psk_amount,calculated_on,
        verification_status FROM loan_psk_calculations WHERE loan_id=%s""",
        (loan_id,))
    psk = cur.fetchone()
    cur.execute("""SELECT source_id,source_code,registration_date,
        registration_number,creditor_code FROM nbki_source_settings
        WHERE org_id=%s""", (org_id,))
    source = cur.fetchone()
    cur.execute("""SELECT deal_code,kind_code,purpose_code,
        interest_day_basis,annual_rate,valid_from,basis
        FROM nbki_loan_terms_versions WHERE loan_id=%s AND valid_from<=%s
        AND (valid_until IS NULL OR valid_until>%s)
        ORDER BY valid_from DESC,id DESC LIMIT 1""",
        (loan_id, occurred_at, occurred_at)) if occurred_at else None
    terms = cur.fetchone() if occurred_at else None
    cur.execute("""SELECT COALESCE(SUM(a.amount),0) FROM loan_payment_allocations a
        WHERE a.payment_id=%s AND a.component='unapplied'""", (payment_id,))
    unapplied = cur.fetchone()[0]
    payment_date = target[1]
    prior = [item for item in payments if (item[1], item[0]) <= (payment_date, payment_id)]
    cumulative = {name: str(sum((Decimal(str(item[index])) for item in prior), Decimal('0')))
                  for name, index in (('amount', 2), ('principal', 3),
                                      ('interest', 4), ('penalty', 5))
                  if all(item[index] is not None for item in prior)}
    return {
        'event_id': event_id, 'event_code': '2.3', 'payment_id': payment_id,
        'loan_id': loan_id,
        'event_occurred_at': occurred_at.isoformat() if occurred_at else None,
        'uid': uids[0], 'contract_no': contract_no,
        'source': {'org_id': org_id, 'inn': org_inn, 'ogrn': org_ogrn,
                   'name': org_name, 'short_name': org_short_name,
                   'source_id': source[0] if source else None,
                   'source_code': source[1] if source else None,
                   'registration_date': source[2].isoformat() if source and source[2] else None,
                   'registration_number': source[3] if source else None,
                   'creditor_code': source[4] if source else None},
        'subject': {'member_id': member_id, 'last_name': last_name,
                    'first_name': first_name, 'middle_name': middle_name,
                    'birth_date': birth_date.isoformat() if birth_date else None,
                    'inn': member_inn, 'passport_series': passport_series,
                    'passport_number': passport_number,
                    'passport_issue_date': passport_issue_date.isoformat() if passport_issue_date else None,
                    'passport_issued_by': passport_issued_by,
                    'passport_dept_code': passport_dept_code,
                    'registration_address': registration_address},
        'loan': {'original_principal': str(original), 'current_principal': str(balance),
                 'rate': str(rate), 'start_date': start_date.isoformat(),
                 'end_date': end_date.isoformat() if end_date else None,
                 'schedule_type': schedule_type,
                 'terms': {'deal_code': terms[0], 'kind_code': terms[1],
                           'purpose_code': terms[2], 'interest_day_basis': terms[3],
                           'annual_rate': str(terms[4]) if terms[4] is not None else None,
                           'valid_from': terms[5].isoformat(), 'basis': terms[6]}
                          if terms else None,
                 'psk': {'percent': str(psk[0]), 'amount': str(psk[1]),
                         'calculated_on': psk[2].isoformat(), 'status': psk[3]}
                        if psk else None},
        'payment': {'date': payment_date.isoformat(), 'amount': str(target[2]),
                    'principal': str(target[3]), 'interest': str(target[4]),
                    'penalty': str(target[5]), 'unapplied': str(unapplied),
                    'cumulative': cumulative, 'engine_version': target[6]},
        'accounting': accounting,
        'allocation': allocation,
        'debt_at_posting': debt_at_posting,
        'posting_snapshot_sha256': frozen[0].strip() if frozen else None,
    }
