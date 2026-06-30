-- Подготовка к корректному удалению дубль-транзакции id=583 (interest_accrual +839.09):
-- действие удаления вычтет 839.09 из accrued_interest, поэтому выставляем целевое+839.09,
-- чтобы после удаления accrued_interest стал равен сумме помесячных начислений.
UPDATE t_p25513958_client_erp_developme.savings s
SET accrued_interest = (
    SELECT COALESCE(SUM(daily_amount), 0)
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id = s.id
) + 839.09,
    updated_at = NOW()
WHERE s.id = 103;