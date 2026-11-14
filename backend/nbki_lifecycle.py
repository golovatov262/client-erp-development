"""Dated CRM operations and immutable evidence for non-payment BKI events.

Recording never commits: the caller owns the business-operation transaction.
Only current-day operations can use current mutable accounting state.
"""
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo
import base64
import copy
import hashlib
import json
import xml.etree.ElementTree as ET
from psycopg2.extras import Json

MSK = ZoneInfo('Europe/Moscow')
XSD = Path(__file__).parent / 'nbki_xsd' / '5.1'
KINDS = {'close': 'FL_Event_2_5', 'terms_change': 'FL_Event_2_1',
         'debt_change': 'FL_Event_2_3', 'collateral_change': 'FL_Event_2_4',
         'guarantor_change': 'FL_Event_2_1', 'guarantor_debt_change': 'FL_Event_2_3'}


def references():
    tree = ET.parse(XSD / 'ReferencesTypes.xsd')
    ns = {'x': 'http://www.w3.org/2001/XMLSchema'}
    result = {}
    for key, name in [('closure', 'refGroundTerminationObligationType'),
                      ('collateral', 'refReasonTerminationCollateralType'),
                      ('provision', 'refCollateralUsageType'),
                      ('change', 'refContractChangeType'),
                      ('special_change', 'refSpecialContractChangeType')]:
        node = tree.find(f"x:simpleType[@name='{name}']", ns)
        result[key] = [{'code': e.get('value'), 'label': ''.join(e.find('x:annotation/x:documentation', ns).itertext()).strip()}
                       for e in node.findall('.//x:enumeration', ns)]
    return result


def encoded(value):
    return json.dumps(value, default=str, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def checksum(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def capture(cur, loan_id, occurred_at):
    """Snapshot all input rows before any legal-closure mutation."""
    data = {'occurred_at': occurred_at.isoformat()}
    for key, query in (
        ('loan', 'SELECT row_to_json(l) FROM loans l WHERE id=%s'),
        ('subject', 'SELECT row_to_json(m) FROM members m JOIN loans l ON l.member_id=m.id WHERE l.id=%s'),
        ('organization', 'SELECT row_to_json(o) FROM organizations o JOIN loans l ON l.org_id=o.id WHERE l.id=%s'),
        ('settings', 'SELECT row_to_json(s) FROM nbki_source_settings s JOIN loans l ON l.org_id=s.org_id WHERE l.id=%s'),
        ('fields', 'SELECT row_to_json(f) FROM loan_bki_fields f WHERE loan_id=%s'),
        ('psk', 'SELECT row_to_json(p) FROM loan_psk_calculations p WHERE loan_id=%s'),
        ('report_blocks', 'SELECT row_to_json(b) FROM nbki_loan_report_blocks b WHERE loan_id=%s')):
        cur.execute(query, (loan_id,))
        row = cur.fetchone()
        data[key] = row[0] if row else None
    for key, table, order in [('payments', 'loan_payments', 'payment_date,id'),
                               ('schedule', 'loan_schedule', 'payment_date,id'),
                               ('collateral', 'loan_collateral', 'id')]:
        cur.execute(f'SELECT row_to_json(t) FROM {table} t WHERE loan_id=%s ORDER BY {order}', (loan_id,))
        data[key] = [r[0] for r in cur.fetchall()]
    if __package__:
        from .nbki_uid import authoritative_borrower_uid
        from .nbki_crm_export_facts import _loan_terms_for_event
    else:
        from nbki_uid import authoritative_borrower_uid
        from nbki_crm_export_facts import _loan_terms_for_event
    l = data['loan']
    terms = _loan_terms_for_event(cur,l['org_id'],loan_id,occurred_at)
    if terms:
        data['fields'] = dict(data['fields'] or {}, **dict(zip(('deal_code','kind_code','purpose_code','interest_day_basis','annual_rate','valid_from','basis'), terms)))
    data['uid'], _ = authoritative_borrower_uid(cur, l['org_id'], loan_id, l['contract_no'], (data['fields'] or {}).get('loan_uid'))
    for row in data['collateral']:
        member_id = row.get('nbki_guarantor_member_id')
        if member_id:
            cur.execute('SELECT row_to_json(m) FROM members m WHERE id=%s', (member_id,))
            member = cur.fetchone()
            row['subject'] = member[0] if member else None
    return data


def facts_from_snapshot(s):
    l, m, o, settings = s['loan'], s['subject'], s['organization'], s['settings'] or {}
    fields = s['fields'] or {}
    if not s['uid']:
        raise ValueError('Не установлен подтверждённый УИД займа')
    if not all(fields.get(k) for k in ('deal_code', 'kind_code', 'purpose_code')):
        raise ValueError('Не заполнены коды сделки, вида займа и цели в карточке БКИ')
    when = datetime.fromisoformat(s['occurred_at']).astimezone(MSK).date().isoformat()
    payments = s['payments']
    event_at = datetime.fromisoformat(s['occurred_at'])
    if date.fromisoformat(l['start_date']) > event_at.astimezone(MSK).date():
        raise ValueError('Дата события предшествует договору')
    for p in payments:
        if p['payment_date'] == when:
            payment_time = p.get('nbki_event_occurred_at') or p.get('created_at')
            if payment_time:
                known_at = datetime.fromisoformat(payment_time)
                if known_at.tzinfo is None:
                    known_at = known_at.replace(tzinfo=MSK)
                if known_at.replace(microsecond=0) > event_at:
                    raise ValueError('После указанного времени уже есть платёж; текущий срез не соответствует моменту операции')
    if any(p['payment_date'] > when for p in payments):
        raise ValueError('После даты операции имеются платежи: необходим исторический снимок')
    if any(p.get(k) is None for p in payments for k in ('amount','principal_part','interest_part','penalty_part')):
        raise ValueError('Не заполнены составляющие платежей CRM')
    cumulative = {k: str(sum((Decimal(str(p[col])) for p in payments), Decimal(0)))
                  for k, col in [('amount','amount'),('principal','principal_part'),('interest','interest_part'),('penalty','penalty_part')]}
    principal = Decimal(str(l['amount'])) - Decimal(cumulative['principal'])
    if principal < 0 or abs(principal - Decimal(str(l['balance']))) > Decimal('.01'):
        raise ValueError('Основной долг: сумма займа минус платежи не совпадает с карточкой CRM')
    last = payments[-1] if payments else {}
    psk = s['psk']
    facts = {'loan_id': l['id'], 'uid': s['uid'], 'contract_no': l['contract_no'],
             'event_occurred_at': s['occurred_at'],
             'subject': m, 'source': dict(o, **{k: v for k,v in settings.items() if k not in o}),
             'loan': dict(l, original_principal=str(l['amount']), current_principal=str(principal),
                          terms=fields, report_blocks=s['report_blocks'],
                          psk={'percent': format(Decimal(str(psk['psk_percent'])), '.3f'), 'amount': format(Decimal(str(psk['psk_amount'])), '.2f'),
                               'calculated_on': psk['calculated_on'], 'status': psk['verification_status']} if psk else None),
             'payment': {'date': when, 'last_payment_date': last.get('payment_date', '-'),
                         'amount': str(last.get('amount', 0)), 'principal': str(last.get('principal_part', 0)),
                         'interest': str(last.get('interest_part', 0)), 'penalty': str(last.get('penalty_part', 0)),
                         'cumulative': cumulative}}
    return facts, principal


class ScheduleCursor:
    """The serializer's next-payment lookup over the operation's frozen schedule."""
    def __init__(self, snapshot, include_due_today=False):
        self.snapshot = snapshot
        self.include_due_today = include_due_today
    def execute(self, sql, params):
        if 'FROM loan_schedule' not in sql or 'LIMIT 1' not in sql:
            raise ValueError('Неподдерживаемый запрос к снимку операции')
        self.rows = [r for r in self.snapshot['schedule'] if (r['payment_date'] >= params[1] if self.include_due_today else r['payment_date'] > params[1])
                     and r['status'] not in ('holiday','holiday_pending')]
    def fetchone(self):
        if not self.rows:
            return None
        r = self.rows[0]
        return (date.fromisoformat(r['payment_date']), r['principal_amount'], r['interest_amount'],
                r['payment_amount'], r['paid_amount'], r['status'])


def debt_evidence(cur, s, principal):
    if __package__:
        from .nbki_crm_debt import split_latest_crm_debt, estimate_current_interest
        from .nbki_debt_preview import preview_debt
        from .nbki_smp import preview_smp
    else:
        from nbki_crm_debt import split_latest_crm_debt, estimate_current_interest
        from nbki_debt_preview import preview_debt
        from nbki_smp import preview_smp
    day = datetime.fromisoformat(s['occurred_at']).astimezone(MSK).date()
    loan_id = s['loan']['id']
    # Upper bound includes all actual payments of this day; no synthetic payment is stored.
    cutoff = 9223372036854775807
    debt = split_latest_crm_debt(cur, loan_id, cutoff, day, principal)
    interest = estimate_current_interest(cur, loan_id, cutoff, day, latest_payment=True,
                                         principal_checked=True, require_target=False)
    accounting = {'status': 'checked', 'principal_after': str(principal)}
    if debt.get('penalty_candidate') and Decimal(str(debt['penalty_candidate'].get('remaining', '-1'))) == 0:
        debt['penalty_candidate']['due_classification'] = 'term_until_final_scheduled_payment'
    preview = preview_debt(accounting, debt, interest)
    if preview['status'] != 'candidate_from_crm_components':
        raise ValueError('Не подтверждён срез задолженности: ' + '; '.join(dict.fromkeys(debt.get('issues', []) + interest.get('issues', []) + preview.get('issues', []))))
    smp = preview_smp(cur, loan_id, day, debt)
    return {'as_of':day.isoformat(), 'debt': debt, 'interest': interest, 'preview': preview, 'smp': smp, 'accounting': accounting}


def add(parent, name, value=None):
    node = ET.SubElement(parent, name)
    if value is not None:
        node.text = str(value)
    return node


def required(row, key):
    value = row.get(key)
    if value in (None, ''):
        raise ValueError(f'Обеспечение №{row.get("id")}: не заполнено {key}')
    return value


def collateral_event(s, reason=None, provision_payment=None):
    ev = ET.Element('FL_Event_2_4', operationCode='B', orderNum='1', eventDateTime=s['occurred_at'])
    uid = add(ev, 'FL_17_DealUid')
    for k,v in [('uid',s['uid']),('num',s['loan']['contract_no']),('openDate',s['loan']['start_date'])]:
        add(uid,k,v)
    day = s['occurred_at'][:10]
    pledges = [r for r in s['collateral'] if r['collateral_type'] != 'Поручительство']
    warranties = [r for r in s['collateral'] if r['collateral_type'] == 'Поручительство']
    if not pledges:
        add(add(ev,'FL_32_35_Group'),'assetKind_0')
    for row in pledges:
        group = add(ev,'FL_32_35_Group')
        add(group,'assetKind_1')
        add(group,'propertyId',required(row,'identifier'))
        block = add(group,'FL_32_Collateral')
        for tag,key in [('code','nbki_collateral_code'),('startDate','nbki_collateral_start')]:
            add(block,tag,required(row,key))
        amount = add(block,'Sum_group_FL_32_35_Group')
        add(amount,'sum',format(Decimal(str(required(row,'nbki_collateral_sum'))), '.2f'))
        add(amount,'currency',required(row,'nbki_collateral_currency'))
        if row.get('nbki_assess_date'):
            add(amount,'assessDate',row['nbki_assess_date'])
        add(amount,'priceCode',required(row,'nbki_price_code'))
        if row.get('nbki_collateral_end'):
            add(block,'collateralEndDate',row['nbki_collateral_end'])
        if reason or row.get('nbki_termination_reason'):
            add(block,'collateralFactEndDate',day if reason else row['nbki_termination_date'])
            add(block,'endReason',reason or row['nbki_termination_reason'])
        for tag,key in [('contractTotalSum','nbki_contract_total_sum'),('contractCount','nbki_contract_count')]:
            add(block,tag,format(Decimal(str(required(row,key))), '.2f') if tag=='contractTotalSum' else required(row,key))
        if row.get('nbki_location'):
            add(block,'location',row['nbki_location'])
        if row.get('nbki_actual_cost') is not None:
            for tag,key in [('actualCost','nbki_actual_cost'),('calcDate','nbki_calc_date'),('actualPriceCode','nbki_actual_price_code')]:
                add(block,tag,format(Decimal(str(required(row,key))), '.2f') if tag=='actualCost' else required(row,key))
        # These legally meaningful flags require explicit source evidence.
        for key,tag in [('nbki_acquired','acquiredExist'),('nbki_inhabited','inhabitedExist')]:
            if row.get(key) is None:
                raise ValueError(f'Залог №{row["id"]}: подтвердите признак {tag}')
            add(block,tag + ('_1' if row[key] else '_0'))
        insurance = add(group,'FL_35_Insurance')
        if row.get('nbki_insured') is False:
            add(insurance,'exist_0')
        elif row.get('nbki_insured') is True:
            add(insurance,'exist_1')
            franchise = row.get('nbki_insurance_franchise')
            if franchise is None:
                raise ValueError('Подтвердите наличие франшизы страхования залога')
            add(insurance,'franchiseExist_1' if franchise else 'franchiseExist_0')
            add(insurance,'startDate',required(row,'nbki_insurance_start'))
            add(insurance,'insuranceEndDate',required(row,'nbki_insurance_end'))
        else:
            raise ValueError(f'Залог №{row["id"]}: нужны подтверждённые сведения о страховании')
    if not warranties:
        add(add(ev,'FL_33_Warranty'),'warrantyFact_0')
    for row in warranties:
        block = add(ev,'FL_33_Warranty')
        add(block,'warrantyFact_1')
        for tag,key in [('uid','nbki_guarantee_uid'),('sum','nbki_guarantee_amount'),('currency','nbki_guarantee_currency'),('openDate','nbki_guarantee_start'),('endDate','nbki_guarantee_end')]:
            add(block,tag,format(Decimal(str(required(row,key))), '.2f') if tag=='sum' else required(row,key))
        if reason or row.get('nbki_termination_reason'):
            add(block,'factEndDate',day if reason else row['nbki_termination_date'])
            add(block,'endCode',reason or row['nbki_termination_reason'])
    add(add(ev,'FL_34_Guarantee'),'exist_0')
    provision = add(ev,'FL_36_ProvisionPayment')
    if reason == '2':
        value = provision_payment or {}
        if not all(value.get(k) for k in ('code','date','sum','currency')):
            raise ValueError('Погашение за счёт обеспечения требует суммы, даты и вида использованного обеспечения')
        if value['code'] not in {r['code'] for r in references()['provision']}:
            raise ValueError('Неизвестный вид использованного обеспечения')
        amount = Decimal(str(value['sum']))
        if not amount.is_finite() or amount<=0 or date.fromisoformat(value['date'])>date.fromisoformat(day):
            raise ValueError('Проверьте сумму и дату погашения за счёт обеспечения')
        add(provision,'exist_1')
        for key in ('code','date','sum','currency'):
            add(provision,key,format(amount,'.2f') if key=='sum' else value[key])
    else:
        add(provision,'exist_0')
    return ev


def obligation_event(payload):
    if __package__:
        from .nbki_event23_xml import _event
    else:
        from nbki_event23_xml import _event
    s, facts, evidence = payload['snapshot'], payload['facts'], payload['debt_evidence']
    ev = _event(ScheduleCursor(s,payload.get('include_due_today',False)), facts, evidence['accounting'], evidence['debt'],
                evidence['preview'], evidence['interest'], evidence['smp'])
    payment = ev.find('./FL_25_26_27_28_Group/FL_28_Payment/date')
    if facts['payment']['last_payment_date'] == '-':
        ev.find('./FL_25_26_27_28_Group/FL_28_Payment').remove(payment)
    else:
        payment.text = facts['payment']['last_payment_date']
    name = payload['event_name']
    if name == 'FL_Event_2_3':
        return ev
    ev.tag = name
    if name == 'FL_Event_2_5':
        for child in list(ev):
            if child.tag in ('FL_20_JointDebtors','FL_36_1_ProvisionPaymentOffset','FL_54_Accounting','FL_55_Application'):
                ev.remove(child)
        participation = ev.find('FL_56_Participation')
        ev.remove(participation)
        block = add(ev,'FL_38_ContractEnd')
        add(block,'date',s['occurred_at'][:10])
        add(block,'code',payload['reason_code'])
        participation.remove(participation.find('stopExist_0'))
        add(participation,'stopExist_1')
        ev.append(participation)
        monthly = ev.find('FL_29_MonthlyPayment')
        if monthly is not None:
            monthly.find('sum').text = '0'
            monthly.find('sumTotal').text = '0.00'
        terms = ev.find('FL_21_PaymentTerms')
        terms.clear()
        for tag,value in [('mainPaySum','0.00'),('percentPaySum','0.00'),('freqCode','3')]:
            add(terms,tag,value)
    elif name == 'FL_Event_2_1':
        for tag in ('FL_36_1_ProvisionPaymentOffset','FL_55_Application'):
            child = ev.find(tag)
            if child is not None:
                ev.remove(child)
        changes = payload.get('changes') or {}
        if not changes.get('code') or not changes.get('specialCode'):
            raise ValueError('Для изменения условий укажите вид и специальный код изменения договора')
        block = ET.Element('FL_23_ContractChanges')
        add(block,'exist_1')
        for tag,value in [('changeDate',s['occurred_at'][:10]),('code',changes['code']),('specialCode',changes['specialCode']),
                          ('otherDesc',payload['basis']),('startDate',s['occurred_at'][:10]),('endDate',changes.get('endDate') or '-')]:
            add(block,tag,value)
        idx = list(ev).index(ev.find('FL_54_Accounting'))
        ev.insert(idx,block)
        block2 = ET.Element('FL_23_1_ContractTermsChanges')
        add(block2,'changeFact_0')
        ev.insert(idx+1,block2)
    return ev


def build_lifecycle_xml(cur, org_id, event_id, row, *, bureau="nbki"):
    if __package__:
        from .nbki_xml_builder import document_xml
        from .nbki_event23_xml import _validate_xsd, generation_readiness
        from .nbki_delivery import check_delivery
    else:
        from nbki_xml_builder import document_xml
        from nbki_event23_xml import _validate_xsd, generation_readiness
        from nbki_delivery import check_delivery
    if bureau == 'okb':
        if __package__: from .okb_delivery import check_delivery
        else: from okb_delivery import check_delivery
    elif bureau != 'nbki': raise ValueError('Неизвестное бюро')
    payload, digest = row
    if checksum(payload) != digest.strip():
        raise ValueError('Контрольная сумма снимка операции не совпала')
    if payload.get('financial_reconstruction_required'):
        raise ValueError('Дата платежа изменена: требуется восстановление финансового снимка начислений')
    if payload.get('time_pending'):
        raise ValueError('Для начислений до платежа нужно подтвердить точное время платежа CRM')
    if payload.get('blockers'):
        raise ValueError('; '.join(payload['blockers']))
    if payload.get('guarantor') and not payload['guarantor'].get('subject'):
        raise ValueError('Не установлена карточка субъекта-поручителя')
    if payload['event_name']=='FL_Event_2_3' and not payload.get('guarantor'):
        if __package__:
            from .nbki_debt_changes import require_debt_change
        else:
            from nbki_debt_changes import require_debt_change
        require_debt_change(cur,org_id,payload,event_id)
    payload = prepare_guarantor_payload(payload) if payload.get('guarantor') else payload
    s = payload['snapshot']
    facts = copy.deepcopy(payload['facts'])
    event = (collateral_event(s, payload.get('collateral_reason_code'), payload.get('provision_payment'))
             if payload['event_name'] == 'FL_Event_2_4' else obligation_event(payload))
    if payload.get('guarantor'):
        g = payload['guarantor']

        facts['subject'] = g['subject']
        facts['uid'] = required(g,'nbki_guarantee_uid')
        facts['contract_no'] = required(g,'nbki_guarantee_contract_no')
        for block in ('FL_17_DealUid','FL_56_Participation'):
            event.find(block+'/uid').text = facts['uid']
        event.find('FL_17_DealUid/num').text = facts['contract_no']
        event.find('FL_17_DealUid/openDate').text = required(g,'nbki_guarantee_start')
        deal = event.find('FL_18_Deal')
        deal.find('role').text = '2'
        deal.find('code').text = '9'
        deal.find('startDate').text = required(g,'nbki_guarantee_start')
        deal.find('endDate').text = required(g,'nbki_guarantee_end')
        for stem in ('consumerExist',):
            node = deal.find(stem+'_1')
            if node is not None:
                node.tag = stem+'_0'
        terms = event.find('FL_21_PaymentTerms')
        terms.clear()
        for key,value in [('mainPaySum','-'),('percentPaySum','-')]:
            add(terms,key,value)
        event.find('FL_19_Amount/sum').text = format(Decimal(str(required(g,'nbki_guarantee_amount'))), '.2f')
        event.find('FL_19_Amount/currency').text = required(g,'nbki_guarantee_currency')
        info = event.find('FL_19_1_AmountInfo')
        info.clear()
        add(info,'securityFact_1')
        for k,v in [('securitySum',format(Decimal(str(s['loan']['amount'])), '.2f')),('securityCurrency','RUB'),('securityTypeCode','1'),
                    ('calcDate',s['occurred_at'][:10]),('securityUid',s['uid'])]:
            add(info,k,v)
        cost = event.find('FL_22_TotalCost')
        if cost is not None:
            event.remove(cost)
        event.find('FL_56_Participation/role').text = '2'
        event.find('FL_56_Participation/fundDate').text = required(g,'nbki_guarantee_start')
    created = datetime.now(MSK)
    reg = f"{facts['source']['source_id']}_{created.strftime('%Y%m%d_%H%M%S')}"
    raw, sha = document_xml(facts['source'], [(facts['subject'], [event])], reg, created)
    validation = _validate_xsd(raw)
    check_delivery(cur,org_id,event_id,raw)
    return {'file_name':reg+'.xml','content_base64':base64.b64encode(raw).decode(),
            'sha256':sha,'xsd_version':'5.1',**validation,'readiness':generation_readiness(validation),
            'event_id':event_id,'uid':facts['uid'],'contract_no':facts['contract_no']}


def record_operation(cur, org_id, loan_id, body, *, before_snapshot=None):
    kind = body.get('kind')
    if kind not in KINDS:
        raise ValueError('Неизвестный вид события')
    basis = str(body.get('basis') or '').strip()
    if not basis or len(basis) > 256:
        raise ValueError('Укажите основание операции (до 256 символов)')
    try:
        at = datetime.fromisoformat(body['occurred_at'])
        if at.tzinfo is None:
            at = at.replace(tzinfo=MSK)
        at = at.astimezone(MSK).replace(microsecond=0)
    except (KeyError,TypeError,ValueError):
        raise ValueError('Укажите дату и точное время операции (МСК)')
    now = datetime.now(MSK)
    if at.date() != now.date() or at > now:
        raise ValueError('Текущий срез CRM можно фиксировать только на сегодня, не в будущем; для прошлой даты необходим исторический снимок')
    cur.execute('SELECT id FROM loans WHERE id=%s AND org_id=%s FOR UPDATE', (loan_id,org_id))
    if not cur.fetchone():
        raise ValueError('Займ организации не найден')
    cur.execute('SELECT id FROM nbki_lifecycle_operations WHERE loan_id=%s AND kind=%s AND occurred_at=%s AND basis=%s', (loan_id,kind,at,basis))
    existing = cur.fetchone()
    if existing:
        cur.execute('SELECT COUNT(*) FROM nbki_crm_events WHERE operation_id=%s', (existing[0],))
        return {'success':True,'operation_id':existing[0],'events_count':cur.fetchone()[0]}
    cur.execute("SELECT 1 FROM nbki_lifecycle_operations WHERE loan_id=%s AND kind='close'",(loan_id,))
    if cur.fetchone():
        raise ValueError('Прекращение обязательств уже зарегистрировано')
    s = capture(cur,loan_id,at)
    refs = references()
    reason = str(body.get('reason_code') or '')
    collateral_reason = str(body.get('collateral_reason_code') or '')
    if kind == 'close':
        if reason not in {r['code'] for r in refs['closure']} or reason == '18':
            raise ValueError('Выберите основание прекращения займа по справочнику 3.8')
        if collateral_reason not in {r['code'] for r in refs['collateral']}:
            raise ValueError('Выберите основание прекращения обеспечения по справочнику 4.2')
        if (reason == '1') != (collateral_reason == '1'):
            raise ValueError('Основания исполнения займа и прекращения обеспечения противоречат друг другу')
        if collateral_reason == '2':
            provision = body.get('provision_payment') or {}
            if provision.get('code') not in {r['code'] for r in refs['provision']} or provision.get('currency') != 'RUB':
                raise ValueError('Укажите использованное обеспечение и валюту RUB')
            try:
                amount = Decimal(str(provision['sum']))
                if not amount.is_finite() or amount<=0 or date.fromisoformat(provision['date'])>at.date():
                    raise ValueError()
            except (KeyError,ValueError,ArithmeticError):
                raise ValueError('Укажите подтверждённую сумму и дату погашения за счёт обеспечения')
    blockers = []
    try:
        facts, principal = facts_from_snapshot(s)
    except ValueError as exc:
        if kind == 'close':
            raise
        facts, principal = {}, None
        blockers.append(str(exc))
    evidence = None
    if kind not in ('collateral_change','guarantor_change','guarantor_debt_change') and not blockers:
        try:
            evidence = debt_evidence(cur,s,principal)
        except ValueError as exc:
            if kind == 'close':
                raise
            blockers.append(str(exc))
    if kind == 'close':
        for collateral in s['collateral']:
            started = collateral.get('nbki_guarantee_start') if collateral['collateral_type']=='Поручительство' else collateral.get('nbki_collateral_start')
            if started and date.fromisoformat(started)>at.date():
                raise ValueError('Дата прекращения предшествует возникновению обеспечения')
        d, i = evidence['debt'], evidence['interest']
        outstanding = principal + Decimal(d['overdue_interest']) + Decimal(i['remaining_interest_candidate']) + Decimal(d['penalty_candidate']['remaining'])
        if outstanding != 0:
            raise ValueError('Для закрытия требуется нулевой подтверждённый долг по основному долгу, процентам и пеням; списание долга проводится отдельной учётной операцией')
    if before_snapshot is not None:
        s['before'] = before_snapshot
    snapshot_json = json.loads(encoded(s))
    cur.execute('''INSERT INTO nbki_lifecycle_operations
        (org_id,loan_id,kind,occurred_at,reason_code,collateral_reason_code,basis,snapshot)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
        (org_id,loan_id,kind,at,reason or None,collateral_reason or None,basis,Json(snapshot_json)))
    op_id = cur.fetchone()[0]
    events = [(KINDS[kind], s['uid'], blockers, None)]
    if kind == 'close' and s['collateral']:
        events.append(('FL_Event_2_4',s['uid'],[],None))
    if kind in ('close','guarantor_change','guarantor_debt_change'):
        if kind in ('guarantor_change','guarantor_debt_change'):
            events = []
        for collateral in s['collateral']:
            if collateral['collateral_type'] != 'Поручительство':
                continue
            uid = collateral.get('nbki_guarantee_uid')
            events.append(('FL_Event_2_5' if kind == 'close' else KINDS[kind], uid,
                           list(blockers), collateral))
        if not events:
            raise ValueError('В карточке займа нет поручительств')
    for name,uid,issues,guarantor in events:
        payload = {'snapshot':snapshot_json,'facts':facts,'debt_evidence':evidence,
                   'event_name':name,'reason_code':reason,'collateral_reason_code':collateral_reason or None,
                   'basis':basis,'changes':body.get('changes'),'provision_payment':body.get('provision_payment'),'blockers':issues}
        if guarantor is not None:
            payload['guarantor'] = guarantor
            payload['reason_code'] = '18' if kind == 'close' else None
            if not guarantor.get('subject'):
                payload['blockers'].append('Поручитель №%s: свяжите карточку с идентифицированным пайщиком' % guarantor['id'])
            if not uid:
                payload['blockers'].append('Поручитель №%s: отсутствует УИД договора поручительства' % guarantor['id'])

        payload = json.loads(encoded(payload))
        cur.execute('''INSERT INTO nbki_crm_events
            (org_id,loan_id,source_type,source_id,event_kind,event_occurred_at,evidence_sha256,
             event_payload,event_name,subject_uid,operation_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (org_id,loan_id,('guarantor_'+str(guarantor['id'])+'_'+name if guarantor else 'lifecycle_'+name),op_id,kind,at,checksum(payload),Json(payload),name,uid,op_id))
    if kind == 'close':
        cur.execute("UPDATE loans SET status='closed',updated_at=now() WHERE id=%s",(loan_id,))
        cur.execute('''UPDATE loan_collateral SET nbki_termination_date=%s,
            nbki_termination_reason=%s,updated_at=now() WHERE loan_id=%s AND nbki_termination_date IS NULL''',
            (at.date(),collateral_reason,loan_id))
    return {'success':True,'operation_id':op_id,'events_count':len(events)}


def refresh_event_metadata(cur, org_id, event_id):
    """Explicit correction of identifiers; preserve event-date financial evidence."""
    if __package__:
        from .nbki_delivery import check_delivery
    else:
        from nbki_delivery import check_delivery
    cur.execute('''SELECT loan_id,event_payload,evidence_sha256 FROM nbki_crm_events
        WHERE id=%s AND org_id=%s AND event_payload IS NOT NULL FOR UPDATE''', (event_id,org_id))
    row = cur.fetchone()
    if not row:
        raise ValueError('Событие операции не найдено')
    check_delivery(cur,org_id,event_id)
    loan_id, old, digest = row
    payload = copy.deepcopy(old)
    current = capture(cur,loan_id,datetime.fromisoformat(old['snapshot']['occurred_at']))
    s = payload['snapshot']
    for key in ('subject','organization','settings','fields','psk','report_blocks','uid'):
        s[key] = current[key]
    # Collateral details can be corrected explicitly, but removed records never
    # vanish from a past event; its membership is fixed at the operation time.
    current_rows = {r['id']:r for r in current['collateral']}
    s['collateral'] = [current_rows.get(r['id'],r) for r in s['collateral']]
    facts, _ = facts_from_snapshot(s)
    payload['facts'] = facts
    if payload.get('guarantor'):
        old_guarantor = payload['guarantor']
        payload['guarantor'] = current_rows.get(old_guarantor['id'],old_guarantor)
    payload['blockers'] = []
    if payload['event_name'] != 'FL_Event_2_4' and not payload.get('guarantor') and not payload.get('debt_evidence'):
        raise ValueError('У операции нет подтверждённого финансового снимка; обновление реквизитов не может восстановить прошлую задолженность')

    uid = payload['guarantor'].get('nbki_guarantee_uid') if payload.get('guarantor') else facts['uid']
    if not uid:
        raise ValueError('Не заполнен УИД субъекта события')
    cur.execute('''INSERT INTO nbki_event_payload_revisions(event_id,previous_payload,previous_sha256)
        VALUES (%s,%s,%s)''',(event_id,Json(old),digest))
    cur.execute('''UPDATE nbki_crm_events SET event_payload=%s,evidence_sha256=%s,subject_uid=%s
        WHERE id=%s''',(Json(payload),checksum(payload),uid,event_id))
    return {'success':True}


def validate_guarantor_accounting(value):
    """Validate a separately confirmed guarantor account, never the borrower's ledger."""
    if not isinstance(value, dict) or not str(value.get('basis') or '').strip():
        raise ValueError('Укажите документ-основание отдельного учёта поручителя')
    date.fromisoformat(value['date'])
    for group, keys in [('debt', ('term_principal','overdue_principal','term_interest','overdue_interest','penalty')),
                        ('payment', ('amount','principal','interest','penalty')),
                        ('cumulative', ('amount','principal','interest','penalty'))]:
        for key in keys:
            try:
                number = Decimal(str(value[group][key]))
                if not number.is_finite() or number < 0 or number != number.quantize(Decimal('.01')):
                    raise ValueError()
            except (KeyError,TypeError,ValueError,ArithmeticError):
                raise ValueError(f'Некорректная сумма учёта поручителя: {group}.{key}')
        if group != 'debt':
            total = sum(Decimal(str(value[group][k])) for k in ('principal','interest','penalty'))
            if total != Decimal(str(value[group]['amount'])):
                raise ValueError('Сумма платежа поручителя не равна его составляющим')
    if any(Decimal(str(value['payment'][k])) > Decimal(str(value['cumulative'][k])) for k in ('amount','principal','interest','penalty')):
        raise ValueError('Последний платёж поручителя больше накопленных платежей')
    if Decimal(str(value['payment']['amount'])) > 0:
        if date.fromisoformat(value['payment']['date']) > date.fromisoformat(value['date']):
            raise ValueError('Платёж поручителя позже даты среза')
    elif value['payment'].get('date') != '-':
        raise ValueError('При отсутствии платежей укажите дату «-»')
    for component, key in [('overdue_principal','main_miss_date'),('overdue_interest','interest_miss_date')]:
        if Decimal(str(value['debt'][component])) > 0:
            first = date.fromisoformat(value['debt']['first_overdue_date'])
            if first > date.fromisoformat(value['debt'][key]):
                raise ValueError('Начало просрочки поручителя позже последнего пропущенного платежа')
            if date.fromisoformat(value['debt'][key]) >= date.fromisoformat(value['date']):
                raise ValueError('Дата пропущенного платежа поручителя должна предшествовать срезу')


def prepare_guarantor_payload(original):
    payload = copy.deepcopy(original)
    g, facts = payload['guarantor'], payload['facts']
    day = payload['snapshot']['occurred_at'][:10]
    account = g.get('nbki_guarantor_accounting')
    zero = dict(amount='0.00',principal='0.00',interest='0.00',penalty='0.00')
    if not account:
        if g.get('nbki_guarantee_no_payments') is not True:
            raise ValueError('Не заполнен отдельный учёт платежей поручителя; либо подтвердите их отсутствие')
        if payload['event_name'] != 'FL_Event_2_5' and g.get('nbki_guarantee_no_debt') is not True:
            raise ValueError('Подтвердите отсутствие долга самого поручителя либо заполните его отдельный учёт')
        account = {'basis':'CRM: подтверждённое отсутствие исполнения поручителем', 'date':day,
                   'payment':dict(zero,date='-'),'cumulative':zero,
                   'debt':dict(term_principal='0',overdue_principal='0',term_interest='0',overdue_interest='0',penalty='0')}
    validate_guarantor_accounting(account)
    if account['date'] != day:
        raise ValueError('Отдельный учёт поручителя должен быть подтверждён на дату события')
    d = account['debt']
    if payload['event_name'] == 'FL_Event_2_5' and any(Decimal(str(d[k])) != 0 for k in ('term_principal','overdue_principal','term_interest','overdue_interest','penalty')):
        raise ValueError('Перед прекращением поручительства необходим нулевой срез его собственного долга')
    facts['payment'] = dict(account['payment'], date=day, last_payment_date=account['payment']['date'], cumulative=account['cumulative'])
    rows = []
    for component, key in [('overdue_principal','main_miss_date'),('overdue_interest','interest_miss_date')]:
        if Decimal(str(d[component])) > 0:
            rows.append({'due':d[key], 'overdue_principal':str(d[component]) if component=='overdue_principal' else '0',
                         'overdue_interest':str(d[component]) if component=='overdue_interest' else '0'})
    debt = dict(d,rows=rows,penalty_candidate={'remaining':str(d['penalty'])})
    payload['debt_evidence'] = {'accounting':{},'debt':debt,'preview':{},
                                'interest':{'remaining_interest_candidate':str(d['term_interest'])},'smp':{}}
    return payload
