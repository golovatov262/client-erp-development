"""A reconciled, explicitly non-regulatory event-date debt candidate."""

from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal('0.01')
ZERO = Decimal('0.00')


def _money(value):
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def preview_debt(accounting: dict, crm_debt: dict, interest_candidate: dict) -> dict:
    result = {'status': 'unavailable', 'basis': 'Сверенные компоненты CRM; не утверждено для ФЛ_25–27',
              'term_principal': None, 'overdue_principal': None,
              'term_interest_candidate': None, 'overdue_interest': None,
              'term_other_candidate': None, 'overdue_other': None,
              'term_total_candidate': None, 'overdue_total_candidate': None,
              'total_candidate': None, 'issues': []}
    if accounting.get('status') != 'checked' or crm_debt.get('status') not in (
            'calculated_from_current_crm', 'calculated_from_posting_snapshot'):
        result['issues'].append('Основной долг и график CRM не прошли сверку')
        return result
    if interest_candidate.get('status') != 'candidate_from_crm_formula':
        result['issues'].append('Нет расчёта фактически накопленных процентов текущего периода')
        return result
    penalty = crm_debt.get('penalty_candidate')
    if not penalty or penalty.get('due_classification') != 'term_until_final_scheduled_payment':
        result['issues'].append('Не установлен срок оплаты остатка пени на дату события')
        return result
    try:
        term_principal = _money(crm_debt['term_principal'])
        overdue_principal = _money(crm_debt['overdue_principal'])
        term_interest = _money(interest_candidate['remaining_interest_candidate'])
        overdue_interest = _money(crm_debt['overdue_interest'])
        term_other = _money(penalty['remaining'])
        principal_after = _money(accounting['principal_after'])
    except (TypeError, ValueError, ArithmeticError):
        result['issues'].append('В одном из компонентов отсутствует числовое значение')
        return result
    if min(term_principal, overdue_principal, term_interest, overdue_interest, term_other) < ZERO:
        result['issues'].append('Отрицательная часть задолженности')
        return result
    if abs(term_principal + overdue_principal - principal_after) > CENT:
        result['issues'].append('Разделение основного долга не равно журналу CRM')
        return result
    term_total = term_principal + term_interest + term_other
    overdue_total = overdue_principal + overdue_interest
    result.update({'status': 'candidate_from_crm_components',
                   'term_principal': str(term_principal),
                   'overdue_principal': str(overdue_principal),
                   'term_interest_candidate': str(term_interest),
                   'overdue_interest': str(overdue_interest),
                   'term_other_candidate': str(term_other),
                   'overdue_other': str(ZERO),
                   'term_total_candidate': str(term_total),
                   'overdue_total_candidate': str(overdue_total),
                   'total_candidate': str(term_total + overdue_total)})
    return result
