-- Исправление платежей по займу 26 (Епур) под единую логику разнесения.
-- Период 33 (срок 31.05.2026) на момент платежей был НЕ оплачен => это плановый
-- период текущего месяца. Платёж 21.05 покрывает проценты мая + часть ОД,
-- платёж 28.05 добивает остаток (весь в ОД, проценты уже закрыты).
-- Затем график пересчитывается (reduce_payment): остаток 778811.37, ставка 18%,
-- 27 платежей по 35292.05.

-- 1. Платёж 21.05 (id=1978): проценты мая 12031.31 + ОД 8868.69
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 8868.69, interest_part = 12031.31, penalty_part = 0.00, payment_type = 'regular'
WHERE id = 1978 AND loan_id = 26;

-- 2. Платёж 28.05 (id=2015): весь в ОД (проценты периода уже закрыты)
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 14400.00, interest_part = 0.00, penalty_part = 0.00, payment_type = 'regular'
WHERE id = 2015 AND loan_id = 26;

-- 3. Период 33 закрыт двумя платежами
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 35300.00, paid_date = DATE '2026-05-28', status = 'paid', payment_id = 2015, overdue_days = 0
WHERE loan_id = 26 AND payment_no = 33;

-- 4. Пересчёт периодов 34..60 (новый аннуитет), даты сохраняем
WITH RECURSIVE sched AS (
  SELECT 1 AS pno,
    778811.37::numeric AS bal_before,
    ROUND(778811.37 * (0.18/12), 2) AS interest,
    (35292.05 - ROUND(778811.37 * (0.18/12), 2))::numeric AS principal
  UNION ALL
  SELECT s.pno + 1,
    (s.bal_before - s.principal),
    ROUND((s.bal_before - s.principal) * (0.18/12), 2),
    CASE WHEN s.pno + 1 = 27 THEN (s.bal_before - s.principal)
         ELSE (35292.05 - ROUND((s.bal_before - s.principal) * (0.18/12), 2)) END
  FROM sched s WHERE s.pno < 27
),
newsched AS (
  SELECT (33 + s.pno) AS target_no,
    CASE WHEN s.pno = 27 THEN ROUND(s.principal + s.interest, 2) ELSE 35292.05 END AS payment_amount,
    ROUND(s.principal, 2) AS principal_amount,
    s.interest AS interest_amount,
    ROUND(s.bal_before - s.principal, 2) AS balance_after
  FROM sched s
)
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET payment_amount = ns.payment_amount,
    principal_amount = ns.principal_amount,
    interest_amount = ns.interest_amount,
    penalty_amount = 0,
    balance_after = ns.balance_after,
    status = 'pending',
    paid_amount = 0,
    paid_date = NULL,
    payment_id = NULL,
    overdue_days = 0
FROM newsched ns
WHERE ls.loan_id = 26 AND ls.payment_no = ns.target_no;

-- 5. Параметры займа
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 778811.37, monthly_payment = 35292.05, status = 'active', updated_at = NOW()
WHERE id = 26;
