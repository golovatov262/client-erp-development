-- Пересчёт займа 126 по новой логике: просрочка + текущий месяц, остаток в основной долг
-- Сброс графика
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 0, paid_date = NULL, status = 'pending', payment_id = NULL
WHERE loan_id = 126 AND status NOT IN ('holiday', 'holiday_pending');

-- Платёж 1600 (05.12.2025, 9459.00): закрывает №1, 0.87 в principal
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2025-12-05', status = 'paid', payment_id = 1600
WHERE loan_id = 126 AND payment_no = 1;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 2991.50, interest_part = 6467.50, penalty_part = 0.00, manual_distribution = false
WHERE id = 1600;

-- Платёж 1601 (21.01.2026, 9459.00): закрывает №2, 0.87 в principal
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2026-01-21', status = 'paid', payment_id = 1601
WHERE loan_id = 126 AND payment_no = 2;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 3088.70, interest_part = 6370.30, penalty_part = 0.00, manual_distribution = false
WHERE id = 1601;

-- Платёж 1602 (27.02.2026, 18800.00): закрывает №3 полностью, №4 частично (9341.87)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2026-02-27', status = 'paid', payment_id = 1602
WHERE loan_id = 126 AND payment_no = 3;

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9341.87, paid_date = '2026-02-27', status = 'partial', payment_id = 1602
WHERE loan_id = 126 AND payment_no = 4;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 6363.72, interest_part = 12436.28, penalty_part = 0.00, manual_distribution = false
WHERE id = 1602;

-- Платёж 1850 (14.04.2026, 9459.00): добивает №4 (116.26), №5 частично (9342.74)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2026-04-14', status = 'paid', payment_id = 1850
WHERE loan_id = 126 AND payment_no = 4;

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9342.74, paid_date = '2026-04-14', status = 'partial', payment_id = 1850
WHERE loan_id = 126 AND payment_no = 5;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 3399.65, interest_part = 6059.35, penalty_part = 0.00, manual_distribution = false
WHERE id = 1850;

-- №5 — partial, дата прошла → overdue
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'overdue', overdue_days = (CURRENT_DATE - payment_date)
WHERE loan_id = 126 AND payment_no = 5 AND payment_date < CURRENT_DATE;

-- №6 — не оплачен, дата прошла → overdue
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'overdue', overdue_days = (CURRENT_DATE - payment_date)
WHERE loan_id = 126 AND payment_no = 6 AND payment_date < CURRENT_DATE;

-- Баланс: 199000 - (2991.50 + 3088.70 + 6363.72 + 3399.65) = 199000 - 15843.57 = 183156.43
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 183156.43, status = 'overdue', updated_at = NOW()
WHERE id = 126;
