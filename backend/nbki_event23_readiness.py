"""Evidence coverage for the monetary FL_Event_2_3 branch of XSD 5.1.

No item here approves a regulatory XML value. Conditional blocks still need
legal/business-rule evaluation even when the XSD permits their omission.
"""

from __future__ import annotations


XSD_VERSION = '5.1'
XSD_ARCHIVE_SHA256 = 'f1d82275ffc4df9ade469e5ce365639cd83b0398429999d2b9d738ba9b8dc36e'

# Direct children of FL_Event_2_3_Type for its monetary-obligation branch.
# The two optional monetary blocks are conditionally mandatory under the
# technical requirements for consumer loans; XSD minOccurs alone is not enough.
MONETARY_BLOCKS = (
    ('FL_17_DealUid', True),
    ('FL_18_Deal', True),
    ('FL_19_Amount', True),
    ('FL_19_1_AmountInfo', True),
    ('FL_21_PaymentTerms', True),
    ('FL_22_TotalCost', False),
    ('FL_25_26_27_28_Group', True),
    ('FL_29_MonthlyPayment', False),
    ('FL_29_1_DebtBurdenInfo', False),
    ('FL_20_JointDebtors', True),
    ('FL_30_NonMonetarySource', False),
    ('FL_36_1_ProvisionPaymentOffset', True),
    ('FL_37_WarrantyReturn', False),
    ('FL_54_Accounting', True),
    ('FL_55_Application', False),
    ('FL_56_Participation', True),
)


def assess_event23(inspection: dict, accounting: dict, allocation: dict,
                   event_occurred_at, posting_snapshot_sha256,
                   psk_candidate_status=None, crm_debt=None) -> dict:
    """Expose verified inputs and missing calculations without inventing XML."""
    loan = inspection['snapshot']['loan']
    uid = inspection['uid']
    principal = (accounting.get('principal_after')
                 if accounting.get('status') == 'checked' else None)
    cumulative = (accounting.get('cumulative_crm_payments')
                  if accounting.get('status') == 'checked' else None)
    notes = {
        'FL_17_DealUid': ('Есть УИД, номер и дата договора в CRM; требуется проверка значений XML'
                          if uid and loan.get('contract_no') and loan.get('start_date')
                          else 'Не хватает УИД, номера или даты договора'),
        'FL_18_Deal': 'Не подтверждены коды вида, цели и условий сделки на дату события',
        'FL_19_Amount': 'Сумма займа есть в CRM; валюта и условные показатели требуют сверки',
        'FL_19_1_AmountInfo': 'Нужно определить применимое заполнение обеспечиваемого обязательства',
        'FL_21_PaymentTerms': ('Снимок графика на момент проведения есть; условия платежей ещё не рассчитаны по ГУТДФ'
                               if posting_snapshot_sha256 else
                               'Исторического снимка графика на момент проведения нет'),
        'FL_22_TotalCost': ('ПСК найден в реестре 1С и совпал по дате/сумме с CRM; требуется сверка с подписанным договором и условием обязательности'
                            if psk_candidate_status == 'source_consistent' else
                            'ПСК найден в реестре 1С с расхождением реквизитов CRM; требуется ручная сверка'
                            if psk_candidate_status == 'review' else
                            'ПСК и условие обязательности требуют подтверждённого расчёта'),
        'FL_25_26_27_28_Group': 'Есть часть по основному долгу и платежам CRM; нет полного расчёта процентов, срочной и просроченной задолженности и кодов платежа',
        'FL_29_MonthlyPayment': 'Нормативный среднемесячный платёж не рассчитан',
        'FL_29_1_DebtBurdenInfo': 'Не проверены условия обязательности и данные долговой нагрузки',
        'FL_20_JointDebtors': 'Нужно подтвердить состав солидарных должников или признак их отсутствия',
        'FL_30_NonMonetarySource': 'Для денежного займа обычно не применяется; требуется сверка признака',
        'FL_36_1_ProvisionPaymentOffset': 'Нужно подтвердить вид погашения требований или признак его отсутствия',
        'FL_37_WarrantyReturn': 'Для заёмщика обычно не применяется; требуется сверка роли',
        'FL_54_Accounting': 'Нужно проверить учёт задолженности, источник и ставку на дату события',
        'FL_55_Application': 'Условный блок; требуется сверка связи с обращением',
        'FL_56_Participation': 'Нужно подтвердить вид участия в обязательстве',
    }
    blocks = [{'name': name, 'xsd_required': required, 'status':
               ('source_present' if name == 'FL_17_DealUid' and uid and
                loan.get('contract_no') and loan.get('start_date') else
                'partial' if name == 'FL_25_26_27_28_Group' and principal is not None and
                cumulative and allocation.get('status') == 'checked' else 'review'),
               'note': notes[name]} for name, required in MONETARY_BLOCKS]
    blockers = []
    if not event_occurred_at:
        blockers.append('Не подтверждено фактическое время события')
    if not posting_snapshot_sha256:
        blockers.append('Нет снимка графика при проведении платежа')
    if principal is None:
        blockers.append('Не подтверждён остаток основного долга по журналу CRM')
    if allocation.get('status') != 'checked':
        blockers.append('Не подтверждено распределение платежа CRM')
    blockers.extend(('Не рассчитана полная задолженность по процентам на дату события; из текущего графика CRM можно восстановить только просроченную часть для последнего платежа',
                     'Не рассчитаны ПСК, среднемесячный платёж и коды соблюдения платежей',
                     'Не проверены условные и обязательные блоки события 2.3'))
    return {'event_code_candidate': '2.3', 'xsd_version': XSD_VERSION,
            'xsd_archive_sha256': XSD_ARCHIVE_SHA256,
            'blocks': blocks, 'blockers': blockers,
            'debt_evidence': {'principal_after_crm': principal,
                              'term_principal_crm': (crm_debt.get('term_principal')
                                if crm_debt and crm_debt.get('status') == 'calculated_from_current_crm' else None),
                              'overdue_principal_crm': (crm_debt.get('overdue_principal')
                                if crm_debt and crm_debt.get('status') == 'calculated_from_current_crm' else None),
                              'overdue_interest_crm': (crm_debt.get('overdue_interest')
                                if crm_debt and crm_debt.get('status') == 'calculated_from_current_crm' else None),
                              'interest_debt': None, 'other_debt': None,
                              'total_debt': None, 'due_debt': None,
                              'overdue_debt': None,
                              'cumulative_payments_crm': cumulative},
            'xml_ready': False}
