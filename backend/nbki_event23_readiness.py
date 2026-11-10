"""Evidence coverage for the monetary FL_Event_2_3 branch of XSD 5.1.

xml_ready is derived strictly from the blockers list below (true only when
it is empty) - it is not a separate manual switch. Each blocker is backed by
either a verified CRM calculation or the organization's own confirmed-
accepted historical NBKI files (per-loan precedent via nbki_loan_report_blocks),
not a theoretical reading of the published XSD alone.
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
                   smp_candidate=None, loan_terms=None,
                   report_blocks=None, schedule_stable_since_event=False) -> dict:
    """Expose verified inputs and missing calculations without inventing XML."""
    loan = inspection['snapshot']['loan']
    uid = inspection['uid']
    principal = (accounting.get('principal_after')
                 if accounting.get('status') == 'checked' else None)
    cumulative = (accounting.get('cumulative_crm_payments')
                  if accounting.get('status') == 'checked' else None)
    smp_ready = bool(smp_candidate and smp_candidate.get('status') in
                     ('candidate_from_crm_schedule', 'candidate_from_crm_components',
                      'candidate_from_posting_snapshot_schedule'))
    notes = {
        'FL_17_DealUid': ('Есть УИД, номер и дата договора в CRM; требуется проверка значений XML'
                          if uid and loan.get('contract_no') and loan.get('start_date')
                          else 'Не хватает УИД, номера или даты договора'),
        'FL_18_Deal': ('Версионированные коды вида, цели и условий сделки найдены в CRM'
                       if loan_terms and all(loan_terms.get(key) for key in
                           ('deal_code','kind_code','purpose_code'))
                       else 'В CRM нет полного набора кодов сделки на дату события'),
        'FL_19_Amount': ('Сумма, валюта (RUB — мультивалютности в CRM нет) и дата расчёта берутся прямо из CRM'
                        if loan.get('amount') is not None else 'Сумма займа не найдена в CRM'),
        'FL_19_1_AmountInfo': ('Подтверждено структурой CRM: заём сам не обеспечивает другое обязательство '
                              '(продуктов типа «заём-гарантия» в модели нет), передаётся признак отсутствия'),
        'FL_21_PaymentTerms': ('Снимок графика на момент проведения есть; условия платежей ещё не рассчитаны по ГУТДФ'
                               if posting_snapshot_sha256 else
                               'Снимка нет, но график для этого займа не переписывался после события: '
                               'условия следующего платежа читаются из CRM напрямую'
                               if schedule_stable_since_event else
                               'Исторического снимка графика на момент проведения нет, '
                               'а график займа позже был переписан заново'),
        'FL_22_TotalCost': ('Исторический признак займа не требует этого блока'
                            if report_blocks and not report_blocks.get('include_total_cost') else
                            'ПСК рассчитана по первоначальным реквизитам CRM и согласуется с историческим расчётом; для XML требуется сверка с подписанным договором и условием обязательности'
                            if psk_candidate_status == 'cross_checked' else
                            'Расчёт ПСК по CRM имеет расхождение или недостаточную историческую проверку; требуется ручная сверка'
                            if psk_candidate_status == 'review' else
                            'ПСК и условие обязательности требуют подтверждённого расчёта'),
        'FL_25_26_27_28_Group': ('Срез процентов и задолженности рассчитан по журналу, распределениям и графику CRM; сверить правовую классификацию до выпуска. Коды ФЛ_28.10/28.11 не передаются совсем — подтверждено 623 реальными историческими событиями этой организации, включая файл, принятый НБКИ 06.10.2026 без отклонений'
            if crm_debt and interest_candidate and debt_preview and debt_preview.get('status') == 'candidate_from_crm_components'
            else 'Не завершён расчёт процентов и частей задолженности на дату события'),
        'FL_29_MonthlyPayment': ('Среднемесячный платёж рассчитан как кандидат по графику CRM; нормативное подтверждение ещё требуется'
                                 if smp_ready else 'Нормативный среднемесячный платёж не рассчитан'),
        'FL_29_1_DebtBurdenInfo': ('Подтверждено оператором 10.11.2026: отчётность по ПДН не применяется '
                                  'к займам этого КПК; в CRM нет данных о доходе заёмщика для расчёта'),
        'FL_20_JointDebtors': ('Подтверждено структурой CRM: у займа один заёмщик (loans.member_id — '
                               'одиночная ссылка), солидарных должников в модели нет'),
        'FL_30_NonMonetarySource': ('Подтверждено структурой CRM: в модели нет понятия неденежного займа, '
                                    'все займы денежные'),
        'FL_36_1_ProvisionPaymentOffset': ('Подтверждено структурой CRM: отступного, зачёта встречных '
                                           'требований или прощения долга в модели нет, блок передаётся с признаком отсутствия'),
        'FL_37_WarrantyReturn': ('Подтверждено структурой CRM: событие сформировано из платежа заёмщика, '
                                 'в модели нет события выплаты по гарантии поручителем'),
        'FL_54_Accounting': ('Обычный учёт задолженности и фиксированная ставка берутся из CRM; '
                            'подтверждено оператором 10.11.2026: КПК не участвует в программах '
                            'льготного финансирования с господдержкой'),
        'FL_55_Application': ('Исторический признак займа не требует этого блока'
                              if report_blocks and not report_blocks.get('include_application') else
                              'Исторические данные заявки для этого займа сохранены и готовы к повторному использованию'
                              if report_blocks and report_blocks.get('include_application') and
                                 report_blocks.get('application_block') else
                              'Нет исторического признака по этому займу: неизвестно, нужен ли блок, '
                              'и в CRM нет данных заявки (источник/способ/этап) для его заполнения'),
        'FL_56_Participation': ('Версионированные коды вида, цели и условий сделки найдены в CRM'
                                if loan_terms and all(loan_terms.get(key) for key in
                                    ('deal_code','kind_code','purpose_code'))
                                else 'В CRM нет полного набора кодов сделки на дату события'),
    }
    # FL_20, FL_36_1, FL_30, FL_37 and FL_19_1 are confirmed structurally
    # rather than per-event: the CRM loan model has no joint-debtor,
    # offset/settlement, non-monetary-loan, guarantor-claim or
    # loan-as-security-for-another-obligation concept at all, so there is
    # nothing a per-event check could find that a schema inspection would not.
    # FL_55 is NOT in this group - it is the loan-application block, present in
    # 66% of this organization's 623 real historical events; it needs
    # report_blocks precedent, handled separately below.
    STRUCTURALLY_CONFIRMED_ABSENT = ('FL_20_JointDebtors', 'FL_36_1_ProvisionPaymentOffset',
                                     'FL_30_NonMonetarySource', 'FL_37_WarrantyReturn',
                                     'FL_19_1_AmountInfo')
    # FL_54 (government-subsidy programs) and FL_29_1 (ПДН applicability) are
    # organizational facts the operator confirmed 10.11.2026, not provable from
    # the schema alone the way the blocks above are.
    ORG_CONFIRMED_NOT_APPLICABLE = ('FL_54_Accounting', 'FL_29_1_DebtBurdenInfo')
    loan_terms_complete = bool(loan_terms and all(loan_terms.get(key) for key in
                               ('deal_code', 'kind_code', 'purpose_code')))

    def _status(name: str) -> str:
        if name == 'FL_17_DealUid':
            return ('source_present' if uid and loan.get('contract_no') and
                    loan.get('start_date') else 'review')
        if name in STRUCTURALLY_CONFIRMED_ABSENT or name in ORG_CONFIRMED_NOT_APPLICABLE:
            return 'source_present'
        if name == 'FL_19_Amount':
            return 'source_present' if loan.get('amount') is not None else 'review'
        if name == 'FL_25_26_27_28_Group':
            return ('partial' if principal is not None and cumulative and
                    allocation.get('status') == 'checked' else 'review')
        if name in ('FL_18_Deal', 'FL_56_Participation'):
            return 'source_present' if loan_terms_complete else 'review'
        if name == 'FL_21_PaymentTerms':
            return ('partial' if posting_snapshot_sha256 or schedule_stable_since_event
                    else 'review')
        if name == 'FL_22_TotalCost':
            if report_blocks and not report_blocks.get('include_total_cost'):
                return 'source_present'
            return 'source_present' if psk_candidate_status == 'cross_checked' else 'review'
        if name == 'FL_55_Application':
            if not report_blocks:
                return 'review'
            if not report_blocks.get('include_application'):
                return 'source_present'
            return 'source_present' if report_blocks.get('application_block') else 'review'
        if name == 'FL_29_MonthlyPayment':
            return 'partial' if smp_ready else 'review'
        return 'review'

    blocks = [{'name': name, 'xsd_required': required, 'status': _status(name),
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
                          interest_candidate.get('status') in
                          ('candidate_from_crm_formula',
                           'candidate_from_posting_snapshot_formula'))
    if not debt_ready or not interest_ready:
        blockers.append('Расчёт задолженности по компонентам CRM на дату события не завершён')
    # FL_22 (and the PSK it needs) only matters when this loan's own history
    # requires the block at all; otherwise only the SMP candidate matters.
    total_cost_needed = not report_blocks or report_blocks.get('include_total_cost')
    psk_blocking = total_cost_needed and psk_candidate_status != 'cross_checked'
    if psk_blocking or not smp_ready:
        blockers.append('ПСК или среднемесячный платёж не прошли проверку исходных условий CRM')
    if not report_blocks:
        blockers.append('Нет исторического признака состава события (ФЛ_22/ФЛ_55) для этого займа')
    unresolved_blocks = [block['name'] for block in blocks if block['status'] == 'review']
    if unresolved_blocks:
        blockers.append('Не проверены условные и обязательные блоки события 2.3: '
                         + ', '.join(unresolved_blocks))
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
            'xml_ready': not blockers}
