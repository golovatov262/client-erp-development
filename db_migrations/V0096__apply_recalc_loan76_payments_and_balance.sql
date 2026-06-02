-- Применение пересчёта разнесения платежей по займу 76 (Лозина К.А.).
-- Источник — выверенная таблица _recalc76_report (проценты по факт. дням между
-- плановыми датами; платёж сначала на проценты, остаток на ОД; недобор копится как долг).
-- Обновляем фактические платежи и остаток ОД. График и пени не трогаем.

UPDATE t_p25513958_client_erp_developme.loan_payments lp
SET principal_part = rr.principal_paid,
    interest_part  = rr.interest_paid,
    penalty_part   = rr.penalty
FROM t_p25513958_client_erp_developme._recalc76_report rr
WHERE lp.id = rr.payment_id AND lp.loan_id = 76;

-- Остаток основного долга = 710 610,22 (711500 - 889,78 фактически погашенного ОД)
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 710610.22, updated_at = NOW()
WHERE id = 76;
