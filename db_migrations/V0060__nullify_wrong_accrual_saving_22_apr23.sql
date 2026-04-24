-- Обнуляем ошибочное начисление за 23.04.2026 по договору сбережений id=22 (Гордеенко, end_date=22.04.2026)
-- и корректируем накопленные проценты на savings
UPDATE t_p25513958_client_erp_developme.savings
SET accrued_interest = accrued_interest - 5113.12,
    updated_at = NOW()
WHERE id = 22;

UPDATE t_p25513958_client_erp_developme.savings_daily_accruals
SET daily_amount = 0,
    balance = 0,
    rate = 0
WHERE saving_id = 22 AND accrual_date = '2026-04-23';