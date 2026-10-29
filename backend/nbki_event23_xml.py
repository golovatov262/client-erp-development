"""CRM-only serializer for individual NBKI GUTDF 5.1 event 2.3 files."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo
import base64
import xml.etree.ElementTree as ET

try:
    from lxml import etree
except ImportError:  # pragma: no cover - deployment dependency is declared
    etree = None

try:
    from nbki_crm_export_facts import payment_event_facts
    from nbki_crm_debt import split_latest_crm_debt, estimate_current_interest
    from nbki_debt_preview import preview_debt
    from nbki_smp import preview_smp
    from nbki_xml_builder import document_xml
except ImportError:
    from backend.nbki_crm_export_facts import payment_event_facts
    from backend.nbki_crm_debt import split_latest_crm_debt, estimate_current_interest
    from backend.nbki_debt_preview import preview_debt
    from backend.nbki_smp import preview_smp
    from backend.nbki_xml_builder import document_xml


XSD_DIR = Path(__file__).resolve().parent / 'nbki_xsd' / '5.1'
CENT = Decimal('0.01')
MSK = ZoneInfo('Europe/Moscow')


def _money(value) -> str:
    return str(Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP))


def _add(parent, tag, value=None):
    node = ET.SubElement(parent, tag)
    if value is not None:
        node.text = str(value)
    return node


def _exists(parent, stem, value):
    _add(parent, f'{stem}_{1 if value else 0}')


def _validate_xsd(raw: bytes) -> None:
    if etree is None:
        raise ValueError('На сервере не установлен lxml для проверки XSD 5.1')
    schema_doc = etree.parse(str(XSD_DIR / 'Main.xsd'), etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False))
    schema = etree.XMLSchema(schema_doc)
    document = etree.fromstring(raw, etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False))
    if not schema.validate(document):
        error = schema.error_log.last_error
        raise ValueError(f'Не удалось проверить XML по XSD 5.1: строка {error.line}: {error.message}')


def _loan_terms(cur, facts):
    terms = facts['loan'].get('terms')
    if not terms or any(terms.get(k) in (None, '') for k in ('deal_code', 'kind_code', 'purpose_code')):
        raise ValueError('В CRM нет кодов типа, вида и цели займа для даты платежа')
    cur.execute("""SELECT psk_percent,psk_amount,calculated_on,verification_status
        FROM loan_psk_calculations WHERE loan_id=%s""", (facts['loan_id'],))
    return terms, cur.fetchone()


def _event(cur, facts, accounting, debt, debt_preview, interest, smp):
    loan, payment, terms = facts['loan'], facts['payment'], facts['loan']['terms']
    event_at = datetime.fromisoformat(facts['event_occurred_at'])
    event = ET.Element('FL_Event_2_3', {
        'operationCode': 'B', 'orderNum': '1',
        'eventDateTime': event_at.isoformat(timespec='seconds'),
    })
    uid_block = _add(event, 'FL_17_DealUid')
    _add(uid_block, 'uid', facts['uid'])
    _add(uid_block, 'num', facts['contract_no'])
    _add(uid_block, 'openDate', loan['start_date'])

    deal = _add(event, 'FL_18_Deal')
    for key, val in (('role', '1'), ('code', terms['deal_code']),
                     ('kindCode', terms['kind_code'])):
        _add(deal, key, val)
    purpose = terms['purpose_code']
    for code in purpose if isinstance(purpose, (list, tuple)) else str(purpose).split(','):
        _add(deal, 'purposeCode', str(code).strip())
    _exists(deal, 'consumerExist', True)
    _exists(deal, 'cardExist', False)
    _exists(deal, 'novationExist', False)
    _exists(deal, 'monetarySourceExist', True)
    _exists(deal, 'monetarySubjectExist', True)
    _add(deal, 'endDate', loan.get('end_date') or '-')
    _add(deal, 'creditorCode', facts['source']['source_code'])
    _exists(deal, 'partialExist', False)
    _exists(deal, 'creditLineExist', False)
    _exists(deal, 'floatRateExist', False)
    _exists(deal, 'partialTransferExist', False)
    _add(deal, 'startDate', loan['start_date'])
    _exists(deal, 'repaymentFact', True)
    _exists(deal, 'transferFact', False)
    _exists(deal, 'partnerFinancingFact', False)

    amount = _add(event, 'FL_19_Amount')
    _add(amount, 'sum', _money(loan['original_principal']))
    _add(amount, 'currency', 'RUB')
    _add(amount, 'calcDate', payment['date'])
    security = _add(event, 'FL_19_1_AmountInfo')
    _add(security, 'securityFact_0')

    cur.execute("""SELECT payment_date,principal_amount,interest_amount,payment_amount,
        COALESCE(paid_amount,0),status FROM loan_schedule
        WHERE loan_id=%s AND payment_date>=%s AND status NOT IN ('holiday','holiday_pending')
        ORDER BY payment_date,id LIMIT 1""", (facts['loan_id'], payment['date']))
    next_row = cur.fetchone()
    payterms = _add(event, 'FL_21_PaymentTerms')
    _add(payterms, 'mainPaySum', _money(next_row[1]) if next_row else '-')
    if next_row:
        _add(payterms, 'mainPayDate', next_row[0].isoformat())
    _add(payterms, 'percentPaySum', _money(next_row[2]) if next_row else '-')
    if next_row:
        _add(payterms, 'percentPayDate', next_row[0].isoformat())
    _add(payterms, 'freqCode', '3')

    psk = loan.get('psk')
    if psk:
        cost = _add(event, 'FL_22_TotalCost')
        for key, value in (('minPercentCost', psk['percent']), ('minCost', psk['amount']),
                           ('calcDate', psk['calculated_on']), ('maxPercentCost', psk['percent']),
                           ('maxCost', psk['amount'])):
            _add(cost, key, value)

    group = _add(event, 'FL_25_26_27_28_Group')
    _add(group, 'lastPayExist_0')
    calc_date = payment['date']
    _add(group, 'calcDate', calc_date)
    due_main = Decimal(debt['term_principal'])
    due_interest = Decimal(interest['remaining_interest_candidate'])
    overdue_main = Decimal(debt['overdue_principal'])
    overdue_interest = Decimal(debt['overdue_interest'])
    penalty = Decimal(debt['penalty_candidate']['remaining'])
    total = due_main + due_interest + penalty + overdue_main + overdue_interest
    _add(group, 'exist_1' if total else 'exist_0')
    if total:
        d = _add(group, 'FL_25_Debt')
        for key, value in (('debtSum', total), ('debtMainSum', due_main + overdue_main),
                           ('debtPercentSum', due_interest + overdue_interest),
                           ('debtOtherSum', penalty), ('currency', 'RUB')):
            _add(d, key, value if key == 'currency' else _money(value))
    if due_main + due_interest + penalty:
        d = _add(group, 'FL_26_DebtDue')
        _add(d, 'debtDueExist_1')
        _add(d, 'debtDueStartDate', loan['start_date'])
        for key, value in (('debtDueSum', due_main + due_interest + penalty),
                           ('debtDueMainSum', due_main), ('debtDuePercentSum', due_interest),
                           ('debtDueOtherSum', penalty)):
            _add(d, key, _money(value))
    else:
        _add(_add(group, 'FL_26_DebtDue'), 'debtDueExist_0')
    overdue = _add(group, 'FL_27_DebtOverdue')
    if overdue_main + overdue_interest:
        _add(overdue, 'missFact_1')
        overdue_dates = [date.fromisoformat(row['due']) for row in debt.get('rows', [])
                         if Decimal(row.get('overdue_principal', '0')) +
                         Decimal(row.get('overdue_interest', '0')) > 0]
        first_overdue = min(overdue_dates).isoformat() if overdue_dates else '-'
        overdue_days = ((date.fromisoformat(payment['date']) - min(overdue_dates)).days
                        if overdue_dates else '-')
        for key, value in (('debtOverdueSum', overdue_main + overdue_interest),
                           ('debtOverdueMainSum', overdue_main),
                           ('debtOverduePercentSum', overdue_interest),
                           ('debtOverdueOtherSum', 0), ('debtOverdueStartDate', first_overdue),
                           ('missDuration', overdue_days), ('repaidMissDuration', 0)):
            _add(overdue, key, _money(value) if key.startswith('debt') else value)
    else:
        _add(overdue, 'missFact_0')
    p = _add(group, 'FL_28_Payment')
    for key, value in (('paymentSum', payment['amount']), ('paymentMainSum', payment['principal']),
                       ('paymentPercentSum', payment['interest']), ('paymentOtherSum', payment['penalty']),
                       ('totalSum', payment['cumulative']['amount']),
                       ('totalMainSum', payment['cumulative']['principal']),
                       ('totalPercentSum', payment['cumulative']['interest']),
                       ('totalOtherSum', payment['cumulative']['penalty']), ('date', payment['date']),
                       ('sizeCode', '-'), ('scheduleCode', '-'), ('payCurrency', 'RUB')):
        _add(p, key, value if key in ('sizeCode', 'scheduleCode', 'payCurrency', 'date') else _money(value))

    if smp and smp.get('value_without_penalty_uncapped') is not None:
        monthly = _add(event, 'FL_29_MonthlyPayment')
        _add(monthly, 'sum', smp['value_without_penalty_uncapped'])
        _add(monthly, 'calcDate', calc_date)
        _add(monthly, 'sumTotal', smp['remaining_schedule_payments'])
    _add(event, 'FL_20_JointDebtors').append(ET.Element('exist_0'))
    _add(event, 'FL_36_1_ProvisionPaymentOffset').append(ET.Element('exist_0'))
    accounting_block = _add(event, 'FL_54_Accounting')
    _add(accounting_block, 'exist_1')
    _add(accounting_block, 'minInterest', _money(loan['rate']))
    _add(accounting_block, 'maxInterest', _money(loan['rate']))
    _add(accounting_block, 'supportExist_0')
    _add(accounting_block, 'calcDate', calc_date)
    _add(accounting_block, 'unaccountedSum', '0.00')
    _add(accounting_block, 'unaccountedCurrency', 'RUB')
    participation = _add(event, 'FL_56_Participation')
    _add(participation, 'role', '1')
    _add(participation, 'kindCode', terms['kind_code'])
    _add(participation, 'uid', facts['uid'])
    _add(participation, 'fundDate', loan['start_date'])
    _add(participation, 'overdueExist_0')
    _add(participation, 'stopExist_0')
    return event


def build_event23_xml(cur, org_id: int, event_id: int) -> dict:
    """Build a one-event file from CRM facts and validate it against XSD 5.1."""
    facts = payment_event_facts(cur, org_id, event_id)
    payment_id = facts['payment_id']
    # The event facts identify the loan through the event table; keep this query CRM-only.
    cur.execute('SELECT loan_id FROM nbki_crm_events WHERE id=%s AND org_id=%s', (event_id, org_id))
    row = cur.fetchone()
    if not row:
        raise ValueError('Событие не найдено')
    loan_id = row[0]
    accounting = facts['accounting']
    if accounting.get('status') != 'checked':
        raise ValueError('Платёж и остаток основного долга не прошли сверку CRM')
    event_date = date.fromisoformat(facts['payment']['date'])
    crm_debt = facts.get('debt_at_posting')
    if not crm_debt or crm_debt.get('status') != 'calculated_from_posting_snapshot':
        crm_debt = split_latest_crm_debt(cur, loan_id, payment_id, event_date,
                                         accounting['principal_after'])
    interest = estimate_current_interest(cur, loan_id, payment_id, event_date,
        latest_payment=crm_debt.get('later_payments', 0) == 0,
        principal_checked=True)
    debt_preview = preview_debt(accounting, crm_debt, interest)
    smp = preview_smp(cur, loan_id, event_date, crm_debt)
    if debt_preview.get('status') != 'candidate_from_crm_components':
        raise ValueError('Не удалось получить согласованный срез долга CRM: ' + '; '.join(debt_preview['issues']))
    if not facts['event_occurred_at']:
        raise ValueError('У события CRM отсутствуют дата и время наступления')
    if not facts['loan'].get('terms'):
        raise ValueError('Для события не найдены действовавшие коды сделки CRM')
    ev = _event(cur, facts, accounting, crm_debt, debt_preview, interest, smp)
    created = datetime.now(timezone.utc)
    reg_number = f"{facts['source']['source_id']}_{created.astimezone(MSK).strftime('%Y%m%d_%H%M%S')}"
    raw, digest = document_xml(facts['source'], [(facts['subject'], [ev])], reg_number, created)
    _validate_xsd(raw)
    return {'file_name': f"NBKI_2_3_{facts['contract_no']}_{event_id}.xml",
            'content_base64': base64.b64encode(raw).decode('ascii'),
            'sha256': digest, 'xsd_version': '5.1', 'xsd_valid': True,
            'business_status': 'candidate_requires_regulatory_review',
            'event_id': event_id, 'contract_no': facts['contract_no'], 'uid': facts['uid'],
            'debt': debt_preview, 'interest': interest, 'smp': smp,
            'psk_status': facts['loan'].get('psk', {}).get('status')}
