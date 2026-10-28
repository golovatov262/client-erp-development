"""Read-only NBKI readiness checks and immutable draft snapshots.

These records are NOT GUTDF documents and cannot be submitted to NBKI. In
particular, assumed MXL acceptance is never treated as a verified receipt.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal

from psycopg2.extras import Json

try:
    from nbki_import import _norm
except ImportError:
    from backend.nbki_import import _norm


def _json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(type(value).__name__)


def summarize_changes(before: dict, after: dict) -> dict:
    """Describe CRM changes without assigning a regulatory GUTDF event type."""
    result = {}
    for section, ignored in (('loan', {'updated_at'}),
                             ('member', {'member_updated_at'})):
        previous = before.get(section) or {}
        current = after.get(section) or {}
        fields = sorted(key for key in set(previous) | set(current)
                        if key not in ignored and previous.get(key) != current.get(key))
        if fields:
            result[section + '_fields'] = fields
    if before.get('uid') != after.get('uid'):
        result['uid_changed'] = True
    for section in ('payments', 'schedule', 'collateral'):
        previous = {str(item['id']): item for item in before.get(section, [])}
        current = {str(item['id']): item for item in after.get(section, [])}
        added = sorted(set(current) - set(previous), key=int)
        removed = sorted(set(previous) - set(current), key=int)
        changed = sorted((key for key in set(previous) & set(current)
                          if {k: v for k, v in previous[key].items() if k != 'updated_at'}
                          != {k: v for k, v in current[key].items() if k != 'updated_at'}), key=int)
        if added or removed or changed:
            result[section] = {'added_ids': added, 'removed_ids': removed,
                               'changed_ids': changed}
    return result


def event_hints(change_summary: dict | None) -> list[dict]:
    """Route changes to review queues, never assert a final GUTDF event code."""
    if not change_summary:
        return []
    hints = []
    mapping = (
        ('payments', 'payment', 'Платёж или изменение записи платежа'),
        ('schedule', 'schedule', 'Изменение графика или исполнения'),
        ('collateral', 'security', 'Изменение обеспечения'),
        ('loan_fields', 'loan_terms', 'Изменение условий или состояния займа'),
        ('member_fields', 'identity', 'Изменение сведений о заёмщике'),
        ('uid_changed', 'uid', 'Изменение УИД: требуется отдельная сверка'),
    )
    for key, category, label in mapping:
        if change_summary.get(key):
            hints.append({'category': category, 'label': label,
                          'gutdf_event_code': None, 'requires_review': True})
    return hints


def source_readiness(snapshot: dict, issues: list[str], changes: dict | None = None) -> dict:
    """Field coverage, distinct from XSD and NBKI business-rule validation."""
    loan = snapshot['loan']
    member = snapshot['member']
    missing = []
    if not snapshot['uid']:
        missing.append('Подтверждённый УИД договора')
    if not loan.get('contract_no'):
        missing.append('Номер договора')
    if not loan.get('start_date'):
        missing.append('Дата заключения договора')
    if not loan.get('end_date'):
        missing.append('Дата окончания договора')
    if loan.get('amount') is None:
        missing.append('Первоначальная сумма займа')
    if member.get('member_type') == 'FL':
        for key, label in (('last_name', 'Фамилия'), ('first_name', 'Имя'),
                           ('birth_date', 'Дата рождения'),
                           ('passport_series', 'Серия паспорта'),
                           ('passport_number', 'Номер паспорта'),
                           ('passport_issue_date', 'Дата выдачи паспорта'),
                           ('passport_issued_by', 'Кем выдан паспорт')):
            if not member.get(key):
                missing.append(label)
    if not member.get('inn'):
        missing.append('ИНН заёмщика')
    # These values cannot be inferred reliably from a current balance or schedule.
    missing.extend((
        'Дата и время фактического события по правилам ГУТДФ',
        'Код вида, назначения и условий сделки для применимого события',
        'Подтверждённый расчёт полной стоимости займа и среднемесячного платежа',
        'Детализация текущей, срочной и просроченной задолженности на дату события',
        'Коды соблюдения размера и срока платежа',
        'Проверка обязательных блоков и условных полей выбранного события',
    ))
    return {'crm_issues': issues, 'missing_fields': missing,
            'event_hints': event_hints(changes),
            'event_code_confirmed': False, 'xsd_validated': False,
            'business_rules_validated': False, 'xml_ready': False}


def inspect_loan(cur, org_id: int, loan_id: int) -> dict:
    cur.execute("""SELECT l.id,l.contract_no,l.amount,l.rate,l.term_months,l.start_date,
        l.end_date,l.balance,l.status,l.updated_at,m.id,m.member_type,m.last_name,
        m.first_name,m.middle_name,m.company_name,m.birth_date,m.birth_place,
        m.passport_series,m.passport_number,m.passport_issue_date,m.passport_issued_by,
        m.registration_address,m.inn,m.updated_at
        FROM loans l JOIN members m ON m.id=l.member_id
        WHERE l.id=%s AND l.org_id=%s""", (loan_id, org_id))
    row = cur.fetchone()
    if row is None:
        raise ValueError('Договор не найден в организации источника')
    keys = ('id','contract_no','amount','rate','term_months','start_date','end_date',
            'balance','status','updated_at','member_id','member_type','last_name',
            'first_name','middle_name','company_name','birth_date','birth_place',
            'passport_series','passport_number','passport_issue_date','passport_issued_by',
            'registration_address','inn','member_updated_at')
    data = dict(zip(keys, row))
    cur.execute("""SELECT uid,match_status,subject_name FROM nbki_deals
        WHERE org_id=%s AND deal_role='borrower'
        AND (loan_id=%s OR contract_no=%s)""",
        (org_id, loan_id, data['contract_no']))
    xml_matches = cur.fetchall()
    cur.execute("""SELECT uid,match_status,subject_name,assumed_accepted
        FROM nbki_event_deals WHERE org_id=%s AND role='borrower'
        AND (loan_id=%s OR contract_no=%s)""",
        (org_id, loan_id, data['contract_no']))
    mxl_matches = cur.fetchall()
    cur.execute("""SELECT id,payment_date,amount,principal_part,interest_part,
        penalty_part,payment_type,description FROM loan_payments WHERE loan_id=%s
        ORDER BY payment_date,id""", (loan_id,))
    payment_keys = ('id','date','amount','principal','interest','penalty','type','description')
    payments = [dict(zip(payment_keys, item)) for item in cur.fetchall()]
    cur.execute("""SELECT id,payment_no,payment_date,payment_amount,principal_amount,
        interest_amount,balance_after,status,paid_amount,paid_date,overdue_days,
        penalty_amount FROM loan_schedule WHERE loan_id=%s ORDER BY payment_no,id""", (loan_id,))
    schedule_keys = ('id','payment_no','payment_date','payment_amount','principal_amount',
                     'interest_amount','balance_after','status','paid_amount','paid_date',
                     'overdue_days','penalty_amount')
    schedule = [dict(zip(schedule_keys, item)) for item in cur.fetchall()]
    cur.execute("""SELECT id,collateral_type,collateral_value,pledger_name,
        description,identifier,nbki_guarantee_uid,nbki_guarantee_amount,
        nbki_guarantee_currency,nbki_guarantee_start,nbki_guarantee_end,
        updated_at FROM loan_collateral WHERE loan_id=%s ORDER BY id""", (loan_id,))
    collateral_keys = ('id','type','value','pledger_name','description','identifier',
                       'guarantee_uid','guarantee_amount','guarantee_currency',
                       'guarantee_start','guarantee_end','updated_at')
    collateral = [dict(zip(collateral_keys, item)) for item in cur.fetchall()]
    name = (' '.join(filter(None, (data['last_name'],data['first_name'],data['middle_name'])))
            if data['member_type'] == 'FL' else data['company_name'])
    issues = []
    eligible = data['status'] in ('active', 'overdue', 'holiday')
    if not eligible:
        issues.append('Закрытый договор исключен из исходящей выгрузки')
    if not data['contract_no'] or not data['amount'] or not data['start_date'] or not data['end_date']:
        issues.append('Неполные реквизиты договора')
    if not name or not data['inn']:
        issues.append('Неполные реквизиты заемщика')
    if data['member_type'] == 'FL':
        for field, label in (('birth_date','дата рождения'),('birth_place','место рождения'),
                             ('passport_series','серия паспорта'),('passport_number','номер паспорта'),
                             ('passport_issue_date','дата выдачи паспорта'),
                             ('passport_issued_by','кем выдан паспорт'),
                             ('registration_address','адрес регистрации')):
            if not data[field]:
                issues.append('Отсутствует ' + label)
    all_matches = [(uid,status,subject) for uid,status,subject in xml_matches]
    all_matches += [(uid,status,subject) for uid,status,subject,_ in mxl_matches]
    if any(status != 'matched' for _,status,_ in all_matches):
        issues.append('Есть УИД с неподтвержденным сопоставлением')
    matched_uids = {uid for uid,status,_ in all_matches if status == 'matched'}
    if len(matched_uids) != 1:
        issues.append('Нет единственного сопоставленного УИД договора')
    if any(_norm(subject) != _norm(name) for _,status,subject in all_matches if status == 'matched'):
        issues.append('Имя заемщика расходится с историческим источником')
    if data['balance'] is None or data['balance'] < 0:
        issues.append('Некорректный остаток займа')
    snapshot = {
        'loan': {key: data[key] for key in ('id','contract_no','amount','rate','term_months',
            'start_date','end_date','balance','status','updated_at')},
        'member': {key: data[key] for key in ('member_id','member_type','last_name',
            'first_name','middle_name','company_name','birth_date','birth_place',
            'passport_series','passport_number','passport_issue_date','passport_issued_by',
            'registration_address','inn','member_updated_at')},
        'uid': next(iter(matched_uids)) if len(matched_uids) == 1 else None,
        'uid_sources': {'xml': [list(x) for x in xml_matches],
                        'mxl': [list(x) for x in mxl_matches]},
        'payments': payments,
        'schedule': schedule,
        'collateral': collateral,
    }
    # Full GUTDF event mapping, XSD and NBKI business rules are deliberately
    # not claimed as passed merely because the CRM fields above are present.
    checks = {'crm_issues': issues, 'scope_eligible': eligible,
              'gutdf_xsd_validated': False,
              'nbki_business_rules_validated': False,
              'receipt_confirmed': False, 'submittable': False}
    readiness = source_readiness(snapshot, issues)
    return {'loan_id': loan_id, 'contract_no': data['contract_no'],
            'uid': snapshot['uid'], 'checks': checks, 'readiness': readiness,
            'snapshot': snapshot}


def readiness_report(cur, org_id: int) -> dict:
    cur.execute("""SELECT id FROM loans WHERE org_id=%s
        AND status IN ('active','overdue','holiday') ORDER BY id""", (org_id,))
    loan_ids = [row[0] for row in cur.fetchall()]
    rows = []
    for loan_id in loan_ids:
        result = inspect_loan(cur, org_id, loan_id)
        rows.append({'loan_id': loan_id, 'contract_no': result['contract_no'],
                     'uid': result['uid'], 'status': result['snapshot']['loan']['status'],
                     'crm_issues': result['checks']['crm_issues'],
                     'missing_fields': result['readiness']['missing_fields'],
                     'xml_ready': False})
    return {'total': len(rows), 'with_uid': sum(bool(row['uid']) for row in rows),
            'with_crm_issues': sum(bool(row['crm_issues']) for row in rows),
            'xml_ready': 0, 'rows': rows}


def create_draft(cur, org_id: int, loan_id: int, user_id: int | None) -> dict:
    cur.execute('SELECT pg_advisory_xact_lock(%s,%s)', (org_id, loan_id))
    cur.execute("""SELECT id,snapshot FROM nbki_outbox_drafts
        WHERE org_id=%s AND loan_id=%s AND status<>'excluded'
        ORDER BY created_at DESC,id DESC LIMIT 1""", (org_id, loan_id))
    previous = cur.fetchone()
    result = inspect_loan(cur, org_id, loan_id)
    if result['snapshot']['loan']['status'] not in ('active', 'overdue', 'holiday'):
        raise ValueError('Закрытый договор исключен из исходящей выгрузки НБКИ')
    encoded = json.dumps(result['snapshot'], default=_json_default,
                         ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    digest = hashlib.sha256(encoded.encode('utf-8')).hexdigest()
    snapshot = json.loads(encoded)
    cur.execute("""INSERT INTO nbki_outbox_drafts
        (org_id,loan_id,snapshot_sha256,snapshot,checks,created_by)
        VALUES (%s,%s,%s,%s,%s,%s)
        ON CONFLICT (org_id,loan_id,snapshot_sha256) DO NOTHING
        RETURNING id""", (org_id, loan_id, digest,
                          Json(snapshot), Json(result['checks']), user_id))
    inserted = cur.fetchone()
    if inserted:
        draft_id = inserted[0]
    else:
        cur.execute("""SELECT id FROM nbki_outbox_drafts WHERE org_id=%s
            AND loan_id=%s AND snapshot_sha256=%s""", (org_id, loan_id, digest))
        draft_id = cur.fetchone()[0]
    candidate_created = False
    if inserted and previous and result['uid']:
        changes = summarize_changes(previous[1], snapshot)
        if changes:
            cur.execute("""INSERT INTO nbki_change_candidates
                (org_id,loan_id,uid,from_draft_id,to_draft_id,change_summary)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (org_id,loan_id,from_draft_id,to_draft_id) DO NOTHING
                RETURNING id""", (org_id, loan_id, result['uid'], previous[0],
                                  draft_id, Json(changes)))
            candidate_created = cur.fetchone() is not None
    return {'id': draft_id, 'snapshot_sha256': digest,
            'contract_no': result['contract_no'], 'checks': result['checks'],
            'readiness': result['readiness'],
            'submittable': False, 'created': bool(inserted),
            'change_candidate_created': candidate_created}


def create_all_drafts(cur, org_id: int, user_id: int | None) -> dict:
    cur.execute("""SELECT id FROM loans WHERE org_id=%s
        AND status IN ('active','overdue','holiday') ORDER BY id""", (org_id,))
    loan_ids = [row[0] for row in cur.fetchall()]
    if len(loan_ids) > 500:
        raise ValueError('Для пакетного черновика выберите не более 500 займов')
    created = 0
    with_issues = 0
    change_candidates = 0
    for loan_id in loan_ids:
        result = create_draft(cur, org_id, loan_id, user_id)
        created += bool(result['created'])
        with_issues += bool(result['checks']['crm_issues'])
        change_candidates += bool(result['change_candidate_created'])
    return {'total': len(loan_ids), 'created': created,
            'unchanged': len(loan_ids) - created, 'with_crm_issues': with_issues,
            'change_candidates': change_candidates, 'submittable': 0}


def list_change_candidates(cur, org_id: int) -> dict:
    cur.execute("""SELECT COUNT(*) FROM nbki_change_candidates c
        JOIN loans l ON l.id=c.loan_id WHERE c.org_id=%s
        AND l.status IN ('active','overdue','holiday')""", (org_id,))
    total = cur.fetchone()[0]
    cur.execute("""SELECT c.id,c.loan_id,l.contract_no,c.uid,c.change_summary,
        c.status,c.created_at,c.from_draft_id,c.to_draft_id
        FROM nbki_change_candidates c JOIN loans l ON l.id=c.loan_id
        WHERE c.org_id=%s AND l.status IN ('active','overdue','holiday')
        ORDER BY c.created_at DESC,c.id DESC LIMIT 100""", (org_id,))
    keys = ('id','loan_id','contract_no','uid','change_summary','status',
            'created_at','from_draft_id','to_draft_id')
    return {'total': total, 'rows': [{**dict(zip(keys, row)),
            'created_at': row[6].isoformat()} for row in cur.fetchall()]}


def list_drafts(cur, org_id: int) -> list[dict]:
    cur.execute("""SELECT d.id,d.loan_id,l.contract_no,d.snapshot_sha256,
        d.checks,CASE WHEN l.status='closed' THEN 'excluded' ELSE d.status END,
        d.created_at FROM nbki_outbox_drafts d
        JOIN loans l ON l.id=d.loan_id WHERE d.org_id=%s
        ORDER BY d.created_at DESC,d.id DESC LIMIT 100""", (org_id,))
    keys = ('id','loan_id','contract_no','snapshot_sha256','checks','status','created_at')
    return [{**dict(zip(keys, row)), 'created_at': row[-1].isoformat()}
            for row in cur.fetchall()]
