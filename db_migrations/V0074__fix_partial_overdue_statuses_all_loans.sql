-- Исправление статусов займов: partial просроченные периоды → overdue
-- Переводим loan_schedule.partial → overdue где дата платежа прошла
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'overdue',
    overdue_days = (CURRENT_DATE - payment_date)
WHERE status = 'partial'
  AND payment_date < CURRENT_DATE;

-- Переводим займы в overdue если есть хоть один просроченный период (pending/partial/overdue с прошедшей датой)
UPDATE t_p25513958_client_erp_developme.loans
SET status = 'overdue', updated_at = NOW()
WHERE status = 'active'
  AND id IN (
    SELECT DISTINCT loan_id FROM t_p25513958_client_erp_developme.loan_schedule
    WHERE status = 'overdue' AND payment_date < CURRENT_DATE
  );
