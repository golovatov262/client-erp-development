-- Займ 36 (100-000002508022024, Меркулов К.А.): после ручной корректировки платежей
-- периоды 27-30 закрыты фактическими платежами по 13500 (проценты), остаток ОД 718029.05,
-- график 31..132 пересчитан аннуитетом (102 периода, 20% годовых), даты сохранены.

UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET payment_amount = 13500.00,
    principal_amount = 0.00,
    interest_amount = 13500.00,
    balance_after = 718029.05,
    penalty_amount = 0,
    paid_amount = 13500.00,
    status = 'paid',
    overdue_days = 0,
    paid_date = v.pdate,
    payment_id = v.pid
FROM (VALUES
  (27, DATE '2026-06-10', 2500),
  (28, DATE '2026-07-10', 2225),
  (29, DATE '2026-08-12', 2312),
  (30, DATE '2026-09-12', 2410)
) AS v(pno, pdate, pid)
WHERE ls.loan_id = 36 AND ls.payment_no = v.pno;

WITH RECURSIVE sched AS (
  SELECT 31 AS pno,
         718029.05::numeric AS bal_before,
         ROUND(718029.05::numeric * 0.2 / 12, 2) AS interest,
         (14688.33 - ROUND(718029.05::numeric * 0.2 / 12, 2)) AS principal
  UNION ALL
  SELECT s.pno + 1,
         s.bal_before - s.principal,
         ROUND((s.bal_before - s.principal) * 0.2 / 12, 2),
         CASE WHEN s.pno + 1 = 132 THEN (s.bal_before - s.principal)
              ELSE 14688.33 - ROUND((s.bal_before - s.principal) * 0.2 / 12, 2) END
  FROM sched s WHERE s.pno < 132
),
newsched AS (
  SELECT pno,
         ROUND(principal + interest, 2) AS payment_amount,
         ROUND(principal, 2) AS principal_amount,
         interest AS interest_amount,
         ROUND(bal_before - principal, 2) AS balance_after
  FROM sched
)
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET payment_amount = ns.payment_amount,
    principal_amount = ns.principal_amount,
    interest_amount = ns.interest_amount,
    balance_after = ns.balance_after,
    penalty_amount = 0,
    status = 'pending',
    paid_amount = 0,
    paid_date = NULL,
    payment_id = NULL,
    overdue_days = 0
FROM newsched ns
WHERE ls.loan_id = 36 AND ls.payment_no = ns.pno;

UPDATE t_p25513958_client_erp_developme.loans
SET balance = 718029.05,
    monthly_payment = 14688.33,
    status = 'active',
    updated_at = NOW()
WHERE id = 36;
