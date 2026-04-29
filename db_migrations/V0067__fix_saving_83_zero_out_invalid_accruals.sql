-- Обнуляем ошибочные начисления по saving_id=83 после 14.04.2026
UPDATE t_p25513958_client_erp_developme.savings_daily_accruals
SET daily_amount = 0
WHERE saving_id = 83 AND accrual_date > '2026-04-14';

-- Пересчитываем accrued_interest как сумму только ненулевых начислений
UPDATE t_p25513958_client_erp_developme.savings
SET accrued_interest = (
    SELECT COALESCE(SUM(daily_amount), 0)
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id = 83
),
updated_at = NOW()
WHERE id = 83;