-- Закрываем вклады с истёкшим сроком которые остались активными
UPDATE t_p25513958_client_erp_developme.savings
SET status = 'closed', updated_at = NOW()
WHERE status = 'active'
  AND end_date IS NOT NULL
  AND end_date < CURRENT_DATE;