-- Исправление платежа 29.05.2026 (id=2012) по займу 68:
-- проценты за месяц уже оплачены 17.05 (period 5). Частичное досрочное 29.05 —
-- проценты повторно НЕ удерживаются, все 23000 в основной долг. График пересчитан
-- (аннуитет на оставшиеся 40 периодов: остаток 299549.25, ставка 24.90%,
-- платёж 11094.79). Даты периодов сохранены.

-- 1. Платёж 2012: всё в ОД
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 23000.00,
    interest_part = 0.00,
    penalty_part = 0.00,
    payment_type = 'regular'
WHERE id = 2012 AND loan_id = 68;

-- 2. Пересчёт сумм по периодам 6..45 (новый аннуитет), даты не меняем
WITH RECURSIVE sched AS (
  SELECT 1 AS pno,
    299549.25::numeric AS bal_before,
    ROUND(299549.25 * (0.249/12), 2) AS interest,
    (11094.79 - ROUND(299549.25 * (0.249/12), 2))::numeric AS principal
  UNION ALL
  SELECT s.pno + 1,
    (s.bal_before - s.principal),
    ROUND((s.bal_before - s.principal) * (0.249/12), 2),
    CASE WHEN s.pno + 1 = 40 THEN (s.bal_before - s.principal)
         ELSE (11094.79 - ROUND((s.bal_before - s.principal) * (0.249/12), 2)) END
  FROM sched s WHERE s.pno < 40
),
newsched AS (
  SELECT (5 + s.pno) AS target_no,
    CASE WHEN s.pno = 40 THEN ROUND(s.principal + s.interest, 2) ELSE 11094.79 END AS payment_amount,
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
WHERE ls.loan_id = 68 AND ls.payment_no = ns.target_no;

-- 3. Параметры займа
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 299549.25,
    monthly_payment = 11094.79,
    status = 'active',
    updated_at = NOW()
WHERE id = 68;
