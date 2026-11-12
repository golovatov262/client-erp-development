"""Evidence for non-payment debt events, compared with receipt-confirmed XML.

Accepted amounts are a comparison baseline only. They never replace CRM values.
CBR letters 21.03.2025 44-19/2385 and 21.11.2024 44-8-1-1/5849.
"""
from datetime import date
from decimal import Decimal
import gzip
import hashlib
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

MSK = ZoneInfo('Europe/Moscow')
COMPONENTS = ('term_principal','term_interest','term_other','overdue_principal','overdue_interest','overdue_other')


def money(value):
    if value in (None,'','-'):
        raise ValueError('В принятом срезе не заполнены суммы задолженности')
    try:
        number=Decimal(str(value))
        if not number.is_finite() or number<0:
            raise ValueError()
        return format(number.quantize(Decimal('.01')), '.2f')
    except (ValueError,ArithmeticError):
        raise ValueError('Некорректная сумма задолженности в срезе сравнения')


def evidence_state(evidence):
    p=evidence['preview'];d=evidence['debt']
    if p.get('status')!='candidate_from_crm_components':
        raise ValueError('Текущий срез задолженности не прошёл сверку CRM')
    state={key:money(p[key if key not in ('term_interest','term_other') else key+'_candidate']) for key in COMPONENTS}
    state['currency']='RUB'
    rows=[r for r in d.get('rows',[]) if Decimal(r.get('overdue_principal','0'))+Decimal(r.get('overdue_interest','0'))>0]
    first=min((r['due'] for r in rows),default=None)
    state['first_overdue_date']=d.get('first_overdue_date') or first
    state['main_miss_date']=max((r['due'] for r in rows if Decimal(r.get('overdue_principal','0'))>0),default=None)
    state['interest_miss_date']=max((r['due'] for r in rows if Decimal(r.get('overdue_interest','0'))>0),default=None)
    state['over90']=bool(first and (date.fromisoformat(evidence['as_of'])-date.fromisoformat(first)).days>90)
    return state


def accepted_state(event):
    if event.findtext('FL_18_Deal/role')!='1':
        raise ValueError('Принятое событие относится не к заёмщику')
    group=event.find('FL_25_26_27_28_Group')
    if group is None:
        raise ValueError('В принятом событии нет блока задолженности')
    result={k:'0.00' for k in COMPONENTS}
    if group.find('exist_1') is not None:
        due=group.find('FL_26_DebtDue')
        if due is None:
            raise ValueError('В принятом срезе отсутствует блок срочного долга')
        if due.find('debtDueExist_1') is not None:
            for key,tag in zip(COMPONENTS[:3],('debtDueMainSum','debtDuePercentSum','debtDueOtherSum')):
                result[key]=money(due.findtext(tag))
        elif due.find('debtDueExist_0') is None:
            raise ValueError('Не определён признак срочной задолженности в принятом срезе')
    elif group.find('exist_0') is None:
        raise ValueError('Не определён признак задолженности в принятом срезе')
    overdue=group.find('FL_27_DebtOverdue')
    if overdue is None:
        raise ValueError('В принятом срезе отсутствует блок просрочки')
    missed=overdue.find('missFact_1') is not None
    if missed:
        for key,tag in zip(COMPONENTS[3:],('debtOverdueMainSum','debtOverduePercentSum','debtOverdueOtherSum')):
            result[key]=money(overdue.findtext(tag))
    elif overdue.find('missFact_0') is None:
        raise ValueError('Не определён признак просрочки в принятом срезе')
    result['currency']=group.findtext('FL_25_Debt/currency') or group.findtext('FL_28_Payment/payCurrency')
    if not result['currency']:
        raise ValueError('В принятом срезе отсутствует валюта')
    result['first_overdue_date']=overdue.findtext('debtOverdueStartDate') if missed else None
    result['main_miss_date']=overdue.findtext('mainMissDate') if Decimal(result['overdue_principal'])>0 else None
    result['interest_miss_date']=overdue.findtext('percentMissDate') if Decimal(result['overdue_interest'])>0 else None
    result['over90']=event.find('FL_56_Participation/overdueExist_1') is not None
    if group.find('exist_1') is not None:
        for tag,keys in [('debtMainSum',('term_principal','overdue_principal')),
                         ('debtPercentSum',('term_interest','overdue_interest')),
                         ('debtOtherSum',('term_other','overdue_other'))]:
            if Decimal(money(group.findtext('FL_25_Debt/'+tag)))!=sum(Decimal(result[k]) for k in keys):
                raise ValueError('В принятом XML не сходятся составляющие задолженности')
    elif any(Decimal(result[k]) for k in COMPONENTS):
        raise ValueError('Признак отсутствия долга противоречит суммам принятого XML')
    return result


def compare_states(current, previous, occurred_at, baseline_at):
    if baseline_at>=occurred_at:
        return {'decision':'stale','reason':'Уже принят срез на эту или более позднюю дату и время','changes':{}}
    changes={k:{'accepted':previous.get(k),'crm':v} for k,v in current.items() if previous.get(k)!=v}
    if changes:
        return {'decision':'changed','reason':'Изменились подтверждённые показатели задолженности','changes':changes}
    days=(occurred_at.astimezone(MSK).date()-baseline_at.astimezone(MSK).date()).days
    if days>=31:
        return {'decision':'periodic','reason':'Плановое обновление задолженности: прошло не менее 31 дня','changes':{}}
    return {'decision':'unchanged','reason':'Суммы и признаки задолженности совпадают с принятым срезом; повторная выгрузка не требуется','changes':{}}


def initial_snapshot(cur, org_id, uid, occurred_at=None):
    """Only the explicitly authorized event may bootstrap a missing archive."""
    cur.execute("""SELECT a.event_id,a.event_at,a.financial_state,a.basis
        FROM nbki_initial_debt_snapshots a JOIN nbki_crm_events e ON e.id=a.event_id
        WHERE a.org_id=%s AND a.subject_uid=%s AND e.org_id=a.org_id
          AND e.subject_uid=a.subject_uid AND e.event_occurred_at=a.event_at
          AND e.event_kind='debt_change' AND e.status NOT IN ('excluded','accepted')
          AND (%s::timestamptz IS NULL OR a.event_at=%s)""",(org_id,uid,occurred_at,occurred_at))
    return cur.fetchone()


def review_debt_change(cur,org_id,uid,occurred_at,evidence):
    # At one actual payment timestamp, the after-payment group is the later
    # financial state even if its accrual companion is accepted in a later file.
    cur.execute("""SELECT f.id,f.reg_number,fe.order_num,fe.event_time,f.xml_gzip,f.xml_sha256,fe.event_name
        FROM nbki_file_events fe JOIN nbki_source_files f ON f.id=fe.source_file_id
        LEFT JOIN nbki_deals d ON d.id=fe.deal_id
        LEFT JOIN nbki_crm_events ce ON ce.id=fe.crm_event_id
        LEFT JOIN nbki_debt_reporting_triggers rt ON rt.event_id=ce.id
        WHERE f.org_id=%s AND f.archived_at IS NULL AND fe.delivery_status='accepted'
          AND COALESCE(fe.source_uid,d.uid)=%s AND fe.event_name IN (
            'FL_Event_2_1','FL_Event_2_3','FL_Event_2_5','FL_Event_2_10','FL_Event_2_11')
        ORDER BY fe.event_time DESC NULLS LAST,
          CASE WHEN ce.source_type='loan_payment' OR rt.kind='payment_due' THEN 2 ELSE 1 END DESC,
          f.document_time DESC,f.id DESC,fe.order_num DESC LIMIT 1""",(org_id,uid))
    row=cur.fetchone()
    if not row:
        initial=initial_snapshot(cur,org_id,uid,occurred_at)
        if initial:
            current=evidence_state(evidence)
            if current!=initial[2]:
                raise ValueError('Показатели первоначального среза изменились после подтверждения')
            return {'decision':'initial_snapshot','reason':'Первоначальный срез CRM: архив недоступен; приёмка НБКИ ещё не подтверждена',
                    'changes':{},'current':current,'authorization':{'event_id':initial[0],'basis':initial[3]}}
        return {'decision':'missing_baseline','reason':'Нет подтверждённого принятого среза НБКИ по этому УИД. Загрузите отправленный XML и успешную ticket2 для сравнения','changes':{}}
    fid,reg,order,when,compressed,digest,name=row
    ref={'file_id':fid,'file':reg,'order_num':order,'event_at':when.isoformat() if when else None}
    if name in ('FL_Event_2_5','FL_Event_2_10','FL_Event_2_11'):
        return {'decision':'terminated','reason':'Принято событие прекращения обязательства, передачи сведений или перехода прав','baseline':ref,'changes':{}}
    if when is None:
        raise ValueError('В принятом срезе не установлено время события')
    try:
        raw=gzip.decompress(bytes(compressed))
    except (OSError, EOFError, TypeError) as exc:
        raise ValueError('Не удалось прочитать сохранённый принятый XML') from exc
    if hashlib.sha256(raw).hexdigest()!=digest.strip():
        raise ValueError('Контрольная сумма принятого XML не совпала')
    try:
        root=ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ValueError('Сохранённый принятый XML повреждён') from exc
    events=[n for n in root.findall('.//Events/*') if n.get('orderNum')==str(order)]
    if len(events)!=1 or events[0].findtext('FL_17_DealUid/uid')!=uid or events[0].tag!=name:
        raise ValueError('Принятый XML не соответствует записи журнала событий')
    current=evidence_state(evidence);previous=accepted_state(events[0])
    result=compare_states(current,previous,occurred_at,when)
    return dict(result,baseline=ref,accepted=previous,current=current)


def require_debt_change(cur,org_id,payload,event_id=None):
    from datetime import datetime
    if payload.get('reporting_kind'):
        if payload.get('time_pending') or payload.get('financial_reconstruction_required') or payload.get('blockers'):
            raise ValueError('Не подтверждены время или финансовые данные события начисления')
        cur.execute('SELECT kind FROM nbki_debt_reporting_triggers WHERE event_id=%s',(event_id,))
        row=cur.fetchone()
        if not row or row[0]!=payload['reporting_kind']:
            raise ValueError('Не подтверждено основание формирования события задолженности')
        evidence_state(payload['debt_evidence'])
        return {'decision':row[0],'reason':payload['basis'],'changes':{}}
    review=review_debt_change(cur,org_id,payload['facts']['uid'],
        datetime.fromisoformat(payload['snapshot']['occurred_at']),payload['debt_evidence'])
    if review['decision']=='initial_snapshot' and review['authorization']['event_id']!=event_id:
        raise ValueError('Первоначальный срез разрешён только для подтверждённого события')
    if review['decision'] not in ('changed','periodic','initial_snapshot'):
        raise ValueError(review['reason'])
    return review
