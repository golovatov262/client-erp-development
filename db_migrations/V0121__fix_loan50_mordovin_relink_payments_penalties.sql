-- Займ 50: восстановление связи платежей с периодами графика.
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET payment_id=m.pid, paid_amount=ls.payment_amount, paid_date=m.pdate, status='paid',
    overdue_days=GREATEST(m.pdate-ls.payment_date,0),
    penalty_amount=CASE WHEN m.pdate>ls.payment_date THEN ROUND(ls.principal_amount*0.000547*(m.pdate-ls.payment_date),2) ELSE 0 END
FROM (SELECT id pid,payment_date pdate,row_number() OVER (ORDER BY payment_date,id) rn
      FROM t_p25513958_client_erp_developme.loan_payments WHERE loan_id=50) m
WHERE ls.loan_id=50 AND ls.payment_no=m.rn AND ls.payment_no<=28;
UPDATE t_p25513958_client_erp_developme.loan_schedule SET penalty_amount=0,overdue_days=0 WHERE loan_id=50 AND payment_no>28;
UPDATE t_p25513958_client_erp_developme.loans SET status='active',updated_at=NOW() WHERE id=50;
