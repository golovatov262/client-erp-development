-- Синхронизация общей суммы начисленных процентов договора 100-000000113012026 (id=103)
-- под фактические ежедневные/помесячные начисления (убираем лишние 844.43 руб., в т.ч. дубль-корректировку 839.09)
UPDATE t_p25513958_client_erp_developme.savings s
SET accrued_interest = (
    SELECT COALESCE(SUM(daily_amount), 0)
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id = s.id
),
    updated_at = NOW()
WHERE s.id = 103;