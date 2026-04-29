-- Обнуляем все ошибочные начисления после end_date договора для всех затронутых вкладов
UPDATE t_p25513958_client_erp_developme.savings_daily_accruals da
SET daily_amount = 0
FROM t_p25513958_client_erp_developme.savings s
WHERE da.saving_id = s.id
  AND s.end_date IS NOT NULL
  AND da.accrual_date > s.end_date
  AND da.daily_amount > 0;

-- Пересчитываем accrued_interest для всех затронутых вкладов (81, 112, 128)
UPDATE t_p25513958_client_erp_developme.savings
SET accrued_interest = (
    SELECT COALESCE(SUM(daily_amount), 0)
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id = savings.id
),
updated_at = NOW()
WHERE id IN (81, 112, 128);