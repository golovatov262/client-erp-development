-- Исправление статуса всех займов: если нет просроченных периодов, но статус 'overdue' → ставим 'active'
UPDATE t_p25513958_client_erp_developme.loans l
SET status = 'active', updated_at = NOW()
WHERE l.status = 'overdue'
  AND NOT EXISTS (
    SELECT 1 FROM t_p25513958_client_erp_developme.loan_schedule ls
    WHERE ls.loan_id = l.id
      AND ls.status IN ('pending', 'overdue', 'partial')
      AND ls.payment_date < CURRENT_DATE
  );

-- Сброс overdue_days в графике у периодов которые уже не в просрочке (статус не overdue)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'pending', overdue_days = 0
WHERE status = 'overdue'
  AND payment_date >= CURRENT_DATE;
