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
                   psk_candidate_status=None, crm_debt=None,
                   interest_candidate=None, debt_preview=None,
                   smp_candidate=None, loan_terms=None) -> dict:
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
        'FL_18_Deal': ('Версионированные коды вида, цели и условий сделки найдены в CRM'
                       if loan_terms and all(loan_terms.get(key) for key in
                           ('deal_code','kind_code','purpose_code'))
                       else 'В CRM нет полного набора кодов сделки на дату события'),
        'FL_19_Amount': 'Сумма займа есть в CRM; валюта и условные показатели требуют сверки',
        'FL_19_1_AmountInfo': 'Нужно определить применимое заполнение обеспечиваемого обязательства',
        'FL_21_PaymentTerms': ('Снимок графика на момент проведения есть; условия платежей ещё не рассчитаны по ГУТДФ'
                               if posting_snapshot_sha256 else
                               'Исторического снимка графика на момент проведения нет'),
        'FL_22_TotalCost': ('ПСК рассчитана по первоначальным реквизитам CRM и согласуется с историческим расчётом; для XML требуется сверка с подписанным договором и условием обязательности'
                            if psk_candidate_status == 'cross_checked' else
                            'Расчёт ПСК по CRM имеет расхождение или недостаточную историческую проверку; требуется ручная сверка'
                            if psk_candidate_status == 'review' else
                            'ПСК и условие обязательности требуют подтверждённого расчёта'),
        'FL_25_26_27_28_Group': ('Срез процентов и задолженности рассчитан по журналу, распределениям и графику CRM; сверить правовую классификацию до выпуска. Коды ФЛ_28.10/28.11 заменяются прочерками по письму ЦБ от 09.12.2025'
            if crm_debt and interest_candidate and debt_preview and debt_preview.get('status') == 'candidate_from_crm_components'
            else 'Не завершён расчёт процентов и частей задолженности на дату события'),
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
    if not loan_terms or not all(loan_terms.get(key) for key in
                                 ('deal_code','kind_code','purpose_code')):
        blockers.append('В CRM не заполнены версионированные коды вида, цели и типа сделки')
    if principal is None:
        blockers.append('Не подтверждён остаток основного долга по журналу CRM')
    if allocation.get('status') != 'checked':
        blockers.append('Не подтверждено распределение платежа CRM')
    debt_ready = bool(debt_preview and debt_preview.get('status') == 'candidate_from_crm_components')
    interest_ready = bool(interest_candidate and
                          interest_candidate.get('status') == 'candidate_from_crm_formula')
    smp_ready = bool(smp_candidate and smp_candidate.get('status') in
                     ('candidate_from_crm_schedule', 'candidate_from_crm_components'))
    if not debt_ready or not interest_ready:
        blockers.append('Расчёт задолженности по компонентам CRM на дату события не завершён')
    if psk_candidate_status != 'cross_checked' or not smp_ready:
        blockers.append('ПСК или среднемесячный платёж не прошли проверку исходных условий CRM')
    blockers.extend(('Для ФЛ_28.10/28.11 применяются прочерки по письму ЦБ от 09.12.2025; перед выпуском проверить схему представления XSD 5.1',
                     'Не проверены условные и обязательные блоки события 2.3'))
    debt = debt_preview or {}
    return {'event_code_candidate': '2.3', 'xsd_version': XSD_VERSION,
            'xsd_archive_sha256': XSD_ARCHIVE_SHA256,
            'blocks': blocks, 'blockers': blockers,
            'debt_evidence': {'principal_after_crm': principal,
                              'term_principal_crm': (crm_debt.get('term_principal')
                                if crm_debt and crm_debt.get('status') in ('calculated_from_current_crm','calculated_from_posting_snapshot') else None),
                              'overdue_principal_crm': (crm_debt.get('overdue_principal')
                                if crm_debt and crm_debt.get('status') in ('calculated_from_current_crm','calculated_from_posting_snapshot') else None),
                              'overdue_interest_crm': (crm_debt.get('overdue_interest')
                                if crm_debt and crm_debt.get('status') in ('calculated_from_current_crm','calculated_from_posting_snapshot') else None),
                              'term_interest_candidate': debt.get('term_interest_candidate'),
                              'other_debt_candidate': debt.get('term_other_candidate'),
                              'total_debt_candidate': debt.get('total_candidate'),
                              'due_debt_candidate': debt.get('term_total_candidate'),
                              'overdue_debt_candidate': debt.get('overdue_total_candidate'),
                              'interest_debt': None, 'other_debt': None,
                              'total_debt': None, 'due_debt': None,
                              'overdue_debt': None,
                              'cumulative_payments_crm': cumulative},
            'xml_ready': False}
