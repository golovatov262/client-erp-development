-- Повторный пересчёт разнесения платежей по займу 76 (Лозина К.А.) по МЕСЯЧНОЙ ставке 21%/12.
-- Прежний пересчёт (V0096) ошибочно использовал дневную ставку от даты выдачи,
-- из-за чего удлинённый первый период (37 дней) съедал весь платёж и ОД не гасился.
-- Теперь процент периода = остаток ОД x 21% / 12 (как в плановом графике),
-- ОД гасится с первого платежа. Источник — выверенная таблица _recalc76_report.

UPDATE t_p25513958_client_erp_developme.loan_payments lp
SET principal_part = rr.principal_paid,
    interest_part  = rr.interest_paid,
    penalty_part   = rr.penalty
FROM t_p25513958_client_erp_developme._recalc76_report rr
WHERE lp.id = rr.payment_id AND lp.loan_id = 76;

-- Остаток основного долга = 707 645,44 (711500 - 3854,56 погашенного ОД)
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 707645.44, updated_at = NOW()
WHERE id = 76;
