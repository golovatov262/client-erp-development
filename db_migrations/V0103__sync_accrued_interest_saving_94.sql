-- Синхронизация "Начислено %" договора 100-000000505092019 (id=94)
-- под фактическую сумму ежедневных/помесячных начислений (115890.72), убираем лишние 1911.03 руб.
UPDATE t_p25513958_client_erp_developme.savings s
SET accrued_interest = (
    SELECT COALESCE(SUM(daily_amount), 0)
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id = s.id
),
    updated_at = NOW()
WHERE s.id = 94;