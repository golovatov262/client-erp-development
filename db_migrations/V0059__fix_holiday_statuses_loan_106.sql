UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'holiday'
WHERE loan_id = 106
  AND status = 'pending'
  AND payment_date >= '2026-04-01'
  AND payment_date < '2026-07-01';