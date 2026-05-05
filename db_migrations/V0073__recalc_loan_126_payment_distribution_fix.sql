-- Пересчёт разнесения платежей для займа 300-000043009102025 (id=126)
-- Сброс статусов графика
UPDATE t_p25513958_client_erp_developme.loan_schedule 
SET paid_amount = 0, paid_date = NULL, status = 'pending', payment_id = NULL
WHERE loan_id = 126 AND status NOT IN ('holiday', 'holiday_pending');

-- Платёж 1600 (05.12.2025, 9459 руб): покрывает период №1 (30.11.2025, 9458.13)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.13, paid_date = '2025-12-05', status = 'paid', payment_id = 1600
WHERE loan_id = 126 AND payment_no = 1;

-- Остаток платежа 1600: 9459 - 9458.13 = 0.87 → в основной долг
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 2991.50, interest_part = 6467.50, penalty_part = 0.00
WHERE id = 1600;

-- Платёж 1601 (21.01.2026, 9459 руб): покрывает период №2 (31.12.2025, 9458.09)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.09, paid_date = '2026-01-21', status = 'paid', payment_id = 1601
WHERE loan_id = 126 AND payment_no = 2;

-- Остаток платежа 1601: 9459 - 9458.09 = 0.91 → в основной долг
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 3088.72, interest_part = 6370.28, penalty_part = 0.00
WHERE id = 1601;

-- Платёж 1602 (27.02.2026, 18800 руб): покрывает периоды №3 (31.01.2026) и №4 (28.02.2026), остаток → основной долг
-- Период №3: 9458.05 (principal 3188.16 + interest 6269.89)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9458.05, paid_date = '2026-02-27', status = 'paid', payment_id = 1602
WHERE loan_id = 126 AND payment_no = 3;

-- Период №4: 8992.36 (principal 3129.70 + interest 5862.66)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 8992.36, paid_date = '2026-02-27', status = 'paid', payment_id = 1602
WHERE loan_id = 126 AND payment_no = 4;

-- Разнесение платежа 1602: interest = 6269.89 + 5862.66 = 12132.55, principal = 3188.16 + 3129.70 + (18800 - 9458.05 - 8992.36) = 6667.45
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 6667.45, interest_part = 12132.55, penalty_part = 0.00
WHERE id = 1602;

-- Платёж 1850 (14.04.2026, 9459 руб): покрывает период №5 (31.03.2026, 9017.14 с учётом штрафа 24.78)
-- Период №5: principal 3231.41 + interest 5760.95 + penalty 24.78 = 9017.14
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 9017.14, paid_date = '2026-04-14', status = 'paid', payment_id = 1850
WHERE loan_id = 126 AND payment_no = 5;

-- Остаток платежа 1850: 9459 - 9017.14 = 441.86 → в основной долг
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 3673.27, interest_part = 5760.95, penalty_part = 24.78
WHERE id = 1850;

-- Период №6 (30.04.2026) — теперь НЕ покрывается, остаток уходит в основной долг
-- Период №6 остаётся pending/unpaid

-- Пересчёт баланса займа
-- Paid principal: 2991.50 + 3088.72 + 6667.45 + 3673.27 = 16421.94
-- Balance = 199000 - 16421.94 = 182578.06
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 182578.06, updated_at = NOW()
WHERE id = 126;

-- Установка статуса просрочен (период №6 с датой 30.04.2026 < сегодня и unpaid)
UPDATE t_p25513958_client_erp_developme.loans
SET status = 'overdue', updated_at = NOW()
WHERE id = 126;

UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status = 'overdue', overdue_days = (CURRENT_DATE - payment_date)
WHERE loan_id = 126 AND payment_no = 6;
