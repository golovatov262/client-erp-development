-- Полный пересчёт разнесения платежей по займу 300-000043009102025 (id=126)
-- строго по логике кода: платёж покрывает только прошедшие периоды, остаток → в основной долг

-- 1. Сброс всего графика
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 0, paid_date = NULL, status = 'pending', payment_id = NULL
WHERE loan_id = 126 AND status NOT IN ('holiday', 'holiday_pending');

-- 2. Платёж 1600 (05.12.2025, 9459.00 руб)
--    Период №1 (30.11.2025 < 05.12.2025): нужно 9458.13 (interest 6467.50, principal 2990.63)
--    Берём 9458.13 → period paid
--    Остаток: 9459.00 - 9458.13 = 0.87 → в principal
--    pay_interest=6467.50, pay_principal=2990.63+0.87=2991.50, pay_penalty=0

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2025-12-05', status = 'paid', payment_id = 1600
WHERE loan_id = 126 AND payment_no = 1;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 2991.50, interest_part = 6467.50, penalty_part = 0.00, manual_distribution = false
WHERE id = 1600;

-- 3. Платёж 1601 (21.01.2026, 9459.00 руб)
--    Период №2 (31.12.2025 < 21.01.2026): нужно 9458.13 (interest 6370.30, principal 3087.83)
--    Берём 9458.13 → period paid
--    Остаток: 9459.00 - 9458.13 = 0.87 → в principal
--    pay_interest=6370.30, pay_principal=3087.83+0.87=3088.70, pay_penalty=0

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2026-01-21', status = 'paid', payment_id = 1601
WHERE loan_id = 126 AND payment_no = 2;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 3088.70, interest_part = 6370.30, penalty_part = 0.00, manual_distribution = false
WHERE id = 1601;

-- 4. Платёж 1602 (27.02.2026, 18800.00 руб)
--    Период №3 (31.01.2026 < 27.02.2026): нужно 9458.13 (interest 6269.95, principal 3188.18)
--    Берём 9458.13 → period paid, остаток 18800 - 9458.13 = 9341.87
--    Период №4 (28.02.2026 > 27.02.2026) — БУДУЩИЙ, стоп
--    Остаток 9341.87 → в principal
--    pay_interest=6269.95, pay_principal=3188.18+9341.87=12530.05, pay_penalty=0

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2026-02-27', status = 'paid', payment_id = 1602
WHERE loan_id = 126 AND payment_no = 3;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 12530.05, interest_part = 6269.95, penalty_part = 0.00, manual_distribution = false
WHERE id = 1602;

-- 5. Платёж 1850 (14.04.2026, 9459.00 руб)
--    Период №4 (28.02.2026 < 14.04.2026): paid_amount=0, нужно 9458.13 (interest 6166.33, principal 3291.80)
--    Берём 9458.13 → period paid, остаток 9459.00 - 9458.13 = 0.87
--    Период №5 (31.03.2026 < 14.04.2026): paid_amount=0, нужно 9458.13 (interest 6059.35, principal 3398.78, penalty 0)
--    Остаток 0.87: interest=min(0.87, 6059.35)=0.87, penalty=0, principal=0 → partial
--    pay_interest=6166.33+0.87=6167.20, pay_principal=3291.80+0=3291.80, pay_penalty=0

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2026-04-14', status = 'paid', payment_id = 1850
WHERE loan_id = 126 AND payment_no = 4;

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 0.87, paid_date = '2026-04-14', status = 'overdue', payment_id = 1850
WHERE loan_id = 126 AND payment_no = 5;

UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 3291.80, interest_part = 6167.20, penalty_part = 0.00, manual_distribution = false
WHERE id = 1850;

-- 6. Период №6 (30.04.2026 < сегодня) — не оплачен → overdue
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'overdue', overdue_days = (CURRENT_DATE - payment_date)
WHERE loan_id = 126 AND payment_no = 6 AND payment_date < CURRENT_DATE;

-- 7. Пересчёт баланса займа
--    Paid principal: 2991.50 + 3088.70 + 12530.05 + 3291.80 = 21902.05
--    Balance = 199000 - 21902.05 = 177097.95
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 177097.95, status = 'overdue', updated_at = NOW()
WHERE id = 126;
