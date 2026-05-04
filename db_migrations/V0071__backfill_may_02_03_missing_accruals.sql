-- Доначисление пропущенных дней 02.05 и 03.05.2026 по вкладам с пропусками
-- Формула: balance * rate / 100 / 365, округление до 2 знаков

-- Вставляем пропущенные записи (только если их нет)
INSERT INTO savings_daily_accruals (saving_id, accrual_date, balance, rate, daily_amount)
SELECT
    s.id,
    d.accrual_date,
    s.current_balance,
    s.rate,
    ROUND(s.current_balance * s.rate / 100 / 365, 2)
FROM t_p25513958_client_erp_developme.savings s
CROSS JOIN (VALUES ('2026-05-02'::date), ('2026-05-03'::date)) AS d(accrual_date)
WHERE s.id IN (22,23,45,48,51,54,63,91,110,133,135,136,137,140)
  AND s.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM t_p25513958_client_erp_developme.savings_daily_accruals a
      WHERE a.saving_id = s.id AND a.accrual_date = d.accrual_date
  );

-- Обновляем accrued_interest в savings для каждого вклада
UPDATE t_p25513958_client_erp_developme.savings s
SET accrued_interest = accrued_interest + added.total,
    updated_at = NOW()
FROM (
    SELECT saving_id, SUM(daily_amount) as total
    FROM t_p25513958_client_erp_developme.savings_daily_accruals
    WHERE saving_id IN (22,23,45,48,51,54,63,91,110,133,135,136,137,140)
      AND accrual_date IN ('2026-05-02', '2026-05-03')
      AND created_at >= NOW() - INTERVAL '1 minute'
    GROUP BY saving_id
) added
WHERE s.id = added.saving_id;
