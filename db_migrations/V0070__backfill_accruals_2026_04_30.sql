-- Доначисляем пропущенные проценты за 30.04.2026 для всех активных вкладов у которых нет записи за эту дату
INSERT INTO t_p25513958_client_erp_developme.savings_daily_accruals (saving_id, accrual_date, balance, rate, daily_amount)
SELECT 
    s.id,
    '2026-04-30'::date,
    s.current_balance,
    s.rate,
    ROUND(s.current_balance * s.rate / 100 / 365, 2)
FROM t_p25513958_client_erp_developme.savings s
WHERE s.status = 'active'
  AND s.current_balance > 0
  AND s.start_date < '2026-04-30'
  AND (s.end_date IS NULL OR s.end_date >= '2026-04-30')
  AND NOT EXISTS (
      SELECT 1 FROM t_p25513958_client_erp_developme.savings_daily_accruals da
      WHERE da.saving_id = s.id AND da.accrual_date = '2026-04-30'
  );

-- Обновляем accrued_interest для затронутых вкладов
UPDATE t_p25513958_client_erp_developme.savings s
SET accrued_interest = (
    SELECT COALESCE(SUM(daily_amount), 0)
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id = s.id
),
updated_at = NOW()
WHERE s.status = 'active'
  AND s.current_balance > 0
  AND s.start_date < '2026-04-30'
  AND (s.end_date IS NULL OR s.end_date >= '2026-04-30');