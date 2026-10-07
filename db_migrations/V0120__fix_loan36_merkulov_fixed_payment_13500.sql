-- Займ 36 (100-000002508022024, Меркулов К.А.): вариант 2.
-- Платёж по графику фиксируется на 13500 (как фактически платит клиент), срок увеличивается.
-- Остаток ОД 718029.05, ставка 20% годовых, периоды с 31 (31.10.2026), даты - последний день месяца.

WITH RECURSIVE s AS (
  SELECT 31 AS pno,
         718029.05::numeric AS bal_before,
         ROUND(718029.05::numeric * 0.2 / 12, 2) AS interest,
         LEAST(13500 - ROUND(718029.05::numeric * 0.2 / 12, 2), 718029.05::numeric) AS principal
  UNION ALL
  SELECT s.pno + 1,
         s.bal_before - s.principal,
         ROUND((s.bal_before - s.principal) * 0.2 / 12, 2),
         LEAST(13500 - ROUND((s.bal_before - s.principal) * 0.2 / 12, 2), s.bal_before - s.principal)
  FROM s
  WHERE s.bal_before - s.principal > 0.005
),
ns AS (
  SELECT pno,
         (date_trunc('month', DATE '2026-10-01' + ((pno - 31) * INTERVAL '1 month')) + INTERVAL '1 month - 1 day')::date AS pdate,
         ROUND(principal + interest, 2) AS payment_amount,
         ROUND(principal, 2) AS principal_amount,
         interest AS interest_amount,
         ROUND(bal_before - principal, 2) AS balance_after
  FROM s
)
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET payment_date = ns.pdate,
    payment_amount = ns.payment_amount,
    principal_amount = ns.principal_amount,
    interest_amount = ns.interest_amount,
    balance_after = ns.balance_after,
    penalty_amount = 0,
    status = 'pending',
    paid_amount = 0,
    paid_date = NULL,
    payment_id = NULL,
    overdue_days = 0
FROM ns
WHERE ls.loan_id = 36 AND ls.payment_no = ns.pno;

WITH RECURSIVE s AS (
  SELECT 31 AS pno,
         718029.05::numeric AS bal_before,
         ROUND(718029.05::numeric * 0.2 / 12, 2) AS interest,
         LEAST(13500 - ROUND(718029.05::numeric * 0.2 / 12, 2), 718029.05::numeric) AS principal
  UNION ALL
  SELECT s.pno + 1,
         s.bal_before - s.principal,
         ROUND((s.bal_before - s.principal) * 0.2 / 12, 2),
         LEAST(13500 - ROUND((s.bal_before - s.principal) * 0.2 / 12, 2), s.bal_before - s.principal)
  FROM s
  WHERE s.bal_before - s.principal > 0.005
)
INSERT INTO t_p25513958_client_erp_developme.loan_schedule
  (loan_id, payment_no, payment_date, payment_amount, principal_amount, interest_amount,
   balance_after, status, paid_amount, penalty_amount, overdue_days)
SELECT 36, pno,
       (date_trunc('month', DATE '2026-10-01' + ((pno - 31) * INTERVAL '1 month')) + INTERVAL '1 month - 1 day')::date,
       ROUND(principal + interest, 2),
       ROUND(principal, 2),
       interest,
       ROUND(bal_before - principal, 2),
       'pending', 0, 0, 0
FROM s
WHERE pno > 132
  AND EXISTS (SELECT 1 FROM t_p25513958_client_erp_developme.loans WHERE id = 36);

UPDATE t_p25513958_client_erp_developme.loans
SET balance = 718029.05,
    monthly_payment = 13500.00,
    term_months = (SELECT MAX(payment_no) FROM t_p25513958_client_erp_developme.loan_schedule WHERE loan_id = 36),
    end_date = (SELECT MAX(payment_date) FROM t_p25513958_client_erp_developme.loan_schedule WHERE loan_id = 36),
    status = 'active',
    updated_at = NOW()
WHERE id = 36;
